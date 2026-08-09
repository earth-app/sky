import XCTest

@testable import SkyKit

final class ThemePreferenceTests: XCTestCase {
    func testParsesTheJSONQuotedFormCapacitorActuallyWrites() {
        XCTAssertEqual(ThemePreference.parse("\"light\""), .light)
        XCTAssertEqual(ThemePreference.parse("\"dark\""), .dark)
        XCTAssertEqual(ThemePreference.parse("\"system\""), .system)
    }

    func testParsesTheBareFormToo() {
        XCTAssertEqual(ThemePreference.parse("light"), .light)
        XCTAssertEqual(ThemePreference.parse("dark"), .dark)
    }

    // a cold launch before the web layer has ever written a preference
    func testMissingValueIsSystem() {
        XCTAssertEqual(ThemePreference.parse(nil), .system)
        XCTAssertEqual(ThemePreference.parse(""), .system)
        XCTAssertEqual(ThemePreference.parse("\"\""), .system)
    }

    // the failure that matters: an unknown value must not pin the app to one appearance
    func testUnknownValueFallsBackToSystem() {
        XCTAssertEqual(ThemePreference.parse("Dark"), .system)
        XCTAssertEqual(ThemePreference.parse("midnight"), .system)
        XCTAssertEqual(ThemePreference.parse("{\"theme\":\"dark\"}"), .system)
    }

    func testStorageKeyCarriesCapacitorsPrefix() {
        XCTAssertEqual(ThemePreference.storageKey, "CapacitorStorage.app.setting.theme")
    }

    // the key is half of a cross-language contract: useSettings composes `app.setting.` + the
    // AppSettings field name, and SceneDelegate reads the result back out of UserDefaults
    func testStorageKeyMatchesTheKeyTheWebLayerWrites() throws {
        let settings = try RepoFiles.text("src/composables/useSettings.ts")
        XCTAssertTrue(
            settings.contains("SETTINGS_KEY_PREFIX = 'app.setting.'"),
            "the settings key prefix moved; SceneDelegate would read a dead UserDefaults key"
        )
        XCTAssertTrue(
            settings.contains("theme: ThemeSetting"),
            "AppSettings no longer has a `theme` field, so `app.setting.theme` is never written"
        )
    }

    // a theme the web can store but the native shell cannot name silently becomes `system`,
    // so the window keeps the wrong appearance for the whole launch
    func testEveryWebThemeValueHasANativeCase() throws {
        let settings = try RepoFiles.text("src/composables/useSettings.ts")
        let list = try XCTUnwrap(
            RepoFiles.matches(#"THEME_VALUES = \[([^\]]*)\]"#, in: settings).first,
            "could not find THEME_VALUES in useSettings.ts"
        )
        let webValues = Set(RepoFiles.matches(#"'([^']+)'"#, in: list))
        XCTAssertEqual(webValues, Set(ThemePreference.allCases.map(\.rawValue)))
    }

    func testEveryCaseRoundTrips() {
        for preference in ThemePreference.allCases {
            XCTAssertEqual(ThemePreference.parse(preference.rawValue), preference)
            XCTAssertEqual(ThemePreference.parse("\"\(preference.rawValue)\""), preference)
        }
    }
}
