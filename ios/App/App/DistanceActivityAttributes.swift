import ActivityKit
import Foundation

struct DistanceActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var questName: String
        var rarity: String
        var stepIndex: Int
        var totalSteps: Int
        var stepLabel: String
        var stepSymbol: String
        var stepDescription: String
        var progress: Double
        var unlockAtMs: Double
        var ctaText: String
        var ctaURL: String
        var tapURL: String
    }

    var questId: String
}
