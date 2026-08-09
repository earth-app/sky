import StoreKit
import StoreKitTest
import XCTest

/// The control for `StoreKitPurchaseTests`.
///
/// `Minimal.storekit` is a hand-written, 40-line configuration holding one subscription and none of
/// the debug toggles the App Store Connect-synced file carries. Its only job is to answer "is this
/// machine capable of running StoreKitTest at all", so a broken simulator runtime cannot be
/// mistaken for a broken product catalogue. That confusion cost a day: on the iOS 26.5 runtime every
/// `SKTestSession` call returns `SKInternalErrorDomain Code=3` and the storefront comes back empty,
/// which reads exactly like "no products", while iOS 26.2 runs the same binary fine.
@available(iOS 15.0, *)
final class StoreKitEnvironmentTests: XCTestCase {
	func testTheStoreKitTestDaemonIsAlive() async throws {
		let session = try SKTestSession(configurationFileNamed: "Minimal")
		session.disableDialogs = true

		XCTAssertFalse(
			session.storefront.isEmpty,
			"""
			the StoreKit test daemon on this simulator runtime is not serving sessions \
			(look for 'SKInternalErrorDomain Code=3' above). this is an environment fault, not a \
			product one; pin a working runtime with NATIVE_IOS_DEVICE=<udid>
			"""
		)
	}

	func testTheControlConfigurationServesItsProduct() async throws {
		let session = try SKTestSession(configurationFileNamed: "Minimal")
		session.disableDialogs = true
		try XCTSkipIf(session.storefront.isEmpty, "the StoreKit test daemon is unavailable here")

		let products = try await Product.products(for: ["com.earthapp.sky.pro.monthly"])
		XCTAssertEqual(
			products.map(\.id),
			["com.earthapp.sky.pro.monthly"],
			"a hand-written configuration must resolve; if this fails the fault is the environment"
		)
	}
}
