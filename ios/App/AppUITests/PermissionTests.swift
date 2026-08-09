import XCTest

/// OS permission dialogs live in another process, so no web test and no faked bridge can see
/// them. This is also where the previous native lane found a real product defect: every request
/// site re-requested a `denied` permission, and dismissing a prompt resumes the app, which
/// requests again - an unbreakable loop on the user's screen.
///
/// `scripts/native-ios.sh` sets the starting privacy state with `xcrun simctl privacy`, so each
/// test knows whether a prompt is even possible.
final class PermissionTests: XCTestCase {
    private var app: XCUIApplication!
    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDown() {
        app.terminate()
    }

    private var systemAlert: XCUIElement {
        springboard.alerts.firstMatch
    }

    private func dismissSystemAlert(preferring labels: [String]) -> Bool {
        guard systemAlert.waitForExistence(timeout: 30) else { return false }
        for label in labels {
            let button = systemAlert.buttons[label]
            if button.exists {
                button.tap()
                return true
            }
        }
        systemAlert.buttons.firstMatch.tap()
        return true
    }

    // a system alert steals the whole accessibility tree; the app must still be alive behind it
    // and must come back once it is dismissed, rather than deadlocking on the resumed request
    func testTheAppSurvivesAndResumesAfterASystemPrompt() {
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))

        if dismissSystemAlert(preferring: ["Allow", "Don't Allow", "OK"]) {
            XCTAssertTrue(
                app.wait(for: .runningForeground, timeout: 60),
                "the app did not resume after the OS prompt was dismissed"
            )
        }

        // whatever the answer was, a second prompt must not stack on top of the first
        XCTAssertFalse(
            systemAlert.waitForExistence(timeout: 20),
            "a second OS prompt appeared right after the first was answered; that is the "
                + "re-prompt loop - the request site is not consulting shouldRequest()"
        )
        XCTAssertEqual(app.state, .runningForeground)
    }

    // the sharpest form of the same guard: relaunching with the permission already refused must
    // raise no prompt at all, because only Settings can change a denied permission
    func testARefusedPermissionIsNotRequestedAgainOnRelaunch() {
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))
        _ = dismissSystemAlert(preferring: ["Don't Allow", "Don’t Allow", "Deny"])
        _ = app.webViews.firstMatch.waitForExistence(timeout: 90)

        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))

        XCTAssertFalse(
            systemAlert.waitForExistence(timeout: 30),
            "a refused permission was requested again on the next launch"
        )
    }

    // counting requests is the only way to see a loop that the OS itself suppresses; iOS will
    // not re-show some prompts, which hides the app bug that Android surfaces
    func testADeniedPermissionIsRequestedExactlyOnce() throws {
        try requireTestBus()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 90))
        _ = dismissSystemAlert(preferring: ["Don't Allow", "Don’t Allow", "Deny"])
        _ = try TestBus.waitForEvents(named: "boot.resolved", timeout: 90)

        // settle, so a late async request still lands before we count
        Thread.sleep(forTimeInterval: 10)
        let requests = try TestBus.events().filter { $0.name == "permission.request" }
        let byPermission = Dictionary(grouping: requests) { $0.data?["name"] ?? "unknown" }
        for (permission, attempts) in byPermission {
            XCTAssertLessThanOrEqual(
                attempts.count, 1,
                "\(permission) was requested \(attempts.count) times in one launch"
            )
        }
    }
}
