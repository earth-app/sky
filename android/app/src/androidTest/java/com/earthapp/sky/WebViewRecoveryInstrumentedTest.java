package com.earthapp.sky;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A real render-process kill, which is the one trigger no unit test can produce.
 *
 * <p>{@code chrome://crash} is Chromium's supported way to kill a WebView's renderer, so this drives
 * the actual {@code onRenderProcessGone} path rather than a proxy for it. The shipped symptom of
 * getting it wrong is an app that needs a manual restart: Android reclaims the render process,
 * Capacitor does not rebuild it, and the user is left on a blank shell.</p>
 *
 * <p>Recreation is observed through {@code ActivityLifecycleCallbacks} rather than by comparing what
 * {@code ActivityScenario} hands back: the scenario's own instance tracking is not reliable across a
 * {@code recreate()} it did not initiate, and a stale reference reads exactly like a failure to
 * recover.</p>
 *
 * <p>The rate-limit policy is unit-tested in {@code test/WebViewRecoveryTest}; this covers the
 * wiring - that {@code MainActivity} registers the listener at all, and that the rebuilt WebView is
 * live rather than a second dead one.</p>
 */
@RunWith(AndroidJUnit4.class)
public class WebViewRecoveryInstrumentedTest {

    private static final long RECOVERY_TIMEOUT_MS = 120_000L;

    @Test
    public void aDeadRenderProcessRebuildsTheWebview() {
        Application app = ApplicationProvider.getApplicationContext();
        AtomicInteger recreated = new AtomicInteger();
        AtomicReference<MainActivity> latest = new AtomicReference<>();
        Application.ActivityLifecycleCallbacks watcher = new LifecycleWatcher(recreated, latest);

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(
                "never reached an interactive shell before the kill",
                AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS)
            );

            // registered after launch, so any count at all means a NEW MainActivity was built
            app.registerActivityLifecycleCallbacks(watcher);
            try {
                // loadUrl rather than evaluateJavascript because the navigation itself is the kill
                scenario.onActivity(activity -> activity.getBridge().getWebView().loadUrl("chrome://crash"));

                assertTrue(
                    "the activity was never recreated after the render process died, so the app is "
                        + "sitting on a dead webview until the user force-restarts it",
                    AppUnderTest.awaitTrue(() -> recreated.get() > 0, RECOVERY_TIMEOUT_MS)
                );

                MainActivity rebuilt = latest.get();
                assertNotNull("no MainActivity instance after the recreate", rebuilt);
                assertTrue(
                    "the rebuilt webview never loaded anything",
                    AppUnderTest.awaitJsOn(rebuilt, "document.readyState === 'complete'", RECOVERY_TIMEOUT_MS)
                );
                assertTrue(
                    "the rebuilt webview painted a blank shell",
                    AppUnderTest.awaitJsOn(
                        rebuilt,
                        "document.querySelector('#__nuxt') && document.querySelector('#__nuxt').childElementCount > 0",
                        RECOVERY_TIMEOUT_MS
                    )
                );
            } finally {
                app.unregisterActivityLifecycleCallbacks(watcher);
            }
        }
    }

    private static final class LifecycleWatcher implements Application.ActivityLifecycleCallbacks {

        private final AtomicInteger recreated;
        private final AtomicReference<MainActivity> latest;

        LifecycleWatcher(AtomicInteger recreated, AtomicReference<MainActivity> latest) {
            this.recreated = recreated;
            this.latest = latest;
        }

        @Override
        public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
            if (activity instanceof MainActivity) {
                recreated.incrementAndGet();
                latest.set((MainActivity) activity);
            }
        }

        @Override
        public void onActivityStarted(Activity activity) {}

        @Override
        public void onActivityResumed(Activity activity) {}

        @Override
        public void onActivityPaused(Activity activity) {}

        @Override
        public void onActivityStopped(Activity activity) {}

        @Override
        public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}

        @Override
        public void onActivityDestroyed(Activity activity) {}
    }
}
