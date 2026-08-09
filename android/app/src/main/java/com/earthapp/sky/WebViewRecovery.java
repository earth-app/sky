package com.earthapp.sky;

/**
 * Decides whether a dead webview render process should be recovered by recreating the activity.
 *
 * <p>Capacitor does not recover the WebView when Android kills its render process (OOM); without
 * this the app shows a blank, dead screen until the user force-restarts it. Recreating the activity
 * builds a fresh WebView. The rate limit exists so a renderer that crashes on every load cannot
 * recreate the activity forever - past the limit we report "not handled" and let the OS take the
 * process down, which is the recoverable outcome.</p>
 *
 * <p>Stateful but frameworkless, so the policy is unit-testable without an emulator. The clock is a
 * parameter rather than a call to {@code SystemClock.elapsedRealtime()} for the same reason.</p>
 */
public final class WebViewRecovery {

    /** two crashes closer together than this are a loop, not a one-off kill */
    public static final long MIN_INTERVAL_MS = 5_000L;

    private boolean recovered = false;
    private long lastRecoveryAt = 0L;

    /**
     * @param nowMs a monotonic clock reading, normally {@code SystemClock.elapsedRealtime()}
     * @return true to recreate the activity, false to let Android kill the process
     */
    public boolean shouldRecover(long nowMs) {
        // the first crash always recovers; comparing against a zero-initialised timestamp would
        // refuse to recover during the device's first 5 seconds of uptime
        if (recovered && nowMs - lastRecoveryAt < MIN_INTERVAL_MS) {
            return false;
        }
        recovered = true;
        lastRecoveryAt = nowMs;
        return true;
    }

    /** whether a recovery has already been performed in this activity's lifetime */
    public boolean hasRecovered() {
        return recovered;
    }
}
