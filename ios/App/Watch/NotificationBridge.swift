//
//  NotificationBridge.swift
//  Watch
//
//  Bridges iPhone-originated notifications onto the wrist. Wired in via
//  @WKApplicationDelegateAdaptor in WatchApp.swift.

import Foundation
import UserNotifications
import WatchConnectivity
import WatchKit

public final class NotificationBridgeWatchDelegate: NSObject, WKApplicationDelegate, WCSessionDelegate, UNUserNotificationCenterDelegate {

    public func applicationDidFinishLaunching() {
        UNUserNotificationCenter.current().delegate = self
        activateSession()
    }

    public func applicationDidBecomeActive() {
        // WCSession can deactivate when the watch sleeps; bring it back when
        // the user opens the app or it wakes for a delivered notification.
        activateSession()
    }

    private func activateSession() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        if session.activationState != .activated {
            session.delegate = self
            session.activate()
        }
    }

    // MARK: WCSession - message + user info reception

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error = error {
            NSLog("[WatchBridge] activation error: \(error.localizedDescription)")
        }
    }

    // Interactive messages; phone is reachable and watch app is running.
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleIncoming(message)
    }

    // Queued, durable transfers; survives off-wrist / out-of-range periods.
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleIncoming(userInfo)
    }

    private func handleIncoming(_ payload: [String: Any]) {
        guard (payload["type"] as? String) == "notification.deliver" else { return }
        guard let id = payload["id"] as? String,
              let title = payload["title"] as? String else { return }
        let body = payload["body"] as? String ?? ""
        let link = payload["link"] as? String ?? ""

        requestAuthorizationIfNeeded { granted in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            if !link.isEmpty {
                content.userInfo = ["link": link, "id": id]
            } else {
                content.userInfo = ["id": id]
            }
            // Trigger immediately. A nil trigger means "deliver right now" but
            // requires the notification request to be added when the app isn't
            // foreground; an interval trigger of 0.1s works in both states.
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
            let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
            UNUserNotificationCenter.current().add(request) { error in
                if let error = error {
                    NSLog("[WatchBridge] notification add failed: \(error.localizedDescription)")
                }
            }
        }
    }

    private func requestAuthorizationIfNeeded(_ completion: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                completion(true)
            case .denied:
                completion(false)
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    completion(granted)
                }
            @unknown default:
                completion(false)
            }
        }
    }

    // Foreground presentation: show the banner + sound even when the watch
    // app happens to be open.
    public func userNotificationCenter(_ center: UNUserNotificationCenter,
                                       willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    // Required WCSession stubs for some watchOS versions.
    public func sessionReachabilityDidChange(_ session: WCSession) {}
}
