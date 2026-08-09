package com.earthapp.sky;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.Bridge;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Cold launch through to an interactive shell, with the splash cleared.
 *
 * <p>{@code capacitor.config.ts} sets {@code launchAutoHide: false}, so nothing native ever clears
 * the splash - only a {@code SplashScreen.hide()} from the web layer does. A boot path that throws,
 * or a refactor that drops the call, leaves the app on a permanent splash while the DOM behind it
 * is perfectly healthy. No web test can see that; this one can.</p>
 */
@RunWith(AndroidJUnit4.class)
public class ColdLaunchTest {

    @Test
    public void launchesToAnInteractiveShellWithTheSplashCleared() {
        TestBus.reset();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Bridge bridge = AppUnderTest.bridge(scenario);

            assertTrue(
                "the webview never finished loading within " + AppUnderTest.BOOT_TIMEOUT_MS + "ms",
                AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS)
            );
            assertTrue(
                "nuxt mounted nothing into #__nuxt, so the shell is blank",
                AppUnderTest.awaitJs(
                    scenario,
                    "document.querySelector('#__nuxt') && document.querySelector('#__nuxt').childElementCount > 0",
                    AppUnderTest.BOOT_TIMEOUT_MS
                )
            );

            assertTrue(
                "the splash is still up after boot; launchAutoHide is false, so SplashScreen.hide() "
                    + "was never reached and the app launches to a permanent splash",
                AppUnderTest.awaitTrue(() -> !AppUnderTest.splashVisible(bridge), AppUnderTest.BOOT_TIMEOUT_MS)
            );
        }
    }

    // the shipped failure mode is a webview that loads about:blank or the 404 page instead of the
    // bundled entry, which looks identical to a slow boot until you read the url
    @Test
    public void servesTheBundledEntryDocument() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);
            String href = AppUnderTest.evalString(scenario, "location.href");
            assertTrue("unexpected entry url: " + href, href != null && href.startsWith("https://localhost"));
            assertFalse("the webview fell through to the 404 page", href.contains("/404"));
        }
    }

    // there is deliberately NO assertion here on the adaptive background colour. neither half of it
    // is readable back: WebView.setBackgroundColor() sets Chromium's internal base colour and leaves
    // View.getBackground() null, and androidx SplashScreen re-applies the post-splash theme's
    // windowBackground over the window one when the splash exits (measured: #FAFAFA winning).
    // the colour contract - the half that actually regressed - is guarded in test/ThemeResolverTest

    // corroboration only; the assertions above stand without the mock server
    @Test
    public void reportsBootOnTheObservationBusWhenItIsRunning() {
        if (!TestBus.isReachable()) return;
        TestBus.reset();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);
            assertTrue(
                "the bus is up but no boot.resolved breadcrumb arrived",
                TestBus.await("boot.resolved", AppUnderTest.BOOT_TIMEOUT_MS)
            );
        }
    }
}
