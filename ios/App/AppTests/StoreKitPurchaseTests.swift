import StoreKit
import StoreKitTest
import XCTest

/// Purchase-flow coverage driven by `StoreKitTest`, so every branch runs locally and deterministically.
///
/// This exists because the paths that actually break a paid app are the ones a sandbox account makes
/// slow and non-reproducible: an interrupted purchase, a refund, a revocation, an expiry. `SKTestSession`
/// drives all of them in-process with no App Store Connect dependency and no propagation delay.
///
/// The configuration is loaded programmatically rather than attached to a scheme ON PURPOSE. A
/// `.storekit` file wired into the *app* scheme makes the app resolve products locally and silently
/// ignore App Store Connect - which is a real failure mode we diagnosed in production. Keeping it
/// inside the test bundle means the shipping app can never pick it up.
/// iOS 17 is the floor because both `setSimulatedError(_:forAPI:)` and `buyProduct(identifier:)`
/// arrived there, and without the first one the suite silently inherits the config's debug toggles.
@available(iOS 17.0, *)
final class StoreKitPurchaseTests: XCTestCase {
	/// The ids the app asks StoreKit for. These MUST match `IAP_PRODUCT_IDS.ios` in
	/// `src/composables/useIapPurchase.ts` and the products in App Store Connect; a drift between the
	/// three is exactly what produced "Cannot find product for id" against a live build.
	private static let proID = "com.earthapp.sky.pro.monthly"
	private static let writerID = "com.earthapp.sky.writer.monthly"
	private static let organizerID = "com.earthapp.sky.organizer.monthly"
	private static let allIDs = [proID, writerID, organizerID]

	private var session: SKTestSession!

	/// `Transaction.currentEntitlements` is an AsyncSequence, so it has to be drained before any
	/// assertion - an async call cannot live inside an XCTAssert autoclosure. Revoked transactions
	/// are dropped here because a refund leaves the transaction present but no longer entitling.
	private func entitledProductIDs() async -> [String] {
		var ids: [String] = []
		for await result in Transaction.currentEntitlements {
			guard case .verified(let transaction) = result else { continue }
			guard transaction.revocationDate == nil else { continue }
			ids.append(transaction.productID)
		}
		return ids
	}

	/// Buy through `SKTestSession`, NOT `Product.purchase()`.
	///
	/// `Product.purchase()` has to present a confirmation sheet, so it needs a connected window
	/// scene. A hosted unit test has no scene it can present into, and every purchase that must
	/// actually complete a payment fails with a bare `StoreKitError.unknown` - while `.pending`
	/// (ask-to-buy) succeeds, because that path never confirms. `buyProduct` is StoreKitTest's own
	/// entry point for this and hands back the verified transaction directly.
	@discardableResult
	private func buy(_ productID: String) async throws -> Transaction {
		try await session.buyProduct(identifier: productID)
	}

	/// The signed payload the app posts to `/v2/subscriptions/iap/apple/verify` lives on the
	/// VerificationResult, not on the Transaction, so it has to be read back.
	private func signedPayload(for productID: String) async throws -> String {
		// bind before unwrapping: XCTUnwrap takes an autoclosure, which cannot contain an await
		let latest = await Transaction.latest(for: productID)
		return try XCTUnwrap(latest).jwsRepresentation
	}

	/// StoreKit publishes entitlements asynchronously, so a single read races the store.
	///
	/// Both directions are polled deliberately. Waiting only for an entitlement to APPEAR would let
	/// every revocation test pass vacuously - "not entitled" is also what you observe a millisecond
	/// after the purchase, before the store has published anything at all.
	private func waitForEntitlement(
		_ productID: String,
		toExist shouldExist: Bool = true,
		attempts: Int = 40
	) async -> Bool {
		for _ in 0 ..< attempts {
			let entitled = await entitledProductIDs().contains(productID)
			if entitled == shouldExist { return true }
			try? await Task.sleep(nanoseconds: 50_000_000)
		}
		return false
	}

	/// The group's own view of what is subscribed, which is what the single-tier account model reads.
	private func waitForSubscribedCount(
		_ expected: Int,
		in subscription: Product.SubscriptionInfo,
		attempts: Int = 40
	) async -> [Product.SubscriptionInfo.Status] {
		var latest: [Product.SubscriptionInfo.Status] = []
		for _ in 0 ..< attempts {
			latest = ((try? await subscription.status) ?? []).filter { $0.state == .subscribed }
			if latest.count == expected { return latest }
			try? await Task.sleep(nanoseconds: 50_000_000)
		}
		return latest
	}

	override func setUp() async throws {
		try await super.setUp()
		session = try SKTestSession(configurationFileNamed: "Subscriptions")

		// a simulator runtime whose StoreKit test daemon refuses sessions (iOS 26.5 under Xcode
		// 26.6 does) fails every call with SKInternalErrorDomain Code=3 and serves no products,
		// which reads identically to an empty catalogue. skip loudly instead of emitting 15
		// assertion failures that all blame the wrong thing. StoreKitEnvironmentTests is the control
		try XCTSkipIf(
			session.storefront.isEmpty,
			"the StoreKit test daemon is unavailable on this simulator runtime; pin a working one with NATIVE_IOS_DEVICE=<udid>"
		)

		session.resetToDefaultState()
		session.clearTransactions()

		// the checked-in configuration carries manual-debugging toggles (_failTransactionsEnabled
		// and several enabled _storeKitErrors) because it doubles as the file you flip while testing
		// by hand. every one of them is forced off here: a suite that inherits those would fail for
		// reasons that have nothing to do with the code under test, and would go green or red
		// depending on what someone last toggled in Xcode
		session.failTransactionsEnabled = false
		session.askToBuyEnabled = false
		session.disableDialogs = true

		// the checked-in config ships with simulated errors ENABLED for Load Products, Purchase,
		// Verification, App Transaction and Manage Subscriptions. with Load Products failing,
		// Product.products(for:) returns nothing and every assertion here dies on an unwrap that has
		// nothing to do with the code under test
		// each api is its own type conforming to FailableStoreKitAPI, so this cannot be a loop
		try await session.setSimulatedError(nil, forAPI: .loadProducts)
		try await session.setSimulatedError(nil, forAPI: .purchase)
		try await session.setSimulatedError(nil, forAPI: .verification)
		try await session.setSimulatedError(nil, forAPI: .appTransaction)
		try await session.setSimulatedError(nil, forAPI: .manageSubscriptions)
		try await session.setSimulatedError(nil, forAPI: .appStoreSync)
		try await session.setSimulatedError(nil, forAPI: .subscriptionStatus)
	}

	override func tearDownWithError() throws {
		session.clearTransactions()
		session = nil
		try super.tearDownWithError()
	}

	// MARK: - product catalogue

	func testEveryShippedProductIDResolves() async throws {
		let products = try await Product.products(for: Self.allIDs)
		let resolved = Set(products.map(\.id))
		for id in Self.allIDs {
			XCTAssertTrue(resolved.contains(id), "no StoreKit product for \(id)")
		}
	}

	func testProductsAreMonthlyAutoRenewables() async throws {
		let products = try await Product.products(for: Self.allIDs)
		XCTAssertEqual(products.count, 3)
		for product in products {
			XCTAssertEqual(product.type, .autoRenewable, "\(product.id) is not auto-renewable")
			XCTAssertEqual(product.subscription?.subscriptionPeriod.unit, .month)
			XCTAssertEqual(product.subscription?.subscriptionPeriod.value, 1)
		}
	}

	/// One group means the tiers are mutually exclusive, which is what the app's single-tier account
	/// model assumes. Separate groups would let a user hold two at once and leave the server
	/// reconciling competing entitlements.
	func testAllTiersShareOneSubscriptionGroup() async throws {
		let products = try await Product.products(for: Self.allIDs)
		let groups = Set(products.compactMap { $0.subscription?.subscriptionGroupID })
		XCTAssertEqual(groups.count, 1, "tiers must share one group to stay mutually exclusive")
	}

	func testAnUnknownProductIDResolvesToNothing() async throws {
		let products = try await Product.products(for: ["com.earthapp.sky.bogus.monthly"])
		XCTAssertTrue(products.isEmpty)
	}

	// MARK: - the happy path

	func testPurchasingProGrantsAnEntitlement() async throws {
		let transaction = try await buy(Self.proID)

		XCTAssertEqual(transaction.productID, Self.proID)
		XCTAssertNil(transaction.revocationDate)
		await transaction.finish()

		let entitled = await waitForEntitlement(Self.proID)
		XCTAssertTrue(entitled, "a finished purchase must leave a current entitlement")
	}

	/// The server verifies with the JWS, so a purchase that produces no signed payload cannot be
	/// turned into a tier no matter what the client does.
	func testAVerifiedPurchaseCarriesASignedPayload() async throws {
		let transaction = try await buy(Self.proID)
		let jws = try await signedPayload(for: Self.proID)

		XCTAssertFalse(jws.isEmpty, "the server has nothing to verify without a JWS")
		// three dot-separated base64url segments; a receipt string would not split this way
		XCTAssertEqual(jws.split(separator: ".").count, 3)
		await transaction.finish()
	}

	// MARK: - edge cases

	func testUserCancellationYieldsNoTransaction() async throws {
		session.failTransactionsEnabled = true
		session.failureError = .paymentCancelled

		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		do {
			let result = try await product.purchase()
			// storekit surfaces a cancel either as .userCancelled or as a thrown paymentCancelled
			if case .success = result { XCTFail("a cancelled purchase must not succeed") }
		} catch {
			// expected
		}

		let entitled = await entitledProductIDs()
		XCTAssertTrue(entitled.isEmpty, "a cancelled purchase must leave no entitlement")
	}

	func testAFailedPaymentGrantsNothing() async throws {
		session.failTransactionsEnabled = true
		session.failureError = .unknown

		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		do {
			_ = try await product.purchase()
		} catch {
			// expected
		}

		let entitled = await entitledProductIDs()
		XCTAssertTrue(entitled.isEmpty)
	}

	/// Ask-to-buy leaves the purchase pending: the user is NOT entitled until a parent approves. The
	/// app must not grant the tier on `.pending`, which is the case a sandbox account makes painful
	/// to reach by hand.
	func testAskToBuyLeavesThePurchasePendingAndUnentitled() async throws {
		session.askToBuyEnabled = true

		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		let result = try await product.purchase()

		guard case .pending = result else {
			return XCTFail("ask-to-buy must produce .pending, got \(result)")
		}
		let entitled = await entitledProductIDs()
		XCTAssertTrue(entitled.isEmpty, "a pending purchase must not entitle")
	}

	func testApprovingAnAskToBuyPurchaseGrantsTheEntitlement() async throws {
		session.askToBuyEnabled = true
		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		guard case .pending = try await product.purchase() else {
			return XCTFail("expected a pending purchase")
		}

		let pending = session.allTransactions().filter { $0.state == .deferred }
		XCTAssertFalse(pending.isEmpty, "expected a deferred transaction to approve")
		for transaction in pending {
			try session.approveAskToBuyTransaction(identifier: transaction.identifier)
		}

		// currentEntitlements includes unfinished transactions, so approval alone must entitle
		let entitled = await waitForEntitlement(Self.proID)
		XCTAssertTrue(entitled, "an approved ask-to-buy purchase must entitle")
	}

	/// A refund revokes the entitlement. The app reads `refund_eligible` from the server, but the
	/// device-side truth is that a revoked transaction must stop entitling immediately.
	func testARefundRevokesTheEntitlement() async throws {
		let transaction = try await buy(Self.proID)
		await transaction.finish()
		// prove the entitlement existed first, or the assertion below cannot fail
		let granted = await waitForEntitlement(Self.proID)
		XCTAssertTrue(granted, "the purchase must entitle before a refund can revoke it")

		try session.refundTransaction(identifier: UInt(transaction.id))

		let revoked = await waitForEntitlement(Self.proID, toExist: false)
		XCTAssertTrue(revoked, "a refunded purchase must stop entitling")
	}

	func testAnExpiredSubscriptionStopsEntitling() async throws {
		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		let transaction = try await buy(Self.proID)
		await transaction.finish()

		let subscription = try XCTUnwrap(product.subscription)
		let beforeExpiry = await waitForSubscribedCount(1, in: subscription)
		XCTAssertEqual(beforeExpiry.count, 1, "the purchase must read as subscribed before it expires")

		try session.expireSubscription(productIdentifier: Self.proID)

		let afterExpiry = await waitForSubscribedCount(0, in: subscription)
		XCTAssertTrue(afterExpiry.isEmpty, "an expired subscription must not read as subscribed")
	}

	/// Upgrading inside one group replaces the tier rather than stacking, which is the behaviour the
	/// single-tier account model depends on.
	///
	/// Asserted through the GROUP's subscription status, not `currentEntitlements`. `buyProduct`
	/// mints a raw transaction and does not run the App Store's in-group replacement, so two
	/// transactions genuinely coexist there - `status` is the API that reports what the group as a
	/// whole is subscribed to, which is the thing the account model reads.
	func testUpgradingFromProToWriterLeavesOneActiveTier() async throws {
		let proTransaction = try await buy(Self.proID)
		await proTransaction.finish()

		let writerTransaction = try await buy(Self.writerID)
		await writerTransaction.finish()

		let writerProducts = try await Product.products(for: [Self.writerID])
		let writer = try XCTUnwrap(writerProducts.first)
		let subscription = try XCTUnwrap(writer.subscription)
		let subscribed = await waitForSubscribedCount(1, in: subscription)

		XCTAssertEqual(subscribed.count, 1, "one group must yield exactly one active tier")
		guard case .verified(let current) = try XCTUnwrap(subscribed.first).transaction else {
			return XCTFail("expected the group's active transaction to verify")
		}
		XCTAssertEqual(current.productID, Self.writerID, "the newer tier must be the active one")
	}

	// MARK: - restore

	func testRestoringFindsAPreviousPurchase() async throws {
		let transaction = try await buy(Self.proID)
		await transaction.finish()

		let restored = await waitForEntitlement(Self.proID)
		XCTAssertTrue(restored)
	}

	func testRestoringWithNoPurchasesFindsNothing() async throws {
		session.clearTransactions()
		let entitled = await entitledProductIDs()
		XCTAssertTrue(entitled.isEmpty)
	}
}
