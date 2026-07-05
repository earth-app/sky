import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
    	return true
    }

    // scene lifecycle: the window + theme/web-recovery + deep links live in SceneDelegate
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
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

}
