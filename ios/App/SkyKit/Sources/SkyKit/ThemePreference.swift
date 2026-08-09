import Foundation

/**
 The theme the web layer persisted, as the native shell has to read it back.

 `SceneDelegate` applies this before the web view has loaded, so the value comes out of
 `UserDefaults` rather than out of the app.

 @since 1.0.4
 */
public enum ThemePreference: String, Sendable, CaseIterable {
    case light
    case dark
    case system

    /// where `@capacitor/preferences` puts `app.setting.theme`; the prefix is capacitor's, not ours
    public static let storageKey = "CapacitorStorage.app.setting.theme"

    /**
     Reads a stored preference, tolerating the JSON quoting Capacitor writes.

     Anything unrecognised is `system`: an unknown string must never lock the app into a
     hardcoded appearance.

     @since 1.0.4
     */
    public static func parse(_ raw: String?) -> ThemePreference {
        guard let raw else { return .system }
        let unquoted = raw.replacingOccurrences(of: "\"", with: "")
        return ThemePreference(rawValue: unquoted) ?? .system
    }
}
