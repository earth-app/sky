package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.res.Configuration;

import org.junit.Test;

/**
 * The window/webview background is painted before the webview has loaded a single byte, so a wrong
 * answer here is the blue-then-white flash on cold launch that shipped once already.
 */
public class ThemeResolverTest {

    private static final int NIGHT = Configuration.UI_MODE_NIGHT_YES;
    private static final int DAY = Configuration.UI_MODE_NIGHT_NO;

    // capacitor preferences json-encodes every value, so the stored string arrives quoted
    @Test
    public void honoursTheStoredPreferenceOverTheDeviceMode() {
        assertTrue(ThemeResolver.isDark("\"dark\"", DAY));
        assertFalse(ThemeResolver.isDark("\"light\"", NIGHT));
    }

    @Test
    public void acceptsAnUnquotedPreference() {
        assertTrue(ThemeResolver.isDark("dark", DAY));
        assertFalse(ThemeResolver.isDark("light", NIGHT));
    }

    @Test
    public void fallsBackToTheDeviceModeWhenNothingIsStored() {
        assertTrue(ThemeResolver.isDark(null, NIGHT));
        assertFalse(ThemeResolver.isDark(null, DAY));
    }

    @Test
    public void treatsSystemAsNoPreference() {
        assertTrue(ThemeResolver.isDark("\"system\"", NIGHT));
        assertFalse(ThemeResolver.isDark("\"system\"", DAY));
    }

    // a value a newer app version wrote, or a half-written preference, must not paint dark on a
    // light device just because it is not the literal "light"
    @Test
    public void defersToTheDeviceForAnUnknownValue() {
        assertFalse(ThemeResolver.isDark("\"midnight\"", DAY));
        assertTrue(ThemeResolver.isDark("\"midnight\"", NIGHT));
        assertFalse(ThemeResolver.isDark("", DAY));
        assertFalse(ThemeResolver.isDark("\"\"", DAY));
    }

    // UI_MODE_NIGHT_MASK is 0x30; the other uiMode bits carry the device type (tv, watch, car)
    // and must not be read as a night flag
    @Test
    public void masksTheUiModeRatherThanComparingItWhole() {
        int watchAtNight = Configuration.UI_MODE_TYPE_WATCH | Configuration.UI_MODE_NIGHT_YES;
        int watchInDay = Configuration.UI_MODE_TYPE_WATCH | Configuration.UI_MODE_NIGHT_NO;
        assertTrue(ThemeResolver.isDark(null, watchAtNight));
        assertFalse(ThemeResolver.isDark(null, watchInDay));
    }

    @Test
    public void undefinedNightModeIsNotDark() {
        assertFalse(ThemeResolver.isDark(null, Configuration.UI_MODE_NIGHT_UNDEFINED));
    }

    @Test
    public void mapsToTheIonBackgroundColours() {
        assertEquals(ThemeResolver.BG_DARK, ThemeResolver.backgroundColor("\"dark\"", DAY));
        assertEquals(ThemeResolver.BG_LIGHT, ThemeResolver.backgroundColor("\"light\"", NIGHT));
    }

    // the window is painted natively before the webview draws anything, so these constants have to
    // equal the stylesheet or the cold launch flashes one colour then repaints another. they DID
    // drift once: the design-system overhaul moved the css to #f6fcf7/#060806 and left the native
    // side on #f3f2f9/#1c1b22
    @Test
    public void staysInSyncWithTheIonBackgroundColour() {
        String css = RepoFiles.read("src/assets/css/main.css");
        assertEquals(
            "BG_LIGHT drifted from --ion-background-color on :root:root.light",
            ionBackground(css, "light"),
            ThemeResolver.BG_LIGHT
        );
        assertEquals(
            "BG_DARK drifted from --ion-background-color on :root:root.dark",
            ionBackground(css, "dark"),
            ThemeResolver.BG_DARK
        );
    }

    // both must be fully opaque; a translucent window background lets the system wallpaper through
    @Test
    public void keepsBothColoursOpaque() {
        assertEquals(0xFF000000, ThemeResolver.BG_LIGHT & 0xFF000000);
        assertEquals(0xFF000000, ThemeResolver.BG_DARK & 0xFF000000);
    }

    private static int ionBackground(String css, String themeClass) {
        String hex = RepoFiles
            .matchAll(css, ":root:root\\." + themeClass + "\\s*\\{[^}]*?--ion-background-color:\\s*#([0-9a-fA-F]{6})")
            .stream()
            .findFirst()
            .orElseThrow(() -> new AssertionError("no --ion-background-color on :root:root." + themeClass));
        return 0xFF000000 | Integer.parseInt(hex, 16);
    }
}
