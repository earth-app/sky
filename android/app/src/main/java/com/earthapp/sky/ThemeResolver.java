package com.earthapp.sky;

import android.content.res.Configuration;

/**
 * Resolves the launch/window background colour without touching an {@code Activity}.
 *
 * <p>The values match {@code --ion-background-color} in {@code src/assets/css/main.css} so the
 * webview never flashes a contrasting colour during scroll or a route transition. There is
 * deliberately no static {@code backgroundColor} in {@code capacitor.config.ts} (it flashes blue),
 * so the colour is applied natively instead.</p>
 */
public final class ThemeResolver {

    // kept in lockstep with `--ion-background-color` on `:root:root.light` / `:root:root.dark`;
    // ThemeResolverTest reads the stylesheet and fails when they drift
    public static final int BG_LIGHT = 0xFFF6FCF7;
    public static final int BG_DARK = 0xFF060806;

    /** the Capacitor Preferences key written by {@code useSettings()}, JSON.stringify'd */
    public static final String THEME_PREFERENCE_KEY = "app.setting.theme";

    /** the SharedPreferences file @capacitor/preferences writes to by default */
    public static final String PREFERENCES_STORE = "CapacitorStorage";

    private ThemeResolver() {}

    /**
     * Whether the app should paint its dark background.
     *
     * @param storedPreference the raw Capacitor Preferences value, JSON-quoted or null
     * @param uiMode {@code Configuration.uiMode}, masked internally
     */
    public static boolean isDark(String storedPreference, int uiMode) {
        String theme = unquote(storedPreference);
        if ("dark".equals(theme)) return true;
        if ("light".equals(theme)) return false;
        // anything else (absent, "system", or a value written by a newer app version) defers to the os
        return (uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    public static int backgroundColor(String storedPreference, int uiMode) {
        return isDark(storedPreference, uiMode) ? BG_DARK : BG_LIGHT;
    }

    private static String unquote(String value) {
        if (value == null) return null;
        return value.replace("\"", "").trim();
    }
}
