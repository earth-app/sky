import Capacitor
import SkyKit
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
        if WebViewRecoveryPolicy.shouldRecover(hasActivatedBefore: hasActivatedOnce) {
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
        let raw = UserDefaults.standard.string(forKey: ThemePreference.storageKey)
        window.overrideUserInterfaceStyle = ThemePreference.parse(raw).interfaceStyle
    }

    private func recoverWebViewIfTerminated() {
        guard let vc = window?.rootViewController as? CAPBridgeViewController,
              let webView = vc.webView,
              let baseURL = vc.bridge?.config.serverURL else { return }

        switch WebViewRecoveryPolicy.decide(currentURL: webView.url?.absoluteString) {
        case .reloadNow:
            webView.load(URLRequest(url: baseURL))
        case .probeThenReload:
            webView.evaluateJavaScript("1") { _, error in
                if WebViewRecoveryPolicy.shouldReloadAfterProbe(error: error) {
                    webView.load(URLRequest(url: baseURL))
                }
            }
        }
    }
}
