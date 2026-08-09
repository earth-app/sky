import XCTest

@testable import SkyKit

final class WebViewRecoveryTests: XCTestCase {
    // the bug this guards: recovering on the FIRST activation reloads the web view out from
    // under a cold launch that is still loading, which looks like a hang
    func testFirstActivationDoesNotRecover() {
        XCTAssertFalse(WebViewRecoveryPolicy.shouldRecover(hasActivatedBefore: false))
        XCTAssertTrue(WebViewRecoveryPolicy.shouldRecover(hasActivatedBefore: true))
    }

    func testNoURLReloadsImmediately() {
        XCTAssertEqual(WebViewRecoveryPolicy.decide(currentURL: nil), .reloadNow)
        XCTAssertEqual(WebViewRecoveryPolicy.decide(currentURL: ""), .reloadNow)
    }

    // what a reclaimed WKWebView content process leaves behind
    func testAboutSchemeReloadsImmediately() {
        XCTAssertEqual(WebViewRecoveryPolicy.decide(currentURL: "about:blank"), .reloadNow)
        XCTAssertEqual(WebViewRecoveryPolicy.decide(currentURL: "about:srcdoc"), .reloadNow)
    }

    func testLiveLookingURLIsProbedRatherThanReloaded() {
        XCTAssertEqual(
            WebViewRecoveryPolicy.decide(currentURL: "https://localhost/tabs/dashboard"),
            .probeThenReload
        )
        XCTAssertEqual(
            WebViewRecoveryPolicy.decide(currentURL: "capacitor://localhost/"),
            .probeThenReload
        )
    }

    // a url that merely CONTAINS "about" is a real page; only the scheme is the signal
    func testAboutInThePathIsNotTheAboutScheme() {
        XCTAssertEqual(
            WebViewRecoveryPolicy.decide(currentURL: "https://localhost/about"),
            .probeThenReload
        )
    }

    func testProbeReloadsOnlyWhenJavaScriptFails() {
        XCTAssertFalse(WebViewRecoveryPolicy.shouldReloadAfterProbe(error: nil))
        XCTAssertTrue(
            WebViewRecoveryPolicy.shouldReloadAfterProbe(
                error: NSError(domain: "WKErrorDomain", code: 5)
            )
        )
    }

    // the native half cannot be driven from a test (there is no supported way to kill a
    // WKWebView content process), so the recovery path is asserted here and the SceneDelegate
    // is asserted to still route through it
    func testSceneDelegateUsesThePolicyRatherThanItsOwnCopy() throws {
        let sources = try RepoFiles.appTargetSources()
        let sceneDelegate = try XCTUnwrap(sources["SceneDelegate.swift"])
        XCTAssertTrue(
            sceneDelegate.contains("WebViewRecoveryPolicy"),
            "SceneDelegate re-implements the recovery decision; nothing tests it there"
        )
    }
}
