import Capacitor
import UIKit
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var hasActivatedOnce = false

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        applyInterfaceStyleFromSettings()

        // cold-launch deep link / universal link
        if let urlContext = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: urlContext.url,
                options: [:]
            )
        }
        if let userActivity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: userActivity,
                restorationHandler: { _ in }
            )
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        applyInterfaceStyleFromSettings()
        if hasActivatedOnce {
            recoverWebViewIfTerminated()
        }
        hasActivatedOnce = true
    }

    // warm deep links (app already running); forward to the capacitor bridge
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    // universal links while running
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    private func applyInterfaceStyleFromSettings() {
        guard let window = window else { return }
        // Capacitor Preferences stores values JSON-encoded under a "CapacitorStorage." prefix
        let raw = UserDefaults.standard.string(forKey: "CapacitorStorage.app.setting.theme")
        let theme = raw?.replacingOccurrences(of: "\"", with: "")
        switch theme {
        case "light": window.overrideUserInterfaceStyle = .light
        case "dark": window.overrideUserInterfaceStyle = .dark
        default: window.overrideUserInterfaceStyle = .unspecified
        }
    }

    private func recoverWebViewIfTerminated() {
        guard let vc = window?.rootViewController as? CAPBridgeViewController,
              let webView = vc.webView,
              let baseURL = vc.bridge?.config.serverURL else { return }

        let current = webView.url?.absoluteString
        if current == nil || current?.isEmpty == true || current?.hasPrefix("about:") == true {
            webView.load(URLRequest(url: baseURL))
            return
        }

        // url looks valid but the web-content process may be dead; a failing ping is our cue to reboot
        webView.evaluateJavaScript("1") { _, error in
            if error != nil {
                webView.load(URLRequest(url: baseURL))
            }
        }
    }
}
