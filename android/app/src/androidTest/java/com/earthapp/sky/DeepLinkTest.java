package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;

import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.List;

/**
 * Deep links, warm and cold, asserted on the route the app actually lands on.
 *
 * <p>The route is read out of the WebView with {@code evaluateJavascript}, not out of the
 * accessibility tree, so the assertion is a string comparison against a URL rather than a hunt for
 * a label that a modal or an icon-folded title can hide.</p>
 */
@RunWith(AndroidJUnit4.class)
public class DeepLinkTest {

    private static final String PACKAGE = "com.earthapp.sky";
    private static final long ROUTE_TIMEOUT_MS = 30_000L;

    private static Intent viewIntent(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(PACKAGE);
        return intent;
    }

    // the os side of the contract: without this the link opens a browser and never reaches the app
    @Test
    public void theOsRoutesBothLinkShapesToMainActivity() {
        Context context = ApplicationProvider.getApplicationContext();
        for (String url : new String[] {
            "com.earthapp.sky://invite/NATIVE123",
            "https://app.earth-app.com/oauth/complete?provider=google",
            "https://app.earth-app.com/auth/callback-mobile"
        }) {
            List<ResolveInfo> matches = context
                .getPackageManager()
                .queryIntentActivities(viewIntent(url), 0);
            assertFalse("no activity resolves " + url, matches.isEmpty());
            assertTrue(
                url + " resolves to " + matches.get(0).activityInfo.name,
                MainActivity.class.getName().equals(matches.get(0).activityInfo.name)
            );
        }
    }

    // a path the manifest does not claim must NOT be swallowed, or every earth-app.com link on the
    // device starts opening the app instead of the website
    @Test
    public void unclaimedPathsAreLeftToTheBrowser() {
        Context context = ApplicationProvider.getApplicationContext();
        Intent intent = viewIntent("https://app.earth-app.com/privacy");
        assertTrue(
            "the app claimed /privacy, which belongs to the website",
            context.getPackageManager().queryIntentActivities(intent, 0).isEmpty()
        );
    }

    @Test
    public void aColdCustomSchemeLinkLandsOnTheInternalRoute() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(
            viewIntent("com.earthapp.sky://invite/NATIVE123")
        )) {
            assertTrue(
                "never routed to /signup; url stayed at " + AppUnderTest.evalString(scenario, "location.href"),
                AppUnderTest.awaitJs(scenario, "location.pathname.indexOf('/signup') === 0", ROUTE_TIMEOUT_MS)
            );
            assertTrue(
                "the referral code was dropped on the way through",
                AppUnderTest.evalBoolean(scenario, "location.search.indexOf('NATIVE123') !== -1")
            );
        }
    }

    // launchMode=singleTask means a link to a running app arrives at onNewIntent rather than
    // stacking a second activity with its own webview and its own auth state
    @Test
    public void aWarmLinkReusesTheRunningActivityAndItsWebview() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);
            // timeOrigin survives an in-app route change and changes on a fresh document, which is
            // exactly the difference between onNewIntent and a second activity
            String before = AppUnderTest.evalString(scenario, "String(performance.timeOrigin)");

            Intent warm = viewIntent("com.earthapp.sky://invite/WARM456");
            warm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ApplicationProvider.getApplicationContext().startActivity(warm);

            assertTrue(
                "never routed to /signup after the warm link",
                AppUnderTest.awaitJs(scenario, "location.pathname.indexOf('/signup') === 0", ROUTE_TIMEOUT_MS)
            );
            assertEquals(
                "the warm link rebuilt the webview instead of routing inside it",
                before,
                AppUnderTest.evalString(scenario, "String(performance.timeOrigin)")
            );
        }
    }

    // an oauth callback with no session token must fall back to the login form rather than entering
    // a half-authenticated shell
    @Test
    public void anOauthCallbackWithoutATokenFallsBackToLogin() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(
            viewIntent("com.earthapp.sky://oauth/complete?provider=google&context=login")
        )) {
            assertTrue(
                "landed on " + AppUnderTest.evalString(scenario, "location.pathname") + " instead of /login",
                AppUnderTest.awaitJs(scenario, "location.pathname.indexOf('/login') === 0", ROUTE_TIMEOUT_MS)
            );
        }
    }
}
