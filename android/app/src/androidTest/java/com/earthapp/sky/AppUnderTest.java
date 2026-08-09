package com.earthapp.sky;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;

import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reaches into the running app from the instrumentation, which is in the SAME process as the app.
 *
 * <p>That is the whole reason these tests are cheaper and steadier than an a11y-tree UI runner: the
 * assertions read the real {@code Bridge}, the real plugin instances and the real {@code WebView}
 * DOM instead of matching flattened accessibility strings.</p>
 */
final class AppUnderTest {

    /** the emulator is software-rendered, so every deadline here is generous on purpose */
    static final long BOOT_TIMEOUT_MS = 60_000L;

    private AppUnderTest() {}

    static Bridge bridge(ActivityScenario<MainActivity> scenario) {
        AtomicReference<Bridge> found = new AtomicReference<>();
        scenario.onActivity(activity -> found.set(activity.getBridge()));
        assertNotNull("the activity exposed no Capacitor bridge", found.get());
        return found.get();
    }

    /**
     * Evaluates JS in the app's own WebView and returns the JSON-encoded result.
     *
     * <p>Deliberately not Espresso Web: WebDriver atoms cannot pierce Ionic's shadow DOM and their
     * injection depends on the page CSP, while this path is the embedder channel and neither
     * limitation applies.</p>
     */
    static String eval(ActivityScenario<MainActivity> scenario, String js) {
        return evalWith(action -> scenario.onActivity(action::accept), js);
    }

    /** the same channel, reached through a live activity reference instead of a scenario */
    static String evalOn(MainActivity activity, String js) {
        return evalWith(
            action -> InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> action.accept(activity)),
            js
        );
    }

    static boolean awaitJsOn(MainActivity activity, String js, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(evalOn(activity, "!!(" + js + ")"))) return true;
            sleep(250);
        }
        return false;
    }

    private static String evalWith(OnMainThread runner, String js) {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        runner.run(activity -> {
            WebView webView = activity.getBridge().getWebView();
            assertNotNull("the bridge has no WebView", webView);
            webView.evaluateJavascript(js, value -> {
                result.set(value);
                done.countDown();
            });
        });
        try {
            if (!done.await(20, TimeUnit.SECONDS)) fail("evaluateJavascript never called back for: " + js);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail("interrupted while evaluating: " + js);
        }
        return result.get();
    }

    /** strips the quotes evaluateJavascript wraps a string result in */
    static String evalString(ActivityScenario<MainActivity> scenario, String js) {
        String raw = eval(scenario, js);
        if (raw == null || "null".equals(raw)) return null;
        if (raw.length() >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) {
            return raw.substring(1, raw.length() - 1).replace("\\/", "/").replace("\\\"", "\"");
        }
        return raw;
    }

    static boolean evalBoolean(ActivityScenario<MainActivity> scenario, String js) {
        return "true".equals(eval(scenario, js));
    }

    /** polls until the JS expression evaluates true, or the deadline passes */
    static boolean awaitJs(ActivityScenario<MainActivity> scenario, String js, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (evalBoolean(scenario, "!!(" + js + ")")) return true;
            sleep(250);
        }
        return false;
    }

    static boolean awaitTrue(Condition condition, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.holds()) return true;
            sleep(250);
        }
        return condition.holds();
    }

    static <T extends Plugin> T plugin(Bridge bridge, String name, Class<T> type) {
        PluginHandle handle = bridge.getPlugin(name);
        assertNotNull("no " + name + " plugin registered on the bridge", handle);
        return type.cast(handle.getInstance());
    }

    /**
     * Whether the Capacitor splash is still on screen.
     *
     * <p>Read reflectively from {@code SplashScreenPlugin.splashScreen.isVisible}: the splash is a
     * separate window, so it is invisible to the activity's view hierarchy, and the plugin's own
     * flag is the only honest source. A dependency bump that renames either field fails here loudly
     * rather than turning the assertion into a silent pass.</p>
     */
    static boolean splashVisible(Bridge bridge) {
        PluginHandle handle = bridge.getPlugin("SplashScreen");
        assertNotNull("the SplashScreen plugin is not registered", handle);
        Object plugin = handle.getInstance();
        try {
            Field screenField = plugin.getClass().getDeclaredField("splashScreen");
            screenField.setAccessible(true);
            Object splash = screenField.get(plugin);
            if (splash == null) return false;
            Field visibleField = splash.getClass().getDeclaredField("isVisible");
            visibleField.setAccessible(true);
            return visibleField.getBoolean(splash);
        } catch (ReflectiveOperationException e) {
            fail("@capacitor/splash-screen changed shape, so the splash can no longer be observed: " + e);
            return false;
        }
    }

    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    interface Condition {
        boolean holds();
    }

    /** runs an activity action on the main thread, however the caller can reach one */
    interface OnMainThread {
        void run(ActivityAction action);
    }

    interface ActivityAction {
        void accept(MainActivity activity);
    }
}
