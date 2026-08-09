import Foundation
import XCTest

/// The observation channel between the app and this test process.
///
/// The app posts structured breadcrumbs to the mock backend it already talks to; the test polls
/// them back. Asserting on JSON instead of on the accessibility tree is what removes the whole
/// class of selector failures (text-node folding, shadow DOM, a modal owning the tree) that made
/// the previous UI runner unusable.
///
/// The routes live in `tests/e2e/utils/mock-server.ts` and are guarded by the test-build flag.
enum TestBus {
    struct Event: Decodable {
        let seq: Int
        let name: String
        let at: Double?
        let data: [String: String]?
    }

    static let baseURL: URL = {
        let raw = ProcessInfo.processInfo.environment["SKY_MOCK_BASE_URL"] ?? "http://127.0.0.1:8788"
        return URL(string: raw)!
    }()

    /// probe once per process; a missing bus is a prerequisite gap, not a product failure
    private static var availability: Bool?

    static func isReady() -> Bool {
        if let availability { return availability }
        let ready = (try? get("/__test__/events?since=0")) != nil
        availability = ready
        return ready
    }

    static let unavailableReason = """
        the observation bus is not reachable at \(baseURL.absoluteString)/__test__/events. \
        Start the lane with scripts/native-ios.sh, and make sure mock-server.ts serves \
        POST /__test__/event, GET /__test__/events and POST /__test__/reset.
        """

    static func reset() throws {
        _ = try post("/__test__/reset")
    }

    static func events(since: Int = 0) throws -> [Event] {
        let data = try get("/__test__/events?since=\(since)")
        return try JSONDecoder().decode([Event].self, from: data)
    }

    /// polls until `predicate` matches or the deadline passes; returns the matching events
    @discardableResult
    static func waitForEvents(
        named name: String,
        timeout: TimeInterval = 60,
        until predicate: ([Event]) -> Bool = { !$0.isEmpty }
    ) throws -> [Event] {
        let deadline = Date().addingTimeInterval(timeout)
        var matching: [Event] = []
        repeat {
            matching = try events().filter { $0.name == name }
            if predicate(matching) { return matching }
            Thread.sleep(forTimeInterval: 0.5)
        } while Date() < deadline
        return matching
    }

    // #region transport

    private static func get(_ path: String) throws -> Data {
        try request(path, method: "GET")
    }

    @discardableResult
    private static func post(_ path: String) throws -> Data {
        try request(path, method: "POST")
    }

    private static func request(_ path: String, method: String) throws -> Data {
        var request = URLRequest(url: URL(string: path, relativeTo: baseURL)!)
        request.httpMethod = method
        request.timeoutInterval = 5

        var payload: Data?
        var failure: Error?
        let done = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { done.signal() }
            if let error { failure = error; return }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                failure = NSError(
                    domain: "TestBus", code: status,
                    userInfo: [NSLocalizedDescriptionKey: "\(method) \(path) -> \(status)"]
                )
                return
            }
            payload = data ?? Data()
        }.resume()
        _ = done.wait(timeout: .now() + 10)

        if let failure { throw failure }
        guard let payload else {
            throw NSError(
                domain: "TestBus", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "\(method) \(path) timed out"]
            )
        }
        return payload
    }

    // #endregion
}

extension XCTestCase {
    /// Skips rather than fails when the bus is absent, so a missing prerequisite reads as
    /// "skipped" in the report instead of masquerading as a product defect or a green run.
    func requireTestBus() throws {
        try XCTSkipUnless(TestBus.isReady(), TestBus.unavailableReason)
        try TestBus.reset()
    }
}
