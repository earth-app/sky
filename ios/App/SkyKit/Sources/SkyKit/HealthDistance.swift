import Foundation

/**
 The distance quantity types quest progress reads from Apple Health.

 Kept as a plain enum rather than `HKQuantityTypeIdentifier` so the list, and the OS gate on it,
 are testable without HealthKit. The app maps each case with an exhaustive `switch`, so adding a
 case here fails the build until it is mapped.

 @since 1.0.4
 */
public enum HealthDistanceType: String, CaseIterable, Sendable {
    case walkingRunning
    case cycling
    case wheelchair
    case swimming
    case downhillSnowSports
    case skatingSports

    /// skating-sports distance did not exist before iOS 18
    public var requiresIOS18: Bool {
        self == .skatingSports
    }

    public static func supported(iOS18Available: Bool) -> [HealthDistanceType] {
        allCases.filter { iOS18Available || !$0.requiresIOS18 }
    }
}

/**
 What `getActivityDistance` should do before it touches HealthKit.

 @since 1.0.4
 */
public enum HealthDistancePlan: Equatable, Sendable {
    /// the device has no health store at all (iPad, simulator without Health)
    case unavailable
    /// the caller omitted a bound; this is a programming error, so the call is rejected
    case missingRange
    /// a zero-or-negative window; a real answer of 0, not a query
    case emptyRange
    case query(start: Date, end: Date)
}

/**
 The resolved shape `getActivityDistance` sends back over the bridge.

 `payload` is the literal JS contract: `useHealthKit.ts` destructures `distance`, `source` and
 `workoutCount`, so a rename here is a silent runtime break on the web side.

 @since 1.0.4
 */
public enum HealthDistanceResult: Equatable, Sendable {
    case unavailable
    case emptyRange
    case workouts(meters: Double, count: Int)
    case samples(meters: Double)

    public var source: String {
        switch self {
        case .unavailable: return "unavailable"
        case .emptyRange: return "empty-range"
        case .workouts: return "workouts"
        case .samples: return "samples"
        }
    }

    public var payload: [String: Any] {
        switch self {
        case .unavailable:
            return ["distance": NSNull(), "source": source]
        case .emptyRange:
            return ["distance": 0, "source": source]
        case let .workouts(meters, count):
            return ["distance": meters, "source": source, "workoutCount": count]
        case let .samples(meters):
            return ["distance": meters, "source": source]
        }
    }
}

/**
 The pure decisions behind `HealthKitDistancePlugin`.

 @since 1.0.4
 */
public enum HealthDistance {
    public static let missingRangeMessage = "start and end (milliseconds since epoch) are required"

    public static func plan(
        healthDataAvailable: Bool,
        startMs: Double?,
        endMs: Double?
    ) -> HealthDistancePlan {
        guard healthDataAvailable else { return .unavailable }
        guard let startMs, let endMs else { return .missingRange }
        guard endMs > startMs else { return .emptyRange }
        return .query(
            start: Date(timeIntervalSince1970: startMs / 1000),
            end: Date(timeIntervalSince1970: endMs / 1000)
        )
    }

    /// workouts carry an optional distance; the ones without contribute nothing
    public static func totalWorkoutMeters(_ distances: [Double?]) -> Double {
        distances.compactMap { $0 }.reduce(0, +)
    }

    /**
     Workouts win when they have any distance at all.

     Distance samples would double-count the same movement the workout already recorded, so they
     are a fallback and never an addition.

     @since 1.0.4
     */
    public static func workoutResult(meters: Double, count: Int) -> HealthDistanceResult? {
        meters > 0 ? .workouts(meters: meters, count: count) : nil
    }

    /**
     The sample-query outcome.

     A zero total is a valid answer (nobody moved, or read access silently returns nothing), so an
     error alongside it is logged and never rejected: rejecting would surface a false failure to a
     caller whose real answer is "no distance yet".

     @since 1.0.4
     */
    public static func sampleOutcome(
        total: Double,
        firstError: Error?
    ) -> (result: HealthDistanceResult, warning: String?) {
        let warning: String?
        if total <= 0, let firstError {
            warning = "[HealthKit] distance sample query error (returning 0): "
                + firstError.localizedDescription
        } else {
            warning = nil
        }
        return (.samples(meters: total), warning)
    }
}
