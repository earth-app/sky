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
@available(iOS 15.0, *)
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

	override func setUp() async throws {
		try await super.setUp()
		session = try SKTestSession(configurationFileNamed: "Subscriptions")
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
		// each api is its own type conforming to FailableStoreKitAPI, so this cannot be a loop.
		// the clearing api itself is iOS 17+; below that the config's toggles cannot be overridden,
		// so the suite would inherit them - hence the hard skip rather than a silent pass
		if #available(iOS 17.0, *) {
			try await session.setSimulatedError(nil, forAPI: .loadProducts)
			try await session.setSimulatedError(nil, forAPI: .purchase)
			try await session.setSimulatedError(nil, forAPI: .verification)
			try await session.setSimulatedError(nil, forAPI: .appTransaction)
			try await session.setSimulatedError(nil, forAPI: .manageSubscriptions)
			try await session.setSimulatedError(nil, forAPI: .appStoreSync)
			try await session.setSimulatedError(nil, forAPI: .subscriptionStatus)
		} else {
			throw XCTSkip("clearing simulated StoreKit errors needs iOS 17; run on a newer simulator")
		}
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
		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		let result = try await product.purchase()

		guard case .success(let verification) = result else {
			return XCTFail("expected a successful purchase, got \(result)")
		}
		guard case .verified(let transaction) = verification else {
			return XCTFail("expected a verified transaction")
		}

		XCTAssertEqual(transaction.productID, Self.proID)
		XCTAssertNil(transaction.revocationDate)
		await transaction.finish()

		let entitled = await entitledProductIDs()
		XCTAssertTrue(entitled.contains(Self.proID), "a finished purchase must leave a current entitlement")
	}

	/// The server verifies with the JWS, so a purchase that produces no signed payload cannot be
	/// turned into a tier no matter what the client does.
	func testAVerifiedPurchaseCarriesASignedPayload() async throws {
		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		guard case .success(let verification) = try await product.purchase() else {
			return XCTFail("expected a successful purchase")
		}
		XCTAssertFalse(verification.jwsRepresentation.isEmpty)
		if case .verified(let transaction) = verification { await transaction.finish() }
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

		let entitled = await entitledProductIDs()
		XCTAssertTrue(entitled.contains(Self.proID), "an approved ask-to-buy purchase must entitle")
	}

	/// A refund revokes the entitlement. The app reads `refund_eligible` from the server, but the
	/// device-side truth is that a revoked transaction must stop entitling immediately.
	func testARefundRevokesTheEntitlement() async throws {
		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		guard case .success(let verification) = try await product.purchase(),
			case .verified(let transaction) = verification
		else {
			return XCTFail("expected a verified purchase")
		}
		await transaction.finish()

		try session.refundTransaction(identifier: UInt(transaction.id))

		let entitled = await entitledProductIDs()
		XCTAssertFalse(entitled.contains(Self.proID), "a refunded purchase must stop entitling")
	}

	func testAnExpiredSubscriptionStopsEntitling() async throws {
		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		guard case .success(let verification) = try await product.purchase(),
			case .verified(let transaction) = verification
		else {
			return XCTFail("expected a verified purchase")
		}
		await transaction.finish()

		try session.expireSubscription(productIdentifier: Self.proID)

		let subscription = try XCTUnwrap(product.subscription)
		let status = try await subscription.status
		let active = status.contains { $0.state == .subscribed }
		XCTAssertFalse(active, "an expired subscription must not read as subscribed")
	}

	/// Upgrading inside one group replaces the tier rather than stacking, which is the behaviour the
	/// single-tier account model depends on.
	func testUpgradingFromProToWriterLeavesOneActiveTier() async throws {
		let proProducts = try await Product.products(for: [Self.proID])
		let pro = try XCTUnwrap(proProducts.first)
		guard case .success(let proVerification) = try await pro.purchase(),
			case .verified(let proTransaction) = proVerification
		else {
			return XCTFail("expected the pro purchase to succeed")
		}
		await proTransaction.finish()

		let writerProducts = try await Product.products(for: [Self.writerID])
		let writer = try XCTUnwrap(writerProducts.first)
		guard case .success(let writerVerification) = try await writer.purchase(),
			case .verified(let writerTransaction) = writerVerification
		else {
			return XCTFail("expected the writer purchase to succeed")
		}
		await writerTransaction.finish()

		let entitledIDs = await entitledProductIDs()
		XCTAssertTrue(entitledIDs.contains(Self.writerID))
		XCTAssertEqual(Set(entitledIDs).count, 1, "one group must yield exactly one active tier")
	}

	// MARK: - restore

	func testRestoringFindsAPreviousPurchase() async throws {
		let productProducts = try await Product.products(for: [Self.proID])
		let product = try XCTUnwrap(productProducts.first)
		guard case .success(let verification) = try await product.purchase(),
			case .verified(let transaction) = verification
		else {
			return XCTFail("expected a verified purchase")
		}
		await transaction.finish()

		let restored = await entitledProductIDs()
		XCTAssertTrue(restored.contains(Self.proID))
	}

	func testRestoringWithNoPurchasesFindsNothing() async throws {
		session.clearTransactions()
		let entitled = await entitledProductIDs()
		XCTAssertTrue(entitled.isEmpty)
	}
}
