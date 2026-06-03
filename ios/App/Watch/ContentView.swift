//
//  ContentView.swift
//  Watch
//
//  Minimal companion view. The watch app's primary job today is to receive
//  iPhone-originated notifications and surface them via the system notification
//  center (see NotificationBridge.swift). Future iterations can replace this
//  with a live quest/distance dashboard.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "globe")
                .imageScale(.large)
                .foregroundStyle(.tint)
            Text("The Earth App")
                .font(.headline)
            Text("Notifications will appear on your wrist.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
