import ActivityKit
import Capacitor
import Foundation
import SkyKit

@objc(DistanceLiveActivityPlugin)
public class DistanceLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    static let contract = SkyPluginContracts.distanceLiveActivity

    public let identifier = contract.identifier
    public let jsName = contract.jsName
    public let pluginMethods: [CAPPluginMethod] = contract.capacitorMethods

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1 or later")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are disabled in Settings")
            return
        }

        let content = LiveActivityContent(options: PluginCallOptions(call: call))
        let state = Self.contentState(from: content)
        Task {
            await self.endAllActivities()
            let attributes = DistanceActivityAttributes(questId: content.questId)
            do {
                let activity = try Activity.request(
                    attributes: attributes,
                    contentState: state,
                    pushType: nil
                )
                call.resolve(["activityId": activity.id])
            } catch {
                call.reject("Failed to start Live Activity: \(error.localizedDescription)")
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        let state = Self.contentState(from: LiveActivityContent(options: PluginCallOptions(call: call)))
        Task {
            for activity in Activity<DistanceActivityAttributes>.activities {
                await activity.update(using: state)
            }
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        Task {
            await self.endAllActivities()
            call.resolve()
        }
    }

    @available(iOS 16.1, *)
    static func contentState(from content: LiveActivityContent) -> DistanceActivityAttributes.ContentState {
        DistanceActivityAttributes.ContentState(
            questName: content.questName,
            rarity: content.rarity,
            stepIndex: content.stepIndex,
            totalSteps: content.totalSteps,
            stepLabel: content.stepLabel,
            stepSymbol: content.stepSymbol,
            stepDescription: content.stepDescription,
            progress: content.progress,
            unlockAtMs: content.unlockAtMs,
            ctaText: content.ctaText,
            ctaURL: content.ctaURL,
            tapURL: content.tapURL
        )
    }

    @available(iOS 16.1, *)
    private func endAllActivities() async {
        for activity in Activity<DistanceActivityAttributes>.activities {
            await activity.end(using: nil, dismissalPolicy: .immediate)
        }
    }
}
