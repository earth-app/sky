import Foundation

/**
 One custom Capacitor plugin's bridge surface.

 The bridge dispatches by string: JS calls `HealthKitDistance.startObserving()`, Capacitor looks
 the name up in `pluginMethods` and invokes the matching `@objc` selector. Nothing in the type
 system connects those three, so renaming any one of them compiles clean and fails at runtime.
 Declaring the surface once, here, is what makes that break visible.

 @since 1.0.4
 */
public struct SkyPluginContract: Sendable, Equatable {
    /// the `@objc(...)` class name; also what `MainViewController` registers
    public let identifier: String
    /// the name JS passes to `registerPlugin(...)`
    public let jsName: String
    public let methods: [String]
    /// `notifyListeners` event names the web layer subscribes to
    public let events: [String]

    public init(identifier: String, jsName: String, methods: [String], events: [String] = []) {
        self.identifier = identifier
        self.jsName = jsName
        self.methods = methods
        self.events = events
    }

    /// what an `@objc func foo(_ call: CAPPluginCall)` selector looks like for `foo`
    public func selectorName(for method: String) -> String {
        method + ":"
    }
}

/**
 Every custom plugin the iOS app registers.

 @since 1.0.4
 */
public enum SkyPluginContracts {
    public static let healthKitDistance = SkyPluginContract(
        identifier: "HealthKitDistancePlugin",
        jsName: "HealthKitDistance",
        methods: [
            "isAvailable",
            "requestAuthorization",
            "getActivityDistance",
            "startObserving",
            "stopObserving"
        ],
        events: ["healthKitUpdate"]
    )

    public static let distanceLiveActivity = SkyPluginContract(
        identifier: "DistanceLiveActivityPlugin",
        jsName: "DistanceLiveActivity",
        methods: ["isSupported", "start", "update", "end"]
    )

    /// `AppTransaction` is the only thing that reports which app the App Store believes this
    /// install is, and `@capgo/native-purchases` exposes no way to refresh it after `shared` throws
    public static let storeKitIdentity = SkyPluginContract(
        identifier: "StoreKitIdentityPlugin",
        jsName: "StoreKitIdentity",
        methods: ["getAppTransaction", "refreshAppTransaction"]
    )

    public static let all: [SkyPluginContract] = [
        healthKitDistance,
        distanceLiveActivity,
        storeKitIdentity
    ]

    public static func contract(jsName: String) -> SkyPluginContract? {
        all.first { $0.jsName == jsName }
    }
}
