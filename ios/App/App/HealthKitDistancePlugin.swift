import Capacitor
import Foundation
import HealthKit

@objc(HealthKitDistancePlugin)
public class HealthKitDistancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitDistancePlugin"
    public let jsName = "HealthKitDistance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActivityDistance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startObserving", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopObserving", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private var observerQueries: [HKObserverQuery] = []

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }

        var readTypes = Set<HKObjectType>()
        readTypes.insert(HKObjectType.workoutType())
        if let t = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { readTypes.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .distanceCycling) { readTypes.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .distanceWheelchair) { readTypes.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .distanceSwimming) { readTypes.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .distanceDownhillSnowSports) { readTypes.insert(t) }
        // skating sports distance is iOS 18+
        if #available(iOS 18.0, *) {
            if let t = HKObjectType.quantityType(forIdentifier: .distanceSkatingSports) { readTypes.insert(t) }
        }

        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                call.reject("HealthKit authorization failed: \(error.localizedDescription)")
                return
            }
            // HKHealthStore can return success=true with no actual grant when the
            // user denies ; there is no API to inspect read authorization status
            // directly (Apple's privacy stance). The caller infers grant from the
            // distance-query result: zero/null distance means we either weren't
            // granted access or the user did nothing during the window.
            call.resolve(["granted": success])
        }
    }

    @objc func getActivityDistance(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve([
                "distance": NSNull(),
                "source": "unavailable"
            ])
            return
        }

        guard let startMs = call.getDouble("start"), let endMs = call.getDouble("end") else {
            call.reject("start and end (milliseconds since epoch) are required")
            return
        }
        if endMs <= startMs {
            call.resolve(["distance": 0, "source": "empty-range"])
            return
        }

        let startDate = Date(timeIntervalSince1970: startMs / 1000)
        let endDate = Date(timeIntervalSince1970: endMs / 1000)
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [])

        let workoutQuery = HKSampleQuery(
            sampleType: .workoutType(),
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { [weak self] _, samples, error in
            guard let self = self else { return }
            if let error = error {
                call.reject("workout query failed: \(error.localizedDescription)")
                return
            }
            let workouts = (samples as? [HKWorkout]) ?? []
            var workoutMeters: Double = 0
            for workout in workouts {
                if let distance = workout.totalDistance {
                    workoutMeters += distance.doubleValue(for: HKUnit.meter())
                }
            }

            if workoutMeters > 0 {
                call.resolve([
                    "distance": workoutMeters,
                    "source": "workouts",
                    "workoutCount": workouts.count
                ])
                return
            }

            self.fallbackToDistanceSamples(predicate: predicate, call: call)
        }
        healthStore.execute(workoutQuery)
    }

    @objc func startObserving(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["started": false])
            return
        }
        stopObservingInternal()

        // workout completions only ; distance-sample observers would fire mid-activity and
        // double-count against the live pedometer; workout distance is final at workout end
        let types: [HKSampleType] = [HKObjectType.workoutType()]

        for type in types {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
                if error == nil {
                    self?.notifyListeners("healthKitUpdate", data: [:])
                }
                completionHandler()
            }
            healthStore.execute(query)
            observerQueries.append(query)
        }
        call.resolve(["started": true])
    }

    @objc func stopObserving(_ call: CAPPluginCall) {
        stopObservingInternal()
        call.resolve()
    }

    private func stopObservingInternal() {
        for query in observerQueries {
            healthStore.stop(query)
        }
        observerQueries.removeAll()
    }

    private func fallbackToDistanceSamples(predicate: NSPredicate, call: CAPPluginCall) {
        var typeIds: [HKQuantityTypeIdentifier] = [
            .distanceWalkingRunning,
            .distanceCycling,
            .distanceWheelchair,
            .distanceSwimming,
            .distanceDownhillSnowSports
        ]
        if #available(iOS 18.0, *) {
            typeIds.append(.distanceSkatingSports)
        }

        let group = DispatchGroup()
        var total: Double = 0
        var firstError: Error? = nil
        let lock = NSLock()

        for identifier in typeIds {
            guard let qtype = HKObjectType.quantityType(forIdentifier: identifier) else { continue }
            group.enter()
            let q = HKStatisticsQuery(
                quantityType: qtype,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, result, error in
                defer { group.leave() }
                if let error = error {
                    lock.lock()
                    if firstError == nil { firstError = error }
                    lock.unlock()
                    return
                }
                if let sum = result?.sumQuantity() {
                    let meters = sum.doubleValue(for: HKUnit.meter())
                    lock.lock()
                    total += meters
                    lock.unlock()
                }
            }
            healthStore.execute(q)
        }

        group.notify(queue: .main) {
            // a zero result is a valid answer (no movement yet, or read access returns empty), NOT a
            // failure ; only log the error; rejecting would surface a false error to the JS caller
            if total <= 0, let err = firstError {
                print("[HealthKit] distance sample query error (returning 0): \(err.localizedDescription)")
            }
            call.resolve([
                "distance": total,
                "source": "samples"
            ])
        }
    }
}
