package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Asserts against the MERGED manifest and the compiled resources, which is what the device actually
 * runs. The source XML is checked separately in {@link DeepLinkContractTest}; only this test can see
 * what the plugin manifests contributed, or fail when the merger drops something.
 */
@RunWith(RobolectricTestRunner.class)
public class MergedManifestTest {

    /** the one user-facing product name; `sky` and `crust` are internal handles */
    private static final String DISPLAY_NAME = "The Earth App";

    private static final String PACKAGE = "com.earthapp.sky";

    private Context context() {
        return ApplicationProvider.getApplicationContext();
    }

    // app_name is not cosmetic: the os substitutes it into every runtime permission dialog
    // ("Allow sky to record audio?"), the launcher label, the app-info screen and the share sheet.
    // it shipped as `sky` once, because `cap add android` writes the DIRECTORY name here and
    // `cap sync` never corrects it
    @Test
    public void theCompiledAppNameIsTheProductName() {
        assertEquals(DISPLAY_NAME, context().getString(R.string.app_name));
        assertEquals(DISPLAY_NAME, context().getString(R.string.title_activity_main));
    }

    @Test
    public void theLauncherLabelResolvesToTheProductName() throws Exception {
        PackageManager pm = context().getPackageManager();
        CharSequence label = pm.getApplicationLabel(pm.getApplicationInfo(PACKAGE, 0));
        assertEquals(DISPLAY_NAME, String.valueOf(label));
    }

    @Test
    public void noInternalHandleLeaksIntoADisplayString() {
        for (String value : new String[] {
            context().getString(R.string.app_name),
            context().getString(R.string.title_activity_main),
            context().getString(R.string.shortcut_quest_long),
            context().getString(R.string.shortcut_notifications_long),
            context().getString(R.string.shortcut_profile_long)
        }) {
            assertTrue(
                "'" + value + "' exposes an internal handle",
                !value.toLowerCase().matches(".*\\b(sky|crust)\\b.*")
            );
        }
    }

    // the other half of the rule: `sky` is correct in IDENTIFIERS. renaming those breaks the bundle
    // id, the oauth redirect and the custom scheme, so a broad search-and-replace for the display
    // name must not take them with it
    @Test
    public void theInternalHandleStaysInIdentifiers() {
        assertEquals(PACKAGE, context().getString(R.string.package_name));
        assertEquals(PACKAGE, context().getString(R.string.custom_url_scheme));
        assertEquals(PACKAGE, context().getPackageName());
    }

    @Test
    public void mainActivityKeepsItsLaunchContract() throws Exception {
        ActivityInfo info = context()
            .getPackageManager()
            .getActivityInfo(new android.content.ComponentName(context(), MainActivity.class), 0);
        assertEquals(ActivityInfo.LAUNCH_SINGLE_TASK, info.launchMode);
        assertTrue("MainActivity must be exported to receive deep links", info.exported);
        // the launch theme is what paints the splash before any java runs; losing it shows a
        // white/black frame on every cold start
        assertEquals(R.style.AppTheme_NoActionBarLaunch, info.getThemeResource());
    }

    // every permission the app can request at runtime has to survive the manifest merge, or the os
    // denies it without ever showing a dialog and the feature is dead with no error
    @Test
    public void theMergeKeepsEveryRuntimePermission() throws Exception {
        Set<String> merged = mergedPermissions();
        for (String permission : new String[] {
            "android.permission.INTERNET",
            "android.permission.ACCESS_NETWORK_STATE",
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.RECORD_AUDIO",
            "android.permission.SCHEDULE_EXACT_ALARM"
        }) {
            assertTrue(permission + " is missing from the merged manifest", merged.contains(permission));
        }
    }

    // neither of these is in the app's own manifest; both arrive through the merge, and both are
    // requested at runtime from src/. CAMERA is the dangerous one: @capacitor/camera treats an
    // UNDECLARED camera permission as permanently granted (CameraPlugin.kt), so losing it here
    // makes Camera.requestPermissions() answer "granted" and the capture fails later, elsewhere
    @Test
    public void theMergePullsInThePluginContributedPermissions() {
        Set<String> merged = mergedPermissions();
        assertTrue(
            "CAMERA is gone from the merge, so @capacitor/camera will silently self-grant it",
            merged.contains("android.permission.CAMERA")
        );
        assertTrue(
            "ACTIVITY_RECOGNITION should arrive from @capgo/capacitor-pedometer's manifest",
            merged.contains("android.permission.ACTIVITY_RECOGNITION")
        );
    }

    // haptics is the quietest failure of the three: Vibrator.vibrate() without VIBRATE throws a
    // SecurityException that useHaptics' own catch swallows, so every buzz in the app just stops
    @Test
    public void theMergePullsInThePermissionsTheHapticsAndAlarmPluginsNeed() {
        Set<String> merged = mergedPermissions();
        assertTrue(
            "VIBRATE is gone, so every haptic throws into useHaptics' catch and the app goes numb",
            merged.contains("android.permission.VIBRATE")
        );
        assertTrue(
            "RECEIVE_BOOT_COMPLETED is gone, so every scheduled reminder dies at the next reboot",
            merged.contains("android.permission.RECEIVE_BOOT_COMPLETED")
        );
        assertTrue(
            "WAKE_LOCK is gone; the publisher needs it to post from a wakeup alarm",
            merged.contains("android.permission.WAKE_LOCK")
        );
    }

    // android treats declaring both as a configuration error, and USE_EXACT_ALARM is restricted to
    // alarm-clock and calendar apps on Play, which sky is neither
    @Test
    public void theExactAlarmPermissionIsNotDoubled() {
        Set<String> merged = mergedPermissions();
        assertTrue(
            "SCHEDULE_EXACT_ALARM and USE_EXACT_ALARM must not both be declared",
            !merged.contains("android.permission.SCHEDULE_EXACT_ALARM")
                || !merged.contains("android.permission.USE_EXACT_ALARM")
        );
    }

    // none of these are in the app's manifest; all three arrive from @capacitor/local-notifications.
    // a broadcast the merge dropped means the alarm fires into nothing: the publisher posts the
    // notification, the dismiss receiver clears it, and the restore receiver re-arms it after a reboot
    @Test
    public void theLocalNotificationReceiversSurviveTheMerge() throws Exception {
        for (String receiver : new String[] {
            "com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher",
            "com.capacitorjs.plugins.localnotifications.NotificationDismissReceiver",
            "com.capacitorjs.plugins.localnotifications.LocalNotificationRestoreReceiver"
        }) {
            assertNotNull(receiver + " is not in the merged manifest", receiverInfo(receiver));
        }
    }

    // alarms do not survive a reboot, so this receiver is the only thing that re-arms them. it has to
    // be reachable from the boot broadcast and closed to everyone else
    @Test
    public void theRestoreReceiverIsBootTriggeredAndNotExported() throws Exception {
        String name = "com.capacitorjs.plugins.localnotifications.LocalNotificationRestoreReceiver";
        ActivityInfo info = receiverInfo(name);
        assertFalse(
            "an exported restore receiver lets any app forge the boot broadcast",
            info.exported
        );
        assertTrue(
            "directBootAware is what lets it re-arm before the user unlocks after a reboot",
            info.directBootAware
        );

        boolean handlesBoot = false;
        for (android.content.pm.ResolveInfo resolved : context()
            .getPackageManager()
            .queryBroadcastReceivers(new android.content.Intent(android.content.Intent.ACTION_BOOT_COMPLETED), 0)) {
            if (name.equals(resolved.activityInfo.name)) handlesBoot = true;
        }
        assertTrue(name + " no longer answers ACTION_BOOT_COMPLETED", handlesBoot);
    }

    // the app's own manifest declares them too, so the merge must not have dropped either copy
    @Test
    public void theMergeIsASupersetOfTheAppManifest() {
        Set<String> merged = mergedPermissions();
        for (String declared : AndroidManifestXml.requestedPermissions()) {
            assertTrue(declared + " was declared but did not survive the merge", merged.contains(declared));
        }
    }

    // capacitor.config.ts sets androidSplashResourceName: 'splash' and launchAutoHide: false, so a
    // missing drawable is a permanently blank launch screen rather than a build error
    @Test
    public void theSplashDrawableTheConfigNamesExists() {
        int id = context().getResources().getIdentifier("splash", "drawable", PACKAGE);
        assertNotEquals("no @drawable/splash for androidSplashResourceName", 0, id);
        assertTrue(RepoFiles.read("capacitor.config.ts").contains("androidSplashResourceName: 'splash'"));
    }

    private ActivityInfo receiverInfo(String className) {
        try {
            return context()
                .getPackageManager()
                .getReceiverInfo(new android.content.ComponentName(PACKAGE, className), 0);
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    private Set<String> mergedPermissions() {
        try {
            PackageInfo info = context()
                .getPackageManager()
                .getPackageInfo(PACKAGE, PackageManager.GET_PERMISSIONS);
            String[] requested = info.requestedPermissions;
            return requested == null ? new LinkedHashSet<>() : new LinkedHashSet<>(Arrays.asList(requested));
        } catch (PackageManager.NameNotFoundException e) {
            throw new AssertionError(e);
        }
    }
}
