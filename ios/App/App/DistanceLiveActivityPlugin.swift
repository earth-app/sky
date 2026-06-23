import ActivityKit
import Capacitor
import Foundation

@objc(DistanceLiveActivityPlugin)
public class DistanceLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DistanceLiveActivityPlugin"
    public let jsName = "DistanceLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

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

        let questId = call.getString("questId") ?? ""
        let state = contentState(from: call)
        Task {
            await self.endAllActivities()
            let attributes = DistanceActivityAttributes(questId: questId)
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
        let state = contentState(from: call)
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
    private func contentState(from call: CAPPluginCall) -> DistanceActivityAttributes.ContentState {
        DistanceActivityAttributes.ContentState(
            questName: call.getString("questName") ?? "Quest",
            rarity: call.getString("rarity") ?? "normal",
            stepIndex: call.getInt("stepIndex") ?? 0,
            totalSteps: call.getInt("totalSteps") ?? 0,
            stepLabel: call.getString("stepLabel") ?? "",
            stepSymbol: call.getString("stepSymbol") ?? "flag.checkered",
            stepDescription: call.getString("stepDescription") ?? "",
            progress: call.getDouble("progress") ?? -1,
            unlockAtMs: call.getDouble("unlockAtMs") ?? 0,
            ctaText: call.getString("ctaText") ?? "",
            ctaURL: call.getString("ctaURL") ?? "",
            tapURL: call.getString("tapURL") ?? ""
        )
    }

    @available(iOS 16.1, *)
    private func endAllActivities() async {
        for activity in Activity<DistanceActivityAttributes>.activities {
            await activity.end(using: nil, dismissalPolicy: .immediate)
        }
    }
}
