package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Where a value actually lands on disk.
 *
 * <p>iOS and Android both reclaim WebView-owned storage (localStorage, IndexedDB) under pressure,
 * so anything identity-critical has to go through Capacitor Preferences, which is a real
 * {@code SharedPreferences} file. Only a native test can tell the two apart: from inside the WebView
 * they read identically.</p>
 *
 * <p>Limit worth stating: same-process instrumentation cannot kill and restart the app process
 * ({@code am force-stop} would take the test runner with it), so this proves durable STORAGE and
 * survival across a WebView teardown, not survival across process death. The on-disk assertion is
 * what makes that gap safe - a value in {@code SharedPreferences} outlives the process by
 * construction.</p>
 */
@RunWith(AndroidJUnit4.class)
public class PersistenceTest {

    private static final String KEY = "native.test.persistence";
    private static final String VALUE = "kept-across-teardown";

    private static SharedPreferences store() {
        return ApplicationProvider
            .<Context>getApplicationContext()
            .getSharedPreferences(ThemeResolver.PREFERENCES_STORE, Context.MODE_PRIVATE);
    }

    @After
    public void tearDown() {
        store().edit().remove(KEY).apply();
    }

    @Test
    public void aPreferencesWriteLandsInTheOnDiskCapacitorStore() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);
            writeThroughPreferences(scenario);

            assertTrue(
                "Preferences.set never reached SharedPreferences('" + ThemeResolver.PREFERENCES_STORE + "')",
                AppUnderTest.awaitTrue(() -> store().contains(KEY), 15_000L)
            );
            // the plugin putString's the value verbatim; any quoting comes from the caller
            assertEquals(VALUE, store().getString(KEY, null));
        }
    }

    @Test
    public void aPreferencesValueSurvivesAWebviewTeardown() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);
            writeThroughPreferences(scenario);
            AppUnderTest.awaitTrue(() -> store().contains(KEY), 15_000L);
        }

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);
            AppUnderTest.eval(
                scenario,
                "Capacitor.Plugins.Preferences.get({ key: '" + KEY + "' })"
                    + ".then(r => { window.__readBack = r.value; })"
            );
            assertTrue(
                "the value did not survive a fresh webview",
                AppUnderTest.awaitJs(scenario, "window.__readBack === '" + VALUE + "'", 15_000L)
            );
        }
    }

    // the guard against quietly moving something back onto webview storage: localStorage must NOT
    // show up in the durable store, so a reviewer can tell which one a key is using
    @Test
    public void localStorageIsADifferentStoreFromPreferences() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);
            AppUnderTest.eval(scenario, "localStorage.setItem('" + KEY + "', '" + VALUE + "')");
            AppUnderTest.awaitJs(scenario, "localStorage.getItem('" + KEY + "') === '" + VALUE + "'", 10_000L);

            AppUnderTest.sleep(1_000);
            assertNull(
                "a localStorage write showed up in CapacitorStorage; the two stores are not distinguishable",
                store().getString(KEY, null)
            );
        }
    }

    private static void writeThroughPreferences(ActivityScenario<MainActivity> scenario) {
        AppUnderTest.eval(
            scenario,
            "Capacitor.Plugins.Preferences.set({ key: '" + KEY + "', value: '" + VALUE + "' })"
        );
    }
}
