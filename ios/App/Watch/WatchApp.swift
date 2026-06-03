//
//  WatchApp.swift
//  Watch
//
//  Entry point for the Earth App watchOS companion. Wires the
//  WKApplicationDelegate adaptor that activates WCSession and bridges
//  iPhone-originated notifications onto the wrist via UNUserNotificationCenter.
//  See NotificationBridge.swift for the receive + present pipeline.
//

import SwiftUI

@main
struct WatchApp: App {
    @WKApplicationDelegateAdaptor(NotificationBridgeWatchDelegate.self)
    private var watchDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
