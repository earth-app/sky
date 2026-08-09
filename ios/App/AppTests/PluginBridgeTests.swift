import Capacitor
import SkyKit
import XCTest

/// Runs against the real `CAPPlugin` / `CAPPluginCall` types with no host app and no web view.
/// Everything here is false-negative-proof only because Capacitor itself is present: a mocked
/// bridge asserts the mock's shape, never the plugin's.
final class PluginBridgeTests: XCTestCase {
    private struct Invocation {
        var resolved: [String: Any]?
        var rejected: CAPPluginCallError?
    }

    // the objc initialiser is unannotated, so it imports as optional
    private func makeCall(
        _ method: String,
        options: [String: Any] = [:],
        success: @escaping CAPPluginCallSuccessHandler = { _, _ in },
        error: @escaping CAPPluginCallErrorHandler = { _ in }
    ) -> CAPPluginCall {
        CAPPluginCall(
            callbackId: "test-\(method)",
            methodName: method,
            options: options,
            success: success,
            error: error
        )!
    }

    /// builds a real bridge call and runs `body`, returning whatever the plugin answered
    private func invoke(
        _ method: String,
        options: [String: Any] = [:],
        timeout: TimeInterval = 2,
        _ body: (CAPPluginCall) -> Void
    ) -> Invocation {
        var invocation = Invocation()
        let answered = expectation(description: "\(method) answered")
        let call = makeCall(
            method,
            options: options,
            success: { result, _ in
                invocation.resolved = result?.data ?? [:]
                answered.fulfill()
            },
            error: { error in
                invocation.rejected = error
                answered.fulfill()
            }
        )
        body(call)
        wait(for: [answered], timeout: timeout)
        return invocation
    }

    // #region registration contract

    func testPluginIdentityMatchesTheContract() {
        XCTAssertEqual(
            HealthKitDistancePlugin().identifier,
            SkyPluginContracts.healthKitDistance.identifier
        )
        XCTAssertEqual(
            HealthKitDistancePlugin().jsName,
            SkyPluginContracts.healthKitDistance.jsName
        )
        XCTAssertEqual(
            DistanceLiveActivityPlugin().identifier,
            SkyPluginContracts.distanceLiveActivity.identifier
        )
        XCTAssertEqual(
            DistanceLiveActivityPlugin().jsName,
            SkyPluginContracts.distanceLiveActivity.jsName
        )
        XCTAssertEqual(
            StoreKitIdentityPlugin().identifier,
            SkyPluginContracts.storeKitIdentity.identifier
        )
        XCTAssertEqual(
            StoreKitIdentityPlugin().jsName,
            SkyPluginContracts.storeKitIdentity.jsName
        )
    }

    // the bridge looks a method up by name and then performs its selector; if the name is in the
    // table but the selector is not implemented, the call throws at dispatch time
    func testEveryDeclaredMethodResolvesToAnImplementedSelector() {
        let plugins: [(CAPPlugin & CAPBridgedPlugin, SkyPluginContract)] = [
            (HealthKitDistancePlugin(), SkyPluginContracts.healthKitDistance),
            (DistanceLiveActivityPlugin(), SkyPluginContracts.distanceLiveActivity),
            (StoreKitIdentityPlugin(), SkyPluginContracts.storeKitIdentity)
        ]
        for (plugin, contract) in plugins {
            XCTAssertEqual(
                Set(plugin.pluginMethods.map(\.name)), Set(contract.methods),
                "\(contract.jsName) exposes a different method table than the contract"
            )
            XCTAssertEqual(plugin.pluginMethods.count, contract.methods.count)

            for method in plugin.pluginMethods {
                XCTAssertEqual(
                    NSStringFromSelector(method.selector),
                    contract.selectorName(for: method.name),
                    "\(contract.jsName).\(method.name) computes an unexpected selector"
                )
                XCTAssertTrue(
                    plugin.responds(to: method.selector),
                    "\(contract.jsName).\(method.name) is declared but not implemented; every "
                        + "call from JS would fail at dispatch"
                )
                XCTAssertEqual(
                    method.returnType, CAPPluginReturnPromise,
                    "\(contract.jsName).\(method.name) is not a promise; the JS wrapper awaits it"
                )
            }
        }
    }

    // #endregion

    // #region option marshalling

    // the dictionary stand-in in SkyKitTests cannot prove CAPPluginCall's own accessors behave.
    // measured: `getDouble` is a bare `as? Double`, so an unboxed whole number reads as nil and
    // unlockAtMs silently became 0; the same payload must survive both readers
    func testARealPluginCallProducesTheSameContentAsTheDictionary() {
        let options: [String: Any] = [
            "questId": "q-9",
            "questName": "Tide Pools",
            "rarity": "rare",
            "stepIndex": 1,
            "totalSteps": 4,
            "stepLabel": "Walk the shore",
            "stepSymbol": "figure.walk",
            "stepDescription": "Low tide only",
            "progress": 0.25,
            "unlockAtMs": 1_700_000_000_000,
            "ctaText": "Continue",
            "ctaURL": "com.earthapp.sky://quests/q-9",
            "tapURL": "com.earthapp.sky://quests/q-9"
        ]
        let call = makeCall("start", options: options)
        XCTAssertEqual(
            LiveActivityContent(options: PluginCallOptions(call: call)),
            LiveActivityContent(options: LiveActivityOptionsDictionary(options))
        )
    }

    func testAnEmptyPluginCallStillProducesEveryDefault() {
        let content = LiveActivityContent(options: PluginCallOptions(call: makeCall("start")))
        XCTAssertEqual(content.questName, LiveActivityContent.defaultQuestName)
        XCTAssertEqual(content.stepSymbol, LiveActivityContent.defaultStepSymbol)
        XCTAssertEqual(content.progress, LiveActivityContent.noProgress)
    }

    @available(iOS 16.1, *)
    func testContentStateCarriesEveryFieldIntoTheWidgetPayload() throws {
        let content = LiveActivityContent(
            questId: "q-1",
            questName: "Dawn Chorus",
            rarity: "amazing",
            stepIndex: 2,
            totalSteps: 5,
            stepLabel: "Listen",
            stepSymbol: "ear",
            stepDescription: "Before sunrise",
            progress: 0.5,
            unlockAtMs: 1_800_000_000_000,
            ctaText: "Open",
            ctaURL: "com.earthapp.sky://quests/q-1",
            tapURL: "com.earthapp.sky://quests/q-1?step=2"
        )
        let state = DistanceLiveActivityPlugin.contentState(from: content)
        XCTAssertEqual(state.questName, content.questName)
        XCTAssertEqual(state.rarity, content.rarity)
        XCTAssertEqual(state.stepIndex, content.stepIndex)
        XCTAssertEqual(state.totalSteps, content.totalSteps)
        XCTAssertEqual(state.stepLabel, content.stepLabel)
        XCTAssertEqual(state.stepSymbol, content.stepSymbol)
        XCTAssertEqual(state.stepDescription, content.stepDescription)
        XCTAssertEqual(state.progress, content.progress)
        XCTAssertEqual(state.unlockAtMs, content.unlockAtMs)
        XCTAssertEqual(state.ctaText, content.ctaText)
        XCTAssertEqual(state.ctaURL, content.ctaURL)
        XCTAssertEqual(state.tapURL, content.tapURL)
    }

    // #endregion

    // #region real dispatch

    func testIsAvailableAnswersWithTheKeyTheWebLayerDestructures() {
        let plugin = HealthKitDistancePlugin()
        let result = invoke("isAvailable") { plugin.isAvailable($0) }
        XCTAssertNil(result.rejected)
        XCTAssertNotNil(result.resolved?["available"] as? Bool, "resolved: \(result.resolved ?? [:])")
    }

    func testMissingBoundsRejectWithTheDocumentedMessage() {
        let plugin = HealthKitDistancePlugin()
        let result = invoke("getActivityDistance", options: ["start": 1]) {
            plugin.getActivityDistance($0)
        }
        XCTAssertNil(result.resolved)
        XCTAssertEqual(result.rejected?.message, HealthDistance.missingRangeMessage)
    }

    // an inverted window is a measured zero, not an error and not a query
    func testInvertedRangeResolvesToAMeasuredZero() {
        let plugin = HealthKitDistancePlugin()
        let result = invoke(
            "getActivityDistance",
            options: ["start": 1_700_000_600_000, "end": 1_700_000_000_000]
        ) { plugin.getActivityDistance($0) }
        XCTAssertNil(result.rejected)
        XCTAssertEqual(result.resolved?["source"] as? String, "empty-range")
        XCTAssertEqual((result.resolved?["distance"] as? NSNumber)?.doubleValue, 0)
    }

    func testLiveActivitySupportAnswersABooleanRatherThanFailing() {
        let plugin = DistanceLiveActivityPlugin()
        let result = invoke("isSupported") { plugin.isSupported($0) }
        XCTAssertNil(result.rejected)
        XCTAssertNotNil(result.resolved?["supported"] as? Bool)
    }

    // the boxed form the real bridge delivers must read identically to the bare form
    func testBoxedAndBareNumbersReadTheSame() {
        let bare: [String: Any] = ["unlockAtMs": 1_700_000_000_000, "progress": 1]
        let boxed: [String: Any] = [
            "unlockAtMs": NSNumber(value: 1_700_000_000_000 as Double),
            "progress": NSNumber(value: 1 as Double)
        ]
        let fromBare = LiveActivityContent(options: PluginCallOptions(call: makeCall("u", options: bare)))
        let fromBoxed = LiveActivityContent(options: PluginCallOptions(call: makeCall("u", options: boxed)))
        XCTAssertEqual(fromBare, fromBoxed)
        XCTAssertEqual(fromBare.unlockAtMs, 1_700_000_000_000)
        XCTAssertEqual(fromBare.progress, 1)
    }

    // stopObserving with nothing running must still resolve; the web layer awaits it on teardown
    func testStopObservingIsSafeWhenNothingIsObserving() {
        let plugin = HealthKitDistancePlugin()
        let result = invoke("stopObserving") { plugin.stopObserving($0) }
        XCTAssertNil(result.rejected)
    }

    // #endregion
}
