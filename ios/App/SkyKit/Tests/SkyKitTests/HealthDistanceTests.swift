import XCTest

@testable import SkyKit

final class HealthDistanceTests: XCTestCase {
    private let start: Double = 1_700_000_000_000
    private let end: Double = 1_700_000_600_000

    // an iPad or a simulator without Health answers "unavailable" rather than failing
    func testNoHealthStoreShortCircuitsBeforeAnyArgumentCheck() {
        XCTAssertEqual(
            HealthDistance.plan(healthDataAvailable: false, startMs: nil, endMs: nil),
            .unavailable
        )
        XCTAssertEqual(
            HealthDistance.plan(healthDataAvailable: false, startMs: start, endMs: end),
            .unavailable
        )
    }

    func testMissingBoundsAreACallerError() {
        XCTAssertEqual(
            HealthDistance.plan(healthDataAvailable: true, startMs: nil, endMs: end),
            .missingRange
        )
        XCTAssertEqual(
            HealthDistance.plan(healthDataAvailable: true, startMs: start, endMs: nil),
            .missingRange
        )
    }

    // a zero-width window is a real answer of 0, not an error and not a query
    func testEmptyOrInvertedRangeResolvesToZero() {
        XCTAssertEqual(
            HealthDistance.plan(healthDataAvailable: true, startMs: start, endMs: start),
            .emptyRange
        )
        XCTAssertEqual(
            HealthDistance.plan(healthDataAvailable: true, startMs: end, endMs: start),
            .emptyRange
        )
    }

    // the bridge speaks milliseconds and HealthKit speaks seconds; getting this wrong queries
    // a window 1000x too wide and quietly returns someone's whole year of walking
    func testMillisecondBoundsBecomeSecondDates() {
        guard case let .query(startDate, endDate) = HealthDistance.plan(
            healthDataAvailable: true,
            startMs: start,
            endMs: end
        ) else {
            return XCTFail("expected a query plan")
        }
        XCTAssertEqual(startDate.timeIntervalSince1970, 1_700_000_000, accuracy: 0.001)
        XCTAssertEqual(endDate.timeIntervalSince1970, 1_700_000_600, accuracy: 0.001)
        XCTAssertEqual(endDate.timeIntervalSince(startDate), 600, accuracy: 0.001)
    }

    func testWorkoutsWithoutDistanceContributeNothing() {
        XCTAssertEqual(HealthDistance.totalWorkoutMeters([]), 0)
        XCTAssertEqual(HealthDistance.totalWorkoutMeters([nil, nil]), 0)
        XCTAssertEqual(HealthDistance.totalWorkoutMeters([1200, nil, 800]), 2000)
    }

    // the double-count guard: samples are a FALLBACK, so any workout distance wins outright
    func testAnyWorkoutDistanceWinsOverSamples() {
        XCTAssertEqual(
            HealthDistance.workoutResult(meters: 2000, count: 2),
            .workouts(meters: 2000, count: 2)
        )
        XCTAssertNil(HealthDistance.workoutResult(meters: 0, count: 3))
    }

    // three workouts that all recorded 0m still means "fall through to samples", not "0 metres"
    func testZeroDistanceWorkoutsFallThroughEvenWhenWorkoutsExist() {
        XCTAssertNil(HealthDistance.workoutResult(meters: 0, count: 3))
    }

    // a query error alongside a zero total is logged, never rejected: the caller's real answer
    // is "no distance yet", and a rejection would surface a false failure in the UI
    func testSampleErrorWithNoDistanceWarnsInsteadOfFailing() {
        let outcome = HealthDistance.sampleOutcome(
            total: 0,
            firstError: NSError(domain: "HKErrorDomain", code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Authorization not determined"
            ])
        )
        XCTAssertEqual(outcome.result, .samples(meters: 0))
        XCTAssertEqual(
            outcome.warning,
            "[HealthKit] distance sample query error (returning 0): Authorization not determined"
        )
    }

    func testSampleErrorAlongsideRealDistanceIsNotWorthWarningAbout() {
        let outcome = HealthDistance.sampleOutcome(
            total: 1500,
            firstError: NSError(domain: "HKErrorDomain", code: 5)
        )
        XCTAssertEqual(outcome.result, .samples(meters: 1500))
        XCTAssertNil(outcome.warning)
    }

    func testCleanSampleQueryHasNoWarning() {
        let outcome = HealthDistance.sampleOutcome(total: 0, firstError: nil)
        XCTAssertEqual(outcome.result, .samples(meters: 0))
        XCTAssertNil(outcome.warning)
    }

    // #region the js contract

    func testUnavailablePayloadSendsNullRatherThanZero() {
        let payload = HealthDistanceResult.unavailable.payload
        XCTAssertTrue(payload["distance"] is NSNull, "0 would read as a real measurement of zero")
        XCTAssertEqual(payload["source"] as? String, "unavailable")
    }

    func testEveryResultKeepsTheSourceLabelTheWebLayerSwitchesOn() {
        XCTAssertEqual(HealthDistanceResult.unavailable.source, "unavailable")
        XCTAssertEqual(HealthDistanceResult.emptyRange.source, "empty-range")
        XCTAssertEqual(HealthDistanceResult.workouts(meters: 1, count: 1).source, "workouts")
        XCTAssertEqual(HealthDistanceResult.samples(meters: 1).source, "samples")
    }

    func testWorkoutPayloadCarriesTheCountAndSamplePayloadDoesNot() {
        let workouts = HealthDistanceResult.workouts(meters: 2000, count: 2).payload
        XCTAssertEqual(workouts["distance"] as? Double, 2000)
        XCTAssertEqual(workouts["workoutCount"] as? Int, 2)

        let samples = HealthDistanceResult.samples(meters: 900).payload
        XCTAssertEqual(samples["distance"] as? Double, 900)
        XCTAssertNil(samples["workoutCount"])
    }

    func testEmptyRangePayloadIsAMeasuredZero() {
        let payload = HealthDistanceResult.emptyRange.payload
        XCTAssertEqual(payload["distance"] as? Int, 0)
        XCTAssertFalse(payload["distance"] is NSNull)
    }

    // the TS type destructures these three names; a rename here is an undefined at runtime
    func testPayloadKeysMatchTheWebSignature() throws {
        let source = try RepoFiles.text("src/composables/useHealthKit.ts")
        XCTAssertTrue(source.contains("distance: number | null"))
        XCTAssertTrue(source.contains("source: string"))
        XCTAssertTrue(source.contains("workoutCount?: number"))
        XCTAssertTrue(
            source.contains("source: 'unavailable'"),
            "the web fallback no longer uses the `unavailable` source label"
        )
    }

    // #endregion

    // #region distance types

    func testSkatingSportsIsGatedBehindIOS18AndNothingElseIs() {
        let older = HealthDistanceType.supported(iOS18Available: false)
        XCTAssertFalse(older.contains(.skatingSports))
        XCTAssertEqual(older.count, HealthDistanceType.allCases.count - 1)

        let newer = HealthDistanceType.supported(iOS18Available: true)
        XCTAssertEqual(Set(newer), Set(HealthDistanceType.allCases))
    }

    // the plugin used to list these twice (authorization and the sample fallback); the lists
    // must be the same one or the app asks for a type it never reads, or reads one it never asked for
    func testAuthorizationAndQueryReadTheSameTypeList() throws {
        let sources = try RepoFiles.appTargetSources()
        let plugin = try XCTUnwrap(sources["HealthKitDistancePlugin.swift"])
        let uses = RepoFiles.matches(
            #"HealthDistanceType\.supportedForThisOS"#,
            in: plugin,
            group: 0
        )
        XCTAssertEqual(
            uses.count, 2,
            "authorization and the sample fallback must both derive from HealthDistanceType"
        )

        let bridge = try XCTUnwrap(sources["SkyKitBridge.swift"])
        XCTAssertTrue(
            bridge.contains("supported(iOS18Available: true)")
                && bridge.contains("supported(iOS18Available: false)"),
            "supportedForThisOS no longer routes through the tested OS gate"
        )
    }

    // #endregion
}
