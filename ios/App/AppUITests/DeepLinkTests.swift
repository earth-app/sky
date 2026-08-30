import XCTest

/// The custom URL scheme is declared in `Info.plist`, claimed by `SceneDelegate`, and resolved by
/// `useDeepLinkRouting`. Only a real OS can prove the handoff between those three.
final class DeepLinkTests: XCTestCase {
    private let scheme = "com.earthapp.sky"
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDown() {
        app.terminate()
    }

    private func open(_ url: String) {
        XCUIDevice.shared.system.open(URL(string: url)!)
    }

    // warm: the app is already running, so the link arrives through scene(_:openURLContexts:).
    //
    // measured 2026-08-30 on the iOS 26.2 simulator under Xcode 26.6: `state` answers
    // runningForeground for every app at once, springboard included, so it cannot witness the
    // backgrounding - `wait(for: .runningBackground)` never succeeds and `wait(for:
    // .runningForeground)` passes vacuously. the home press stays for realism and the bus, which
    // reports the route the app actually took, carries the assertion
    func testWarmLinkBringsTheAppBackToTheForeground() throws {
        try requireTestBus()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))
        _ = try TestBus.waitForEvents(named: "boot.resolved", timeout: 90)

        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 2)

        open("\(scheme)://tabs/dashboard")
        let received = try TestBus.waitForEvents(named: "deeplink.resolved", timeout: 60)
        let targets = received.compactMap { $0.data?["target"] }
        XCTAssertTrue(
            targets.contains { $0.contains("/tabs/dashboard") },
            "a warm link resolved \(targets) instead of /tabs/dashboard; check CFBundleURLSchemes "
                + "and scene(_:openURLContexts:)"
        )
    }

    // cold: the link arrives in connectionOptions, which is the branch that gets dropped first
    func testColdLinkLaunchesTheAppFromTerminated() {
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))

        open("\(scheme)://tabs/dashboard")
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: 90),
            "a deep link did not launch the terminated app"
        )
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 90))
    }

    // an unclaimed scheme must not open us; a greedy CFBundleURLSchemes entry would.
    // measured: `system.open` reports "no handler" (LSApplicationWorkspaceErrorDomain 115) as an
    // XCTest failure and is not catchable, so the absence of a handler IS the expected failure;
    // strict mode turns a successful open - the regression - back into a real failure
    func testAForeignSchemeDoesNotOpenTheApp() {
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))

        XCTExpectFailure("no installed app should claim com.earthapp.notsky://") {
            open("com.earthapp.notsky://tabs/dashboard")
        }
        Thread.sleep(forTimeInterval: 5)
        XCTAssertNotEqual(app.state, .runningForeground, "the app claimed a scheme it should not")
    }

    // reaching the foreground only proves the OS routed the url; the route the app actually
    // navigated to is a fact the bus carries and the accessibility tree cannot
    func testTheResolvedRouteMatchesTheLink() throws {
        try requireTestBus()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))
        _ = try TestBus.waitForEvents(named: "boot.resolved", timeout: 90)

        open("\(scheme)://tabs/discover")
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 60))

        let received = try TestBus.waitForEvents(named: "deeplink.resolved", timeout: 60)
        let targets = received.compactMap { $0.data?["target"] }
        XCTAssertTrue(
            targets.contains { $0.contains("/tabs/discover") },
            "the app resolved \(targets) instead of /tabs/discover"
        )
    }
}
