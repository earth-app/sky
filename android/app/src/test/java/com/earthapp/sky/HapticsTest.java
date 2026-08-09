package com.earthapp.sky;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.test.core.app.ApplicationProvider;

import com.capacitorjs.plugins.haptics.arguments.HapticsImpactType;
import com.capacitorjs.plugins.haptics.arguments.HapticsNotificationType;
import com.capacitorjs.plugins.haptics.arguments.HapticsVibrationType;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.shadow.api.Shadow;
import org.robolectric.shadows.ShadowVibrator;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.Set;

/**
 * Android is the one platform where a haptic is observable: {@code ShadowVibrator} records the
 * effect that reached the system vibrator, so "did the tap actually buzz" is a real assertion here
 * rather than a call that returns void into the dark.
 *
 * <p>The timings below are literals on purpose. Reading them back off the same enum the plugin
 * passed in would pass through any change to the plugin's feel, and the point of pinning them is
 * that a dependency bump which retunes an impact shows up as a failing test instead of a shipped
 * change nobody chose.</p>
 */
@RunWith(RobolectricTestRunner.class)
public class HapticsTest {

    private static final String HAPTICS_TS = "src/composables/useHaptics.ts";
    private static final String PLUGIN_DEFINITIONS = "node_modules/@capacitor/haptics/dist/esm/definitions.js";

    private Vibrator vibrator;
    private Object haptics;

    @Before
    public void setUp() {
        Context context = ApplicationProvider.getApplicationContext();
        // the plugin takes this exact path on api 31+; on Robolectric it resolves to the same
        // SystemVibrator the legacy service returns, which is the one the shadow records
        VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
        vibrator = manager.getDefaultVibrator();
        ShadowVibrator.reset();
        haptics = newHaptics(context);
    }

    // #region impacts

    @Test
    public void aLightImpactReachesTheVibrator() {
        perform(HapticsImpactType.LIGHT);
        assertVibrated(new long[] { 0, 50 });
    }

    @Test
    public void aMediumImpactReachesTheVibrator() {
        perform(HapticsImpactType.MEDIUM);
        assertVibrated(new long[] { 0, 43 });
    }

    @Test
    public void aHeavyImpactReachesTheVibrator() {
        perform(HapticsImpactType.HEAVY);
        assertVibrated(new long[] { 0, 60 });
    }

    // two styles that emit the same waveform are one haptic as far as the user's hand is concerned
    @Test
    public void everyImpactStyleIsADistinctWaveform() {
        assertEquals(
            HapticsImpactType.values().length,
            distinctPatterns(HapticsImpactType.values())
        );
    }

    @Test
    public void everyNotificationTypeIsADistinctWaveform() {
        assertEquals(
            HapticsNotificationType.values().length,
            distinctPatterns(HapticsNotificationType.values())
        );
    }

    // #endregion

    // #region notifications

    @Test
    public void aSuccessNotificationReachesTheVibrator() {
        perform(HapticsNotificationType.SUCCESS);
        assertVibrated(new long[] { 0, 35, 65, 21 });
    }

    @Test
    public void aWarningNotificationReachesTheVibrator() {
        perform(HapticsNotificationType.WARNING);
        assertVibrated(new long[] { 0, 30, 40, 30, 50, 60 });
    }

    @Test
    public void anErrorNotificationReachesTheVibrator() {
        perform(HapticsNotificationType.ERROR);
        assertVibrated(new long[] { 0, 27, 45, 50 });
    }

    // #endregion

    // #region the string contract across the bridge

    // fromString() falls back silently - an unmatched style becomes HEAVY and an unmatched type
    // becomes SUCCESS - so a casing drift on the js side would not throw, it would just make every
    // impact feel the same. these are the values @capacitor/haptics actually puts on the wire
    @Test
    public void everyImpactStyleTheJsEnumSendsResolvesToItsOwnEffect() {
        for (String value : jsEnumValues("ImpactStyle")) {
            HapticsImpactType resolved = HapticsImpactType.fromString(value);
            assertEquals(
                "ImpactStyle." + value + " does not name a HapticsImpactType, so it silently became "
                    + resolved,
                value,
                resolved.name()
            );
        }
    }

    @Test
    public void everyNotificationTypeTheJsEnumSendsResolvesToItsOwnEffect() {
        for (String value : jsEnumValues("NotificationType")) {
            HapticsNotificationType resolved = HapticsNotificationType.fromString(value);
            assertEquals(
                "NotificationType." + value + " does not name a HapticsNotificationType, so it "
                    + "silently became " + resolved,
                value,
                resolved.name()
            );
        }
    }

    @Test
    public void anUnknownStyleStillVibratesRatherThanGoingSilent() {
        perform(HapticsImpactType.fromString("not-a-style"));
        assertVibrated(new long[] { 0, 60 }); // the HEAVY fallback
    }

    // #endregion

    // #region suppression

    // the defect this exists to catch: Haptics.selectionChanged() is gated on selectionStart(), so a
    // caller that only calls selectionChanged() produces NOTHING on android - no error, no buzz
    @Test
    public void selectionChangedWithoutSelectionStartNeverReachesTheVibrator() {
        invoke("selectionChanged");
        assertSilent("selectionChanged() vibrated without a preceding selectionStart()");
    }

    @Test
    public void selectionChangedAfterSelectionStartReachesTheVibrator() {
        invoke("selectionStart");
        invoke("selectionChanged");
        assertVibrated(new long[] { 0, 100 });
    }

    @Test
    public void selectionEndSuppressesFurtherSelectionHaptics() {
        invoke("selectionStart");
        invoke("selectionChanged");
        assertVibrated(new long[] { 0, 100 });

        ShadowVibrator.reset();
        invoke("selectionEnd");
        invoke("selectionChanged");
        assertSilent("selectionChanged() vibrated after selectionEnd()");
    }

    // the app-side suppression the native layer knows nothing about: a haptic must not fire on the
    // web build, and must not fire when the user has turned the setting off
    @Test
    public void theWebLayerGatesEveryHapticOnPlatformAndSetting() {
        String ts = RepoFiles.read(HAPTICS_TS);
        int start = ts.indexOf("async function runHaptic");
        assertTrue("no runHaptic gate in " + HAPTICS_TS, start >= 0);
        int end = ts.indexOf("\n}", start);
        assertTrue("unterminated runHaptic", end > start);
        String body = ts.substring(start, end);

        assertTrue(
            "runHaptic no longer returns early off-device, so the web build would call the plugin",
            body.contains("if (!Capacitor.isNativePlatform()) return")
        );
        assertTrue(
            "runHaptic no longer honours the hapticFeedback setting",
            body.contains("if (!settings.value.hapticFeedback) return")
        );
        assertTrue(
            "runHaptic must swallow plugin errors; a device with no vibrator throws",
            body.contains("catch")
        );
    }

    // #endregion

    // #region helpers

    private void perform(HapticsVibrationType type) {
        try {
            Method method = haptics.getClass().getMethod("performHaptics", HapticsVibrationType.class);
            method.invoke(haptics, type);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("@capacitor/haptics changed shape: " + e);
        }
    }

    private void invoke(String name) {
        try {
            haptics.getClass().getMethod(name).invoke(haptics);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("@capacitor/haptics no longer exposes " + name + "(): " + e);
        }
    }

    private void assertVibrated(long[] timings) {
        ShadowVibrator shadow = shadow();
        assertTrue("nothing reached the vibrator", shadow.isVibrating());
        assertArrayEquals("the wrong waveform reached the vibrator", timings, shadow.getPattern());
        assertEquals("a ui haptic must not loop", -1, shadow.getRepeat());
    }

    private void assertSilent(String because) {
        ShadowVibrator shadow = shadow();
        assertFalse(because, shadow.isVibrating());
        org.junit.Assert.assertNull(because, shadow.getPattern());
    }

    private ShadowVibrator shadow() {
        return (ShadowVibrator) Shadow.extract(vibrator);
    }

    private int distinctPatterns(HapticsVibrationType[] types) {
        Set<String> seen = new java.util.LinkedHashSet<>();
        for (HapticsVibrationType type : types) {
            ShadowVibrator.reset();
            perform(type);
            seen.add(java.util.Arrays.toString(shadow().getPattern()));
        }
        return seen.size();
    }

    /** the string values @capacitor/haptics puts on the bridge for one of its TS enums */
    private static Set<String> jsEnumValues(String enumName) {
        Set<String> values = RepoFiles.matchAllUnique(
            RepoFiles.read(PLUGIN_DEFINITIONS),
            enumName + "\\[\"\\w+\"\\] = \"(\\w+)\""
        );
        assertFalse("no " + enumName + " values in " + PLUGIN_DEFINITIONS, values.isEmpty());
        return values;
    }

    /** the plugin's implementation class is package-private, so the test builds one reflectively */
    private static Object newHaptics(Context context) {
        try {
            Class<?> type = Class.forName("com.capacitorjs.plugins.haptics.Haptics");
            Constructor<?> constructor = type.getDeclaredConstructor(Context.class);
            constructor.setAccessible(true);
            Object instance = constructor.newInstance(context);
            assertNotNull(instance);
            return instance;
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("com.capacitorjs.plugins.haptics.Haptics changed shape: " + e);
        }
    }

    // #endregion
}
