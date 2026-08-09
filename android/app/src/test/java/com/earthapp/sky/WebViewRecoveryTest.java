package com.earthapp.sky;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The shipped symptom of getting this wrong is an app that needs a manual restart: Android kills the
 * webview render process, Capacitor does not rebuild it, and the user sees a blank shell.
 *
 * <p>Killing a real render process needs a device, so the instrumented half lives in
 * {@code androidTest/WebViewRecoveryInstrumentedTest}. This is the policy half.</p>
 */
public class WebViewRecoveryTest {

    @Test
    public void recoversTheFirstCrash() {
        assertTrue(new WebViewRecovery().shouldRecover(600_000L));
    }

    // regression: the old code compared `now - 0 < 5000` against a zero-initialised timestamp, so a
    // renderer kill during the device's first 5 seconds of uptime was misread as a crash loop and
    // the app was handed to the os instead of being recovered
    @Test
    public void recoversTheFirstCrashEvenEarlyInDeviceUptime() {
        assertTrue(new WebViewRecovery().shouldRecover(120L));
    }

    @Test
    public void refusesASecondCrashInsideTheWindow() {
        WebViewRecovery recovery = new WebViewRecovery();
        assertTrue(recovery.shouldRecover(10_000L));
        assertFalse(recovery.shouldRecover(10_001L));
        assertFalse(recovery.shouldRecover(10_000L + WebViewRecovery.MIN_INTERVAL_MS - 1));
    }

    @Test
    public void recoversAgainOnceTheWindowHasPassed() {
        WebViewRecovery recovery = new WebViewRecovery();
        assertTrue(recovery.shouldRecover(10_000L));
        assertTrue(recovery.shouldRecover(10_000L + WebViewRecovery.MIN_INTERVAL_MS));
    }

    // a refusal must not restart the clock, or a renderer crashing every 4s would keep pushing the
    // window forward and never recover even after it settled down
    @Test
    public void aRefusalDoesNotExtendTheWindow() {
        WebViewRecovery recovery = new WebViewRecovery();
        assertTrue(recovery.shouldRecover(0L));
        assertFalse(recovery.shouldRecover(4_000L));
        assertTrue(recovery.shouldRecover(5_000L));
    }

    @Test
    public void tracksWhetherItEverRecovered() {
        WebViewRecovery recovery = new WebViewRecovery();
        assertFalse(recovery.hasRecovered());
        recovery.shouldRecover(1_000L);
        assertTrue(recovery.hasRecovered());
    }

    @Test
    public void windowIsFiveSeconds() {
        assertTrue(WebViewRecovery.MIN_INTERVAL_MS == 5_000L);
    }
}
