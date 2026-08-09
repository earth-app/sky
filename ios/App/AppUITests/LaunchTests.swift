import XCTest

/// Cold launch is the one thing no web test can observe: the splash, the process, and the point
/// at which the web layer actually becomes interactive all live outside the WebView.
final class LaunchTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDown() {
        app.terminate()
    }

    // `launchAutoHide: false` means nothing takes the splash down but the app itself, so a boot
    // path that returns early leaves the user on a splash screen forever
    func testColdLaunchReachesInteractiveContent() {
        app.launch()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: 90),
            "the app never reached the foreground"
        )

        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 90), "no web view was ever attached")

        // no selectors: any rendered content at all proves the splash gave way to the app
        let interactive = expectation(description: "the web layer rendered content")
        let poll = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if webView.descendants(matching: .any).count > 1 { interactive.fulfill() }
        }
        defer { poll.invalidate() }
        wait(for: [interactive], timeout: 120)
    }

    // the WebContent process dying takes the whole screen white and only a relaunch clears it
    func testTheAppStaysUpAfterItSettles() {
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))
        _ = app.webViews.firstMatch.waitForExistence(timeout: 90)

        Thread.sleep(forTimeInterval: 15)
        XCTAssertEqual(app.state, .runningForeground, "the app did not survive its first 15s")
        XCTAssertTrue(app.webViews.firstMatch.exists, "the web view went away while idle")
    }

    // relaunch from terminated, which is the state a push tap or a deep link arrives in
    func testColdRelaunchAfterTerminationComesBack() {
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))

        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))

        app.launch()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: 90),
            "the app did not come back from a terminated state"
        )
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 90))
    }

    // the precise version of the same guard, once the app emits boot breadcrumbs: it catches a
    // boot that renders SOMETHING but never resolves auth, which the tree check cannot see
    func testBootResolvesWithinTheBudget() throws {
        try requireTestBus()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))

        let resolved = try TestBus.waitForEvents(named: "boot.resolved", timeout: 90)
        XCTAssertFalse(
            resolved.isEmpty,
            "no boot.resolved breadcrumb; the splash never handed over to a resolved session"
        )
    }
}
