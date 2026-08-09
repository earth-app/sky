import Capacitor
import Foundation
import SkyKit
import StoreKit

/**
 Reads and repairs the app transaction - the App Store's own statement of which app this install is.

 This exists because `AppTransaction.shared` throwing is the single most useful signal when a
 catalogue comes back empty: StoreKit drops every product identifier for an install it cannot
 identify, so "no products" and "no app transaction" are one fault, not two. Apple's documented
 remedy when `shared` throws is `refresh()`, and `@capgo/native-purchases` exposes no way to call
 it, so the diagnostic could see the failure and do nothing about it.

 `refresh()` presents a system sign-in prompt, so the web layer must only call it from an explicit
 user action - Apple requires that, and the plugin cannot enforce it.
 */
@objc(StoreKitIdentityPlugin)
public class StoreKitIdentityPlugin: CAPPlugin, CAPBridgedPlugin {
    static let contract = SkyPluginContracts.storeKitIdentity

    public let identifier = contract.identifier
    public let jsName = contract.jsName
    public let pluginMethods: [CAPPluginMethod] = contract.capacitorMethods

    @objc func getAppTransaction(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("App transaction requires iOS 16.0 or later")
            return
        }
        Task { await Self.resolve(call) { try await AppTransaction.shared } }
    }

    @objc func refreshAppTransaction(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("App transaction requires iOS 16.0 or later")
            return
        }
        // MainActor: refresh() presents UI, and StoreKit rejects the call off the main actor
        Task { @MainActor in await Self.resolve(call) { try await AppTransaction.refresh() } }
    }

    /// Both entry points differ only in which API they await, so the payload and the failure
    /// vocabulary are written once - a diagnostic that reported two shapes would be worse than none.
    @available(iOS 16.0, *)
    private static func resolve(
        _ call: CAPPluginCall,
        using load: () async throws -> VerificationResult<AppTransaction>
    ) async {
        do {
            let result = try await load()
            switch result {
            case .verified(let transaction):
                await MainActor.run { call.resolve(payload(for: transaction, verified: true)) }
            case .unverified(let transaction, let error):
                // returned rather than rejected: an unverified transaction still names the app,
                // which is exactly what the caller is trying to establish
                var body = payload(for: transaction, verified: false)
                body["verificationError"] = error.localizedDescription
                await MainActor.run { call.resolve(body) }
            }
        } catch {
            await MainActor.run { call.reject(error.localizedDescription) }
        }
    }

    @available(iOS 16.0, *)
    private static func payload(for transaction: AppTransaction, verified: Bool) -> [String: Any] {
        var body: [String: Any] = [
            "verified": verified,
            "bundleId": transaction.bundleID,
            "environment": environmentName(transaction.environment),
            "originalAppVersion": transaction.originalAppVersion,
            "originalPurchaseDate": ISO8601DateFormatter().string(
                from: transaction.originalPurchaseDate
            )
        ]
        // appID is the App Store's own record id; a mismatch against the App Store Connect app
        // is the one thing a bundle-id comparison cannot catch
        if let appID = transaction.appID { body["appId"] = String(appID) }
        return body
    }

    @available(iOS 16.0, *)
    private static func environmentName(_ environment: AppStore.Environment) -> String {
        switch environment {
        case .sandbox: return "Sandbox"
        case .production: return "Production"
        case .xcode: return "Xcode"
        default: return environment.rawValue
        }
    }
}
