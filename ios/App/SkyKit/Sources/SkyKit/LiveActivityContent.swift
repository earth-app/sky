import Foundation

/**
 The subset of a plugin call the Live Activity needs, so the defaults are testable without
 Capacitor.

 `CAPPluginCall` conforms to this in the app target; tests use ``LiveActivityOptionsDictionary``.

 @since 1.0.4
 */
public protocol LiveActivityOptions {
    func optionalString(_ key: String) -> String?
    func optionalInt(_ key: String) -> Int?
    func optionalDouble(_ key: String) -> Double?
}

/**
 A plain-dictionary ``LiveActivityOptions``, matching how the bridge hands JS values over.

 @since 1.0.4
 */
public struct LiveActivityOptionsDictionary: LiveActivityOptions {
    private let values: [String: Any]

    public init(_ values: [String: Any]) {
        self.values = values
    }

    public func optionalString(_ key: String) -> String? {
        values[key] as? String
    }

    // js numbers cross the bridge as NSNumber, so an Int cast alone drops them
    public func optionalInt(_ key: String) -> Int? {
        if let value = values[key] as? Int { return value }
        if let value = values[key] as? NSNumber { return value.intValue }
        return nil
    }

    public func optionalDouble(_ key: String) -> Double? {
        if let value = values[key] as? Double { return value }
        if let value = values[key] as? NSNumber { return value.doubleValue }
        return nil
    }
}

/**
 Everything the quest Live Activity renders, with the defaults applied.

 Every field has a default because the JS caller is allowed to send a partial payload; a missing
 key must degrade the widget, never fail the call.

 @since 1.0.4
 */
public struct LiveActivityContent: Equatable, Sendable {
    public static let defaultQuestName = "Quest"
    public static let defaultRarity = "normal"
    public static let defaultStepSymbol = "flag.checkered"
    /// the sentinel that tells the widget to draw no progress bar at all
    public static let noProgress: Double = -1

    public let questId: String
    public let questName: String
    public let rarity: String
    public let stepIndex: Int
    public let totalSteps: Int
    public let stepLabel: String
    public let stepSymbol: String
    public let stepDescription: String
    public let progress: Double
    public let unlockAtMs: Double
    public let ctaText: String
    public let ctaURL: String
    public let tapURL: String

    public init(
        questId: String = "",
        questName: String = LiveActivityContent.defaultQuestName,
        rarity: String = LiveActivityContent.defaultRarity,
        stepIndex: Int = 0,
        totalSteps: Int = 0,
        stepLabel: String = "",
        stepSymbol: String = LiveActivityContent.defaultStepSymbol,
        stepDescription: String = "",
        progress: Double = LiveActivityContent.noProgress,
        unlockAtMs: Double = 0,
        ctaText: String = "",
        ctaURL: String = "",
        tapURL: String = ""
    ) {
        self.questId = questId
        self.questName = questName
        self.rarity = rarity
        self.stepIndex = stepIndex
        self.totalSteps = totalSteps
        self.stepLabel = stepLabel
        self.stepSymbol = stepSymbol
        self.stepDescription = stepDescription
        self.progress = progress
        self.unlockAtMs = unlockAtMs
        self.ctaText = ctaText
        self.ctaURL = ctaURL
        self.tapURL = tapURL
    }

    public init(options: LiveActivityOptions) {
        self.init(
            questId: options.optionalString("questId") ?? "",
            questName: options.optionalString("questName") ?? Self.defaultQuestName,
            rarity: options.optionalString("rarity") ?? Self.defaultRarity,
            stepIndex: options.optionalInt("stepIndex") ?? 0,
            totalSteps: options.optionalInt("totalSteps") ?? 0,
            stepLabel: options.optionalString("stepLabel") ?? "",
            stepSymbol: options.optionalString("stepSymbol") ?? Self.defaultStepSymbol,
            stepDescription: options.optionalString("stepDescription") ?? "",
            progress: options.optionalDouble("progress") ?? Self.noProgress,
            unlockAtMs: options.optionalDouble("unlockAtMs") ?? 0,
            ctaText: options.optionalString("ctaText") ?? "",
            ctaURL: options.optionalString("ctaURL") ?? "",
            tapURL: options.optionalString("tapURL") ?? ""
        )
    }
}
