import XCTest

@testable import SkyKit

/// Capacitor's bridge is three loosely-coupled strings deep: the JS `registerPlugin` name, the
/// entry in `pluginMethods`, and the `@objc` selector. Nothing connects them at compile time, so
/// a rename produces a clean build and an `UNIMPLEMENTED` at runtime. These are the guards.
final class PluginContractTests: XCTestCase {
    private static let capacitorBuiltIns: Set<String> = [
        "addListener", "removeAllListeners", "checkPermissions", "requestPermissions"
    ]

    private func swiftSource(for contract: SkyPluginContract) throws -> String {
        let sources = try RepoFiles.appTargetSources()
        let matching = sources.filter { $0.value.contains("@objc(\(contract.identifier))") }
        guard let source = matching.values.first else {
            XCTFail("no app-target swift file declares @objc(\(contract.identifier))")
            throw CocoaError(.fileNoSuchFile)
        }
        XCTAssertEqual(matching.count, 1, "\(contract.identifier) is declared more than once")
        return source
    }

    private func objcCallMethods(in source: String) -> Set<String> {
        Set(RepoFiles.matches(#"@objc func (\w+)\(_ call: CAPPluginCall\)"#, in: source))
    }

    // #region swift side

    func testEveryContractMethodHasAnObjCEntryPoint() throws {
        for contract in SkyPluginContracts.all {
            let declared = objcCallMethods(in: try swiftSource(for: contract))
            for method in contract.methods {
                XCTAssertTrue(
                    declared.contains(method),
                    "\(contract.jsName).\(method)() has no `@objc func \(method)(_ call: CAPPluginCall)`"
                )
            }
        }
    }

    // the other direction: a swift method nobody declared is unreachable from JS, which is the
    // half a "does it exist" check misses
    func testNoObjCEntryPointIsMissingFromTheContract() throws {
        for contract in SkyPluginContracts.all {
            let declared = objcCallMethods(in: try swiftSource(for: contract))
            let orphans = declared.subtracting(contract.methods)
            XCTAssertTrue(
                orphans.isEmpty,
                "\(contract.identifier) exposes \(orphans.sorted()) that no contract declares, "
                    + "so the bridge will never dispatch to them"
            )
        }
    }

    // the plugin must derive pluginMethods from the contract, not re-list them; a second list is
    // a second thing to forget
    func testPluginsBuildTheirMethodListFromTheContract() throws {
        for contract in SkyPluginContracts.all {
            let source = try swiftSource(for: contract)
            XCTAssertTrue(
                source.contains("SkyPluginContracts."),
                "\(contract.identifier) hardcodes its bridge names instead of using SkyPluginContracts"
            )
            XCTAssertFalse(
                source.contains("CAPPluginMethod(name: \""),
                "\(contract.identifier) still hardcodes CAPPluginMethod names"
            )
        }
    }

    // a plugin that is never registered is UNIMPLEMENTED at every call site, and nothing in the
    // build says so
    func testMainViewControllerRegistersEveryPlugin() throws {
        let sources = try RepoFiles.appTargetSources()
        let controller = try XCTUnwrap(sources["MainViewController.swift"])
        let registered = Set(
            RepoFiles.matches(#"registerPluginInstance\((\w+)\(\)\)"#, in: controller)
        )
        XCTAssertEqual(
            registered, Set(SkyPluginContracts.all.map(\.identifier)),
            "MainViewController registers \(registered.sorted()) but the contracts are "
                + "\(SkyPluginContracts.all.map(\.identifier).sorted())"
        )
    }

    func testEveryDeclaredEventIsActuallyEmitted() throws {
        for contract in SkyPluginContracts.all where !contract.events.isEmpty {
            let source = try swiftSource(for: contract)
            for event in contract.events {
                XCTAssertTrue(
                    source.contains("notifyListeners(\"\(event)\""),
                    "\(contract.identifier) never emits \(event)"
                )
            }
        }
    }

    // #endregion

    // #region javascript side

    func testEveryContractIsRegisteredUnderItsJSName() throws {
        let registrations = try jsRegistrations()
        for contract in SkyPluginContracts.all {
            XCTAssertNotNil(
                registrations[contract.jsName],
                "no registerPlugin('\(contract.jsName)') call site; the web layer cannot reach it"
            )
        }
    }

    func testTheWebInterfaceAndTheContractDeclareTheSameMethods() throws {
        let registrations = try jsRegistrations()
        for contract in SkyPluginContracts.all {
            guard let (interfaceName, source) = registrations[contract.jsName] else { continue }
            let webMethods = try interfaceMethods(named: interfaceName, in: source)
                .subtracting(Self.capacitorBuiltIns)
            XCTAssertEqual(
                webMethods, Set(contract.methods),
                "\(contract.jsName): the TS interface declares \(webMethods.sorted()) but the "
                    + "native contract declares \(contract.methods.sorted())"
            )
        }
    }

    func testTheWebSubscribesToTheEventNamesTheNativeSideEmits() throws {
        let registrations = try jsRegistrations()
        for contract in SkyPluginContracts.all where !contract.events.isEmpty {
            guard let (_, source) = registrations[contract.jsName] else { continue }
            for event in contract.events {
                XCTAssertTrue(
                    source.contains("'\(event)'"),
                    "nothing in the web layer listens for \(contract.jsName)'s \(event)"
                )
            }
        }
    }

    // #endregion

    // #region helpers

    /// jsName -> (TS interface name, the file that registers it)
    private func jsRegistrations() throws -> [String: (String, String)] {
        var found: [String: (String, String)] = [:]
        let composables = RepoFiles.url("src/composables")
        for name in try FileManager.default.contentsOfDirectory(atPath: composables.path)
        where name.hasSuffix(".ts") {
            let source = try String(
                contentsOf: composables.appendingPathComponent(name), encoding: .utf8
            )
            let pattern = #"registerPlugin<(\w+)>\(\s*'([^']+)'"#
            let interfaces = RepoFiles.matches(pattern, in: source, group: 1)
            let names = RepoFiles.matches(pattern, in: source, group: 2)
            for (interface, jsName) in zip(interfaces, names) {
                found[jsName] = (interface, source)
            }
        }
        return found
    }

    private func interfaceMethods(named name: String, in source: String) throws -> Set<String> {
        let block = try XCTUnwrap(
            RepoFiles.matches(#"interface \#(name) \{(.*?)\n\}"#, in: source).first,
            "no `interface \(name)` in the registering file"
        )
        // exactly one tab in: nested option-object fields are deeper and have no parenthesis
        return Set(RepoFiles.matches(#"(?m)^\t(\w+)\s*\("#, in: block))
    }

    // #endregion
}
