import XCTest

@testable import SkyKit

/// Static guards over the native configuration the OS reads at runtime. None of this is visible
/// to a web test and most of it fails only on a real device, months later, in review.
final class NativeConfigTests: XCTestCase {
    private let infoPlistPath = "ios/App/App/Info.plist"
    private let entitlementsPath = "ios/App/App/App.entitlements"

    // #region permission prompts

    /// every OS permission the app can request, and the string the prompt shows for it
    private static let usageDescriptions = [
        "NSCameraUsageDescription",
        "NSMicrophoneUsageDescription",
        "NSPhotoLibraryUsageDescription",
        "NSLocationWhenInUseUsageDescription",
        "NSLocationAlwaysAndWhenInUseUsageDescription",
        "NSMotionUsageDescription",
        "NSHealthShareUsageDescription",
        "NSHealthUpdateUsageDescription"
    ]

    // a missing usage string is not a warning: iOS kills the process the moment the app asks
    func testEveryRequestablePermissionHasAUsageDescription() throws {
        let plist = try RepoFiles.plist(infoPlistPath)
        for key in Self.usageDescriptions {
            let value = plist[key] as? String
            XCTAssertNotNil(value, "\(key) is missing; requesting it crashes the app on device")
            XCTAssertGreaterThan(
                (value ?? "").count, 30,
                "\(key) is too short to explain anything; App Review rejects boilerplate"
            )
        }
    }

    // the android app_name bug in reverse: the prompt is the most-read copy in the app
    func testNoUsageDescriptionLeaksAnInternalHandle() throws {
        let plist = try RepoFiles.plist(infoPlistPath)
        for key in Self.usageDescriptions {
            let value = (plist[key] as? String ?? "").lowercased()
            for handle in ["sky", "crust", "mantle"] {
                XCTAssertFalse(
                    value.contains(" \(handle) "),
                    "\(key) shows the internal handle '\(handle)' to the user"
                )
            }
            XCTAssertTrue(
                value.contains("the earth app"),
                "\(key) does not name the app, so the prompt reads as someone else's"
            )
        }
    }

    // asking again after a refusal re-shows the OS prompt, and dismissing it resumes the app,
    // which asks again; that loop is what wedged the old native lane
    func testDeniedIsNeverPromptable() throws {
        let source = try RepoFiles.text("src/utils/permissions.ts")
        XCTAssertTrue(
            source.contains("state === 'prompt' || state === 'prompt-with-rationale'"),
            "canPrompt no longer restricts itself to the undecided states"
        )
        XCTAssertTrue(
            source.contains("if (anyGranted(...states)) return false;"),
            "shouldRequest no longer short-circuits on an already-granted permission"
        )
    }

    // the composables that own a permanently-deniable OS permission; adding a fourth should be
    // a deliberate edit here, not a silent new re-prompt site
    func testPermissionOwnersRouteThroughTheNoRepromptGate() throws {
        for composable in ["usePushNotifications", "useMGeolocation", "useQuestPermissions"] {
            let source = try RepoFiles.text("src/composables/\(composable).ts")
            XCTAssertTrue(
                source.contains("shouldRequest") || source.contains("isPermanentlyDenied"),
                "\(composable) requests a permission without consulting the no-reprompt gate"
            )
        }
    }

    // #endregion

    // #region launch and splash

    // launchAutoHide:false means iOS never takes the splash down on its own; if a boot branch
    // returns without calling hide(), the app sits on the splash forever
    func testSplashIsHiddenExplicitlyBecauseAutoHideIsOff() throws {
        let config = try RepoFiles.text("capacitor.config.ts")
        guard config.contains("launchAutoHide: false") else {
            return XCTFail("launchAutoHide is no longer false; revisit the manual hide contract")
        }

        let entry = try RepoFiles.text("src/pages/index.vue")
        let block = try XCTUnwrap(
            RepoFiles.matches(#"onMounted\(async \(\) => \{(.*?)\n\}\);"#, in: entry).first,
            "index.vue no longer boots from an onMounted block"
        )

        var hidSplash = false
        var returns = 0
        for line in block.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.contains("SplashScreen.hide()") { hidSplash = true }
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed == "return;" || trimmed.hasPrefix("return ") {
                returns += 1
                XCTAssertTrue(
                    hidSplash,
                    "a boot branch returns before SplashScreen.hide(); the app hangs on the splash"
                )
            }
        }
        XCTAssertGreaterThan(returns, 0, "the boot block has no early returns; re-check this guard")
        XCTAssertTrue(hidSplash, "the boot block never hides the splash")
    }

    // the scene manifest names the delegate by string; a class rename compiles and then the app
    // launches with no window at all
    func testSceneManifestPointsAtARealDelegate() throws {
        let plist = try RepoFiles.plist(infoPlistPath)
        let manifest = try XCTUnwrap(plist["UIApplicationSceneManifest"] as? [String: Any])
        let configurations = try XCTUnwrap(manifest["UISceneConfigurations"] as? [String: Any])
        let roles = try XCTUnwrap(
            configurations["UIWindowSceneSessionRoleApplication"] as? [[String: Any]]
        )
        let delegate = try XCTUnwrap(roles.first?["UISceneDelegateClassName"] as? String)
        XCTAssertEqual(delegate, "$(PRODUCT_MODULE_NAME).SceneDelegate")

        let sources = try RepoFiles.appTargetSources()
        let sceneDelegate = try XCTUnwrap(sources["SceneDelegate.swift"])
        XCTAssertTrue(sceneDelegate.contains("class SceneDelegate"))
        XCTAssertTrue(
            sceneDelegate.contains("UIWindowSceneSceneDelegate")
                || sceneDelegate.contains("UIWindowSceneDelegate"),
            "SceneDelegate no longer conforms to UIWindowSceneDelegate"
        )

        let appDelegate = try XCTUnwrap(sources["AppDelegate.swift"])
        XCTAssertTrue(
            appDelegate.contains("config.delegateClass = SceneDelegate.self"),
            "AppDelegate no longer hands the scene to SceneDelegate"
        )
    }

    // #endregion

    // #region deep links

    // the custom scheme is declared in three places that cannot see each other
    func testCustomURLSchemeMatchesWhatTheWebLayerParses() throws {
        let plist = try RepoFiles.plist(infoPlistPath)
        let types = try XCTUnwrap(plist["CFBundleURLTypes"] as? [[String: Any]])
        let schemes = types.compactMap { $0["CFBundleURLSchemes"] as? [String] }.flatMap { $0 }
        XCTAssertTrue(schemes.contains("com.earthapp.sky"), "declared schemes: \(schemes)")

        let routing = try RepoFiles.text("src/composables/useDeepLinkRouting.ts")
        for scheme in schemes {
            XCTAssertTrue(
                routing.contains("'\(scheme):'"),
                "iOS accepts \(scheme):// but useDeepLinkRouting ignores it, so the link opens "
                    + "the app and then goes nowhere"
            )
        }
    }

    // a universal link the entitlement does not claim never reaches the app at all
    func testAssociatedDomainsCoverTheAllowedUniversalLinkHosts() throws {
        let entitlements = try RepoFiles.plist(entitlementsPath)
        let domains = try XCTUnwrap(
            entitlements["com.apple.developer.associated-domains"] as? [String]
        )
        let hosts = Set(domains.compactMap { $0.split(separator: ":").last.map(String.init) })

        let routing = try RepoFiles.text("src/composables/useDeepLinkRouting.ts")
        let allowed = Set(RepoFiles.matches(#"new Set<string>\(\['([^']+)'"#, in: routing))
        XCTAssertFalse(allowed.isEmpty, "could not read the allowed host list")
        for host in allowed {
            XCTAssertTrue(
                hosts.contains(host),
                "useDeepLinkRouting trusts \(host) but no applinks: entitlement claims it"
            )
        }
    }

    // the cold-launch half: connectionOptions carry the url, and dropping them means a link
    // tapped while the app is terminated silently opens the dashboard instead
    func testSceneDelegateHandlesColdAndWarmLinks() throws {
        let sources = try RepoFiles.appTargetSources()
        let sceneDelegate = try XCTUnwrap(sources["SceneDelegate.swift"])
        XCTAssertTrue(
            sceneDelegate.contains("connectionOptions.urlContexts"),
            "cold-launch custom-scheme links are dropped"
        )
        XCTAssertTrue(
            sceneDelegate.contains("connectionOptions.userActivities"),
            "cold-launch universal links are dropped"
        )
        XCTAssertTrue(
            sceneDelegate.contains("openURLContexts URLContexts"),
            "warm custom-scheme links are dropped"
        )
        XCTAssertTrue(
            sceneDelegate.contains("continue userActivity"),
            "warm universal links are dropped"
        )
    }

    // #endregion

    // #region capabilities

    func testLiveActivitiesAreDeclaredBecauseAPluginStartsThem() throws {
        let plist = try RepoFiles.plist(infoPlistPath)
        XCTAssertEqual(
            plist["NSSupportsLiveActivities"] as? Bool, true,
            "DistanceLiveActivityPlugin ships, so Activity.request fails without this key"
        )
        XCTAssertNotNil(SkyPluginContracts.contract(jsName: "DistanceLiveActivity"))
    }

    func testHealthKitEntitlementBacksTheHealthKitPlugin() throws {
        let entitlements = try RepoFiles.plist(entitlementsPath)
        XCTAssertEqual(entitlements["com.apple.developer.healthkit"] as? Bool, true)
        XCTAssertNotNil(SkyPluginContracts.contract(jsName: "HealthKitDistance"))
    }

    func testPushIsWiredEndToEnd() throws {
        let entitlements = try RepoFiles.plist(entitlementsPath)
        XCTAssertNotNil(
            entitlements["aps-environment"] as? String,
            "no aps-environment; the device never issues an APNs token"
        )
        let plist = try RepoFiles.plist(infoPlistPath)
        let modes = plist["UIBackgroundModes"] as? [String] ?? []
        XCTAssertTrue(modes.contains("remote-notification"))

        // firebase's swizzling is off, so AppDelegate has to hand the APNs token over itself
        let sources = try RepoFiles.appTargetSources()
        let appDelegate = try XCTUnwrap(sources["AppDelegate.swift"])
        XCTAssertEqual(plist["FirebaseAppDelegateProxyEnabled"] as? Bool, false)
        XCTAssertTrue(
            appDelegate.contains("Messaging.messaging().apnsToken = deviceToken"),
            "with the proxy disabled, nothing bridges APNs to FCM"
        )
        XCTAssertTrue(
            appDelegate.contains("capacitorDidRegisterForRemoteNotifications"),
            "the FCM token never reaches the Capacitor push plugin"
        )
    }

    // every shortcut route must be a route the app can actually resolve
    func testHomeScreenShortcutsPointAtRealRoutes() throws {
        let plist = try RepoFiles.plist(infoPlistPath)
        let shortcuts = plist["UIApplicationShortcutItems"] as? [[String: Any]] ?? []
        XCTAssertFalse(shortcuts.isEmpty)
        for shortcut in shortcuts {
            let info = try XCTUnwrap(shortcut["UIApplicationShortcutItemUserInfo"] as? [String: Any])
            let route = try XCTUnwrap(info["route"] as? String)
            let page = route.hasSuffix("/") ? String(route.dropLast()) : route
            let candidates = ["src/pages\(page).vue", "src/pages\(page)/index.vue"]
            XCTAssertTrue(
                candidates.contains { FileManager.default.fileExists(atPath: RepoFiles.url($0).path) },
                "shortcut route \(route) has no page; the app opens a 404 from the home screen"
            )
        }
    }

    // #endregion
}
