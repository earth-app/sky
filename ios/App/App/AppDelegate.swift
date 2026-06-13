import UIKit
import Capacitor
import CapacitorBackgroundRunner
import CoreLocation
import FirebaseCore
import FirebaseMessaging
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, CLLocationManagerDelegate {

    var window: UIWindow?

    private var hasActivatedOnce = false

    private lazy var slcManager: CLLocationManager = {
        let m = CLLocationManager()
        m.delegate = self
        m.allowsBackgroundLocationUpdates = true
        m.pausesLocationUpdatesAutomatically = false
        return m
    }()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        // Register the BGTaskScheduler identifier and re-arm pending tasks so the
        // distance-tracker runner keeps firing across app restarts.
        BackgroundRunnerPlugin.registerBackgroundTask()
        BackgroundRunnerPlugin.handleApplicationDidFinishLaunching(launchOptions: launchOptions)

        startSignificantLocationMonitoring()

        // If iOS relaunched us via an SLC delivery (app was terminated), the
        // launchOptions dict carries the location key — start monitoring again
        // and the delegate will be called with the queued positions.
        if launchOptions?[.location] != nil {
           startSignificantLocationMonitoring()
        }

        // Match the window (and therefore UIColor.systemBackground, which sits behind
        // the webview) to the in-app theme before the first frame paints.
        applyInterfaceStyleFromSettings()
    	return true
    }

    private func startSignificantLocationMonitoring() {
        guard CLLocationManager.significantLocationChangeMonitoringAvailable() else { return }
        // SLC works with either alwaysAuth or whenInUseAuth (with background mode).
        // We rely on whichever the user already granted — don't escalate the prompt
        // from here; the quest step UI owns that flow.
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = slcManager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        guard status == .authorizedAlways || status == .authorizedWhenInUse else { return }
        slcManager.startMonitoringSignificantLocationChanges()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        // Hand the position to the background runner so it folds the SLC sample
        // into the same session state that BGTaskScheduler ticks write. Passing
        // lat/lon in eventArgs avoids the cold getCurrentPosition() roundtrip
        // inside the runner.
        let args: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "source": "slc"
        ]
        BackgroundRunnerPlugin.dispatchEvent(event: "distanceTick", eventArgs: args) { _ in }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Non-fatal — the runner still has BGTaskScheduler ticks and the user's
        // foreground pedometer. Just log so the issue is visible in console.
        NSLog("[AppDelegate] SLC error: \(error.localizedDescription)")
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // Authorization can land asynchronously after the user accepts the OS
        // prompt from the distance step flow. Kick monitoring on as soon as
        // it's available rather than waiting for the next app launch.
        startSignificantLocationMonitoring()
    }

	func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
		Messaging.messaging().apnsToken = deviceToken
		Messaging.messaging().token(completion: { (token, error) in
		  if let error = error {
			  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
		  } else if let token = token {
			  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
		  }
		})
	}

	func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
		NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
	}

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        applyInterfaceStyleFromSettings()
        if hasActivatedOnce {
            recoverWebViewIfTerminated()
        }
        hasActivatedOnce = true
    }

    private func applyInterfaceStyleFromSettings() {
        guard let window = window else { return }
        // Capacitor Preferences stores values JSON-encoded under a "CapacitorStorage." prefix.
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

        // URL looks valid but the process may still be dead — a terminated process
        // can't run JS, so a failing ping is our cue to reboot the SPA.
        webView.evaluateJavaScript("1") { _, error in
            if error != nil {
                webView.load(URLRequest(url: baseURL))
            }
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
