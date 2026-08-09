import XCTest

@testable import SkyKit

final class LiveActivityContentTests: XCTestCase {
    private func content(_ options: [String: Any]) -> LiveActivityContent {
        LiveActivityContent(options: LiveActivityOptionsDictionary(options))
    }

    // the JS caller may send nothing at all; the widget still has to render
    func testEmptyPayloadFallsBackToEveryDefault() {
        let state = content([:])
        XCTAssertEqual(state.questId, "")
        XCTAssertEqual(state.questName, "Quest")
        XCTAssertEqual(state.rarity, "normal")
        XCTAssertEqual(state.stepIndex, 0)
        XCTAssertEqual(state.totalSteps, 0)
        XCTAssertEqual(state.stepLabel, "")
        XCTAssertEqual(state.stepSymbol, "flag.checkered")
        XCTAssertEqual(state.stepDescription, "")
        XCTAssertEqual(state.progress, -1)
        XCTAssertEqual(state.unlockAtMs, 0)
        XCTAssertEqual(state.ctaText, "")
        XCTAssertEqual(state.ctaURL, "")
        XCTAssertEqual(state.tapURL, "")
    }

    func testFullPayloadIsCarriedThroughUnchanged() {
        let state = content([
            "questId": "q-1",
            "questName": "Dawn Chorus",
            "rarity": "amazing",
            "stepIndex": 2,
            "totalSteps": 5,
            "stepLabel": "Walk 2km",
            "stepSymbol": "figure.walk",
            "stepDescription": "Head for the ridge",
            "progress": 0.4,
            "unlockAtMs": 1_800_000_000_000,
            "ctaText": "Open Quest",
            "ctaURL": "com.earthapp.sky://quests/q-1",
            "tapURL": "com.earthapp.sky://quests/q-1?step=2"
        ])
        XCTAssertEqual(
            state,
            LiveActivityContent(
                questId: "q-1",
                questName: "Dawn Chorus",
                rarity: "amazing",
                stepIndex: 2,
                totalSteps: 5,
                stepLabel: "Walk 2km",
                stepSymbol: "figure.walk",
                stepDescription: "Head for the ridge",
                progress: 0.4,
                unlockAtMs: 1_800_000_000_000,
                ctaText: "Open Quest",
                ctaURL: "com.earthapp.sky://quests/q-1",
                tapURL: "com.earthapp.sky://quests/q-1?step=2"
            )
        )
    }

    // -1 is a sentinel, not a number to sanitise; 0 is a real "0% done" the widget draws
    func testProgressSentinelSurvivesAndZeroIsNotTheSentinel() {
        XCTAssertEqual(content([:]).progress, LiveActivityContent.noProgress)
        XCTAssertEqual(content(["progress": 0]).progress, 0)
        XCTAssertEqual(content(["progress": -1]).progress, LiveActivityContent.noProgress)
    }

    // js numbers cross the bridge boxed; an Int-only cast silently dropped stepIndex to 0
    func testNumbersArriveAsNSNumber() {
        let state = content([
            "stepIndex": NSNumber(value: 3),
            "totalSteps": NSNumber(value: 7),
            "progress": NSNumber(value: 0.75),
            "unlockAtMs": NSNumber(value: 1_700_000_000_000 as Double)
        ])
        XCTAssertEqual(state.stepIndex, 3)
        XCTAssertEqual(state.totalSteps, 7)
        XCTAssertEqual(state.progress, 0.75)
        XCTAssertEqual(state.unlockAtMs, 1_700_000_000_000)
    }

    // a wrong-typed key must not crash or coerce; it falls back like a missing one
    func testWrongTypesFallBackToDefaults() {
        let state = content(["questName": 42, "stepIndex": "two", "progress": "half"])
        XCTAssertEqual(state.questName, "Quest")
        XCTAssertEqual(state.stepIndex, 0)
        XCTAssertEqual(state.progress, -1)
    }

    // an explicit empty string is a deliberate "render nothing here", not a missing value
    func testExplicitEmptyStringsAreHonoured() {
        let state = content(["questName": "", "stepSymbol": "", "rarity": ""])
        XCTAssertEqual(state.questName, "")
        XCTAssertEqual(state.stepSymbol, "")
        XCTAssertEqual(state.rarity, "")
    }

    // every key here is read by DistanceActivityAttributes.ContentState and by the TS caller;
    // a rename on either side is a field the widget renders blank
    func testKeysMatchTheWebPayloadType() throws {
        let source = try RepoFiles.text("src/composables/useHealthKit.ts")
        let block = try XCTUnwrap(
            RepoFiles.matches(#"export type QuestActivityContent = \{(.*?)\};"#, in: source).first,
            "QuestActivityContent no longer exists in useHealthKit.ts"
        )
        let webKeys = Set(RepoFiles.matches(#"(?m)^\s*(\w+)\s*:"#, in: block))
        let nativeKeys: Set<String> = [
            "questId", "questName", "rarity", "stepIndex", "totalSteps", "stepLabel",
            "stepSymbol", "stepDescription", "progress", "unlockAtMs", "ctaText", "ctaURL", "tapURL"
        ]
        XCTAssertEqual(webKeys, nativeKeys)
    }

    func testAttributesStructDeclaresEveryContentField() throws {
        let sources = try RepoFiles.appTargetSources()
        let attributes = try XCTUnwrap(sources["DistanceActivityAttributes.swift"])
        for key in [
            "questName", "rarity", "stepIndex", "totalSteps", "stepLabel", "stepSymbol",
            "stepDescription", "progress", "unlockAtMs", "ctaText", "ctaURL", "tapURL"
        ] {
            XCTAssertTrue(
                attributes.contains("var \(key):"),
                "ContentState is missing \(key), so the widget cannot render it"
            )
        }
        XCTAssertTrue(attributes.contains("var questId:"))
    }
}
