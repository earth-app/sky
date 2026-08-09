import Foundation
import XCTest

/// Reads the checked-out repo, so the static guards can compare native config against the web
/// source that depends on it. Paths are relative to the repo root.
enum RepoFiles {
    static let root: URL = {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        // walk up to the checkout rather than counting directories; the package can move
        while dir.path != "/" {
            let marker = dir.appendingPathComponent("capacitor.config.ts")
            if FileManager.default.fileExists(atPath: marker.path) { return dir }
            dir = dir.deletingLastPathComponent()
        }
        fatalError("could not find the repo root above \(#filePath)")
    }()

    static func url(_ relativePath: String) -> URL {
        root.appendingPathComponent(relativePath)
    }

    static func text(_ relativePath: String, file: StaticString = #filePath, line: UInt = #line) throws -> String {
        let url = url(relativePath)
        guard FileManager.default.fileExists(atPath: url.path) else {
            XCTFail("missing \(relativePath); the native guards read it from the checkout", file: file, line: line)
            throw CocoaError(.fileNoSuchFile)
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    static func plist(_ relativePath: String, file: StaticString = #filePath, line: UInt = #line) throws -> [String: Any] {
        let url = url(relativePath)
        guard let data = FileManager.default.contents(atPath: url.path) else {
            XCTFail("missing \(relativePath)", file: file, line: line)
            throw CocoaError(.fileNoSuchFile)
        }
        let parsed = try PropertyListSerialization.propertyList(from: data, format: nil)
        guard let dict = parsed as? [String: Any] else {
            XCTFail("\(relativePath) is not a plist dictionary", file: file, line: line)
            throw CocoaError(.propertyListReadCorrupt)
        }
        return dict
    }

    /// every `*.swift` directly under the app target, which is where the custom plugins live
    static func appTargetSources() throws -> [String: String] {
        let dir = url("ios/App/App")
        let names = try FileManager.default.contentsOfDirectory(atPath: dir.path)
        var sources: [String: String] = [:]
        for name in names where name.hasSuffix(".swift") {
            sources[name] = try String(contentsOf: dir.appendingPathComponent(name), encoding: .utf8)
        }
        return sources
    }

    static func matches(_ pattern: String, in text: String, group: Int = 1) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) else {
            return []
        }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            guard let matchRange = Range(match.range(at: group), in: text) else { return nil }
            return String(text[matchRange])
        }
    }
}
