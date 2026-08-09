import Foundation

/**
 What to do with the web view when the scene becomes active again.

 WKWebView's content process can be reclaimed while the app is backgrounded, and the app comes
 back to a blank white screen that only a relaunch clears. This is the decision half of that
 recovery; the reload itself needs a real `WKWebView`.

 @since 1.0.4
 */
public enum WebViewRecovery: Equatable, Sendable {
    /// no usable url; reload the server url straight away
    case reloadNow
    /// the url looks fine, but the content process may still be dead; probe it first
    case probeThenReload
}

/**
 The rules `SceneDelegate` follows on `sceneDidBecomeActive`.

 @since 1.0.4
 */
public enum WebViewRecoveryPolicy {
    /// the first activation IS the cold launch, where an unloaded web view is normal
    public static func shouldRecover(hasActivatedBefore: Bool) -> Bool {
        hasActivatedBefore
    }

    /// `about:blank` counts as no url; that is what a reclaimed content process leaves behind
    public static func decide(currentURL: String?) -> WebViewRecovery {
        guard let currentURL, !currentURL.isEmpty, !currentURL.hasPrefix("about:") else {
            return .reloadNow
        }
        return .probeThenReload
    }

    /// a failing javascript probe is the only signal a live-looking url is actually dead
    public static func shouldReloadAfterProbe(error: Error?) -> Bool {
        error != nil
    }
}
