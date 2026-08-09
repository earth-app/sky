import Capacitor
import Foundation
import HealthKit
import SkyKit

@objc(HealthKitDistancePlugin)
public class HealthKitDistancePlugin: CAPPlugin, CAPBridgedPlugin {
    static let contract = SkyPluginContracts.healthKitDistance

    public let identifier = contract.identifier
    public let jsName = contract.jsName
    public let pluginMethods: [CAPPluginMethod] = contract.capacitorMethods

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
        for type in HealthDistanceType.supportedForThisOS {
            if let quantityType = type.quantityType { readTypes.insert(quantityType) }
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
        let plan = HealthDistance.plan(
            healthDataAvailable: HKHealthStore.isHealthDataAvailable(),
            startMs: call.getNumber("start"),
            endMs: call.getNumber("end")
        )

        let startDate: Date
        let endDate: Date
        switch plan {
        case .unavailable:
            call.resolve(HealthDistanceResult.unavailable.payload)
            return
        case .missingRange:
            call.reject(HealthDistance.missingRangeMessage)
            return
        case .emptyRange:
            call.resolve(HealthDistanceResult.emptyRange.payload)
            return
        case let .query(start, end):
            startDate = start
            endDate = end
        }

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
            let workoutMeters = HealthDistance.totalWorkoutMeters(
                workouts.map { $0.totalDistance?.doubleValue(for: HKUnit.meter()) }
            )

            if let result = HealthDistance.workoutResult(
                meters: workoutMeters,
                count: workouts.count
            ) {
                call.resolve(result.payload)
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
        let group = DispatchGroup()
        var total: Double = 0
        var firstError: Error? = nil
        let lock = NSLock()

        for type in HealthDistanceType.supportedForThisOS {
            guard let qtype = type.quantityType else { continue }
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
            let outcome = HealthDistance.sampleOutcome(total: total, firstError: firstError)
            if let warning = outcome.warning { print(warning) }
            call.resolve(outcome.result.payload)
        }
    }
}
