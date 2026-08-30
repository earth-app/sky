package com.earthapp.sky;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.StaleObjectException;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * The OS permission dialog, which lives in another process and which no web test and no faked
 * bridge can produce.
 *
 * <p>This is the test that earns the device lane. The prompt's own behaviour is what bit us: a
 * refused permission stays RE-PROMPTABLE for a while, so an app that re-requests on every denial
 * gets into a loop - dismissing the dialog resumes the app, which asks again. The ladder below (not
 * asked, refused, refused for good) is the state machine {@code src/utils/permissions.ts} encodes,
 * read from the real OS rather than from a mock.</p>
 *
 * <p>How many refusals it takes to reach permanent denial, and whether the OS keeps offering the
 * dialog afterwards, is deliberately not asserted - measured twice on one image with opposite
 * answers, so it is an OS-version detail rather than a contract.</p>
 *
 * <p>The whole ladder is one test method on purpose: permission state is per-install and cannot be
 * reset between methods, because {@code pm revoke} force-stops the app - and the instrumentation
 * shares that process, so a revoke would kill the test run itself.</p>
 *
 * <p>Requires the app installed WITHOUT {@code -g}; {@code adb install -g} pre-grants every runtime
 * permission and the assertions below skip vacuously. {@code scripts/native-android.sh} installs
 * plain for exactly this reason.</p>
 */
@RunWith(AndroidJUnit4.class)
public class PermissionTest {

    private static final long DIALOG_TIMEOUT_MS = 10_000L;
    /** long enough to prove no dialog is coming without stretching the lane */
    private static final long NO_DIALOG_SETTLE_MS = 5_000L;
    /** a bound, not a rule: no android build needs more than a couple of refusals to fix a denial */
    private static final int MAX_REFUSALS = 4;

    private static final Pattern DENY = Pattern.compile("(?i)^(don.t allow|deny)$");
    private static final Pattern ALLOW = Pattern.compile("(?i)^(allow|while using the app)$");

    private UiDevice device;

    @Before
    public void setUp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        Assume.assumeTrue(
            "runtime permission prompts only exist from api 23",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
        );
    }

    @Test
    public void refusingUntilPermanentDenialLeavesAStableDeniedState() {
        String permission = Manifest.permission.RECORD_AUDIO;
        Assume.assumeFalse(
            "already granted; reinstall without -g to exercise the prompt",
            granted(permission)
        );

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AppUnderTest.awaitJs(scenario, "document.readyState === 'complete'", AppUnderTest.BOOT_TIMEOUT_MS);

            // rung 1 - never asked: the os offers the dialog
            UiObject2 deny = requestAndWaitFor(scenario, permission, DENY, DIALOG_TIMEOUT_MS);
            assertNotNull("no OS permission dialog appeared for " + permission, deny);
            assertTrue("the deny button went stale before it could be tapped",
                tap(deny, DENY, DIALOG_TIMEOUT_MS));
            device.waitForIdle();
            assertFalse("a refused permission must not read as granted", granted(permission));

            // the dialog owns the whole screen while it is up; the app has to come back afterwards
            assertTrue(
                "the webview did not survive the permission dialog",
                AppUnderTest.awaitJs(scenario, "!!document.body", DIALOG_TIMEOUT_MS)
            );

            // rung 2 - keep refusing until the os stops offering a rationale. HOW MANY refusals that
            // takes is deliberately not asserted: it is one on some builds and two on others, and
            // pinning it turns an os detail into a false failure. what matters is that while a
            // rationale is still on offer the permission stays promptable, which is precisely why
            // the app layer has to gate on canPrompt() rather than re-requesting blindly
            int refusals = 1;
            while (shouldShowRationale(scenario, permission) && refusals < MAX_REFUSALS) {
                UiObject2 again = requestAndWaitFor(scenario, permission, DENY, DIALOG_TIMEOUT_MS);
                if (again == null) break;
                if (!tap(again, DENY, DIALOG_TIMEOUT_MS)) break;
                device.waitForIdle();
                refusals++;
            }

            // rung 3 - refused for good
            assertFalse(granted(permission));
            assertFalse(
                "the os still offers a rationale after " + refusals + " refusals, so permanent denial "
                    + "was never reached and the guard below would prove nothing",
                shouldShowRationale(scenario, permission)
            );

            // rung 4 - the terminal state has to be STABLE, because that is what the app branches
            // on: canPrompt() is false here, so every request site must route to Settings instead of
            // asking. asking anyway must not grant anything, must not reopen the rationale, and must
            // not take the app down.
            //
            // deliberately NOT asserted: that no dialog appears. measured twice on the same image
            // with opposite answers, so the number of refusals before the os stops prompting - and
            // whether it stops at all - is an os-version detail. the app-side "do not re-request"
            // rule is enforced by shouldRequest() in src/utils/permissions.ts and covered by vitest
            device.wait(Until.gone(By.text(DENY)), DIALOG_TIMEOUT_MS);
            UiObject2 lingering = requestAndWaitFor(scenario, permission, DENY, NO_DIALOG_SETTLE_MS);
            if (lingering != null) {
                tap(lingering, DENY, DIALOG_TIMEOUT_MS);
                device.waitForIdle();
            }
            assertFalse("a permanently refused permission became granted", granted(permission));
            assertFalse(
                "the permanent refusal was undone by asking again",
                shouldShowRationale(scenario, permission)
            );
            assertTrue(
                "the app did not come back after asking again",
                AppUnderTest.awaitJs(scenario, "!!document.body", DIALOG_TIMEOUT_MS)
            );
        }
    }

    // a different permission, so it cannot be perturbed by the refusal ladder above. proves the
    // prompt plumbing works at all - without it every Assume above could be skipping silently
    @Test
    public void allowingIsRecorded() {
        String permission = Manifest.permission.ACCESS_COARSE_LOCATION;
        Assume.assumeFalse(granted(permission));

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            // a bounded retry, not a single tap: the location dialog animates in on a software
            // renderer and a click landed during that animation is swallowed, which reads exactly
            // like a grant that did not stick
            boolean sawDialog = false;
            for (int attempt = 0; attempt < 3 && !granted(permission); attempt++) {
                UiObject2 allow = requestAndWaitFor(scenario, permission, ALLOW, DIALOG_TIMEOUT_MS);
                if (allow == null) continue;
                sawDialog = true;
                device.waitForIdle();
                tap(allow, ALLOW, DIALOG_TIMEOUT_MS);
                AppUnderTest.awaitTrue(() -> granted(permission), DIALOG_TIMEOUT_MS);
            }
            assertTrue("no OS permission dialog ever appeared for " + permission, sawDialog);
            assertTrue("the permission was allowed but did not stick", granted(permission));
        }
    }

    private static boolean granted(String permission) {
        return ActivityCompat.checkSelfPermission(
            ApplicationProvider.getApplicationContext(),
            permission
        ) == PackageManager.PERMISSION_GRANTED;
    }

    /** fires the request through the real activity and returns the matching dialog button, or null */
    /**
     * The OS dialog re-renders while it animates in, which invalidates a node found a moment
     * earlier and throws StaleObjectException on click. Re-find and retry rather than fail.
     */
    private boolean tap(UiObject2 found, Pattern button, long timeoutMs) {
        UiObject2 node = found;
        for (int attempt = 0; attempt < 3; attempt++) {
            if (node == null) return false;
            try {
                node.click();
                return true;
            } catch (StaleObjectException stale) {
                device.waitForIdle();
                node = device.wait(Until.findObject(By.text(button)), timeoutMs);
            }
        }
        return false;
    }

    private UiObject2 requestAndWaitFor(
        ActivityScenario<MainActivity> scenario,
        String permission,
        Pattern button,
        long timeoutMs
    ) {
        scenario.onActivity(activity ->
            ActivityCompat.requestPermissions(activity, new String[] { permission }, 4242)
        );
        return device.wait(Until.findObject(By.text(button)), timeoutMs);
    }

    private boolean shouldShowRationale(ActivityScenario<MainActivity> scenario, String permission) {
        AtomicBoolean result = new AtomicBoolean(false);
        scenario.onActivity(activity ->
            result.set(ActivityCompat.shouldShowRequestPermissionRationale(activity, permission))
        );
        return result.get();
    }
}
