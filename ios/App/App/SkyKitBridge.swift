import Capacitor
import Foundation
import HealthKit
import SkyKit
import UIKit

extension CAPPluginCall {
    /// `getDouble` is a plain `as? Double`, so a whole-number option only survives because the
    /// bridge boxes it; read both shapes rather than depend on that
    func getNumber(_ key: String) -> Double? {
        getDouble(key) ?? getInt(key).map(Double.init)
    }
}

/// Adapts a bridge call to the option reader SkyKit tests can drive from a dictionary.
struct PluginCallOptions: LiveActivityOptions {
    let call: CAPPluginCall

    func optionalString(_ key: String) -> String? { call.getString(key) }
    func optionalInt(_ key: String) -> Int? { call.getInt(key) }
    func optionalDouble(_ key: String) -> Double? { call.getNumber(key) }
}

extension SkyPluginContract {
    /// the bridge's method table, derived from the one contract instead of a second list
    var capacitorMethods: [CAPPluginMethod] {
        methods.map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    }
}

extension ThemePreference {
    var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return .unspecified
        }
    }
}

extension HealthDistanceType {
    // exhaustive on purpose: a new case fails the build here rather than going silently unread
    var quantityType: HKQuantityType? {
        switch self {
        case .walkingRunning:
            return HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)
        case .cycling:
            return HKObjectType.quantityType(forIdentifier: .distanceCycling)
        case .wheelchair:
            return HKObjectType.quantityType(forIdentifier: .distanceWheelchair)
        case .swimming:
            return HKObjectType.quantityType(forIdentifier: .distanceSwimming)
        case .downhillSnowSports:
            return HKObjectType.quantityType(forIdentifier: .distanceDownhillSnowSports)
        case .skatingSports:
            guard #available(iOS 18.0, *) else { return nil }
            return HKObjectType.quantityType(forIdentifier: .distanceSkatingSports)
        }
    }

    static var supportedForThisOS: [HealthDistanceType] {
        if #available(iOS 18.0, *) { return supported(iOS18Available: true) }
        return supported(iOS18Available: false)
    }
}
