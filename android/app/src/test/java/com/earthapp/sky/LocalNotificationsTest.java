package com.earthapp.sky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.capacitorjs.plugins.localnotifications.NotificationChannelManager;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.shadows.ShadowAlarmManager;
import org.robolectric.shadows.ShadowNotificationManager;
import org.robolectric.shadows.ShadowPendingIntent;

import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What the app actually hands the OS when it schedules a reminder.
 *
 * <p>Everything here drives the shipped {@code @capacitor/local-notifications} Android code with the
 * exact JSON {@code src/composables/useLocalNotifications.ts} sends over the bridge, then reads the
 * result out of {@code AlarmManager} and {@code NotificationManager}. That is the only layer where a
 * scheduling mistake is visible: the TypeScript side awaits a resolved promise whether the alarm
 * landed, landed at the wrong time, or was dropped for a missing channel.</p>
 *
 * <p>Robolectric is load-bearing twice over - {@code JSObject extends org.json.JSONObject}, which is
 * a throwing stub outside it, and the alarm/notification shadows are what make the OS side
 * readable at all.</p>
 */
@RunWith(RobolectricTestRunner.class)
public class LocalNotificationsTest {

    private static final String NOTIF_TS = "src/composables/useLocalNotifications.ts";

    /** the format LocalNotificationSchedule parses; a JS Date crosses the bridge as this string */
    private static final String JS_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";

    private static final int STEP_UNLOCK_ID = 2_000_000_123;
    private static final String ROUTE = "/tabs/quests/q1?step=2";

    private Context context;
    private LocalNotificationManager manager;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        manager = new LocalNotificationManager(
            new NotificationStorage(context),
            null, // no activity: the plugin falls back to the launch intent, as it does from a cold start
            context,
            CapConfig.loadDefault(context)
        );
    }

    // #region channels

    // android silently drops a notification posted to a channel that was never created, and the
    // plugin's schedule() still resolves - so a channel that fails to register is a feature that
    // goes quiet with no error anywhere
    @Test
    public void theChannelsTheWebLayerDeclaresRegisterOnTheOs() {
        Map<String, Channel> declared = declaredChannels();
        assertEquals("useLocalNotifications.ts no longer declares exactly two channels", 2, declared.size());

        NotificationChannelManager channels = new NotificationChannelManager(context);
        for (Channel channel : declared.values()) {
            JSObject data = new JSObject();
            data.put("id", channel.id);
            data.put("name", channel.name);
            data.put("importance", channel.importance);
            TestPluginCall call = new TestPluginCall(data);
            channels.createChannel(call);
            call.assertResolved();
        }

        NotificationManager os = context.getSystemService(NotificationManager.class);
        for (Channel channel : declared.values()) {
            NotificationChannel registered = os.getNotificationChannel(channel.id);
            assertNotNull("no OS channel for " + channel.id, registered);
            assertEquals(channel.name, String.valueOf(registered.getName()));
            assertEquals(
                channel.id + " registered at the wrong importance",
                channel.importance,
                registered.getImportance()
            );
        }
    }

    // literals, not the parsed values, because the parsed ones would be asserted against themselves.
    // a quest-step unlock has to be able to peek (IMPORTANCE_HIGH); the calm digest deliberately must
    // not, and dropping it to LOW would silence it in the shade
    @Test
    public void theImportanceOfEachChannelMatchesItsProductIntent() {
        Map<String, Channel> declared = declaredChannels();
        assertEquals("quest-reminders", declared.get("QUEST_REMINDERS").id);
        assertEquals(NotificationManager.IMPORTANCE_HIGH, declared.get("QUEST_REMINDERS").importance);
        assertEquals("daily-content", declared.get("DAILY_CONTENT").id);
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, declared.get("DAILY_CONTENT").importance);
    }

    @Test
    public void aChannelWithoutAnIdIsRejectedRatherThanRegisteredNameless() {
        JSObject data = new JSObject();
        data.put("name", "Quest Reminders");
        TestPluginCall call = new TestPluginCall(data);
        new NotificationChannelManager(context).createChannel(call);
        call.assertRejected("Channel missing identifier");
        assertTrue(context.getSystemService(NotificationManager.class).getNotificationChannels().isEmpty());
    }

    @Test
    public void aChannelWithoutANameIsRejected() {
        JSObject data = new JSObject();
        data.put("id", "quest-reminders");
        TestPluginCall call = new TestPluginCall(data);
        new NotificationChannelManager(context).createChannel(call);
        call.assertRejected("Channel missing name");
    }

    // #endregion

    // #region scheduling

    @Test
    public void aFutureScheduleSetsExactlyOneAlarmOnTheTimedPublisher() {
        long at = System.currentTimeMillis() + 3_600_000L;
        schedule(stepUnlock(at, false));

        List<ShadowAlarmManager.ScheduledAlarm> alarms = alarms();
        assertEquals("expected exactly one alarm for one notification", 1, alarms.size());

        ShadowAlarmManager.ScheduledAlarm alarm = alarms.get(0);
        assertEquals("the alarm did not land on the requested instant", at, alarm.getTriggerAtMs());
        assertEquals("a one-shot reminder must not repeat", 0L, alarm.getIntervalMs());

        Intent fired = savedIntent(alarm.operation);
        assertEquals(
            "the alarm must broadcast to the plugin's publisher or nothing posts",
            TimedNotificationPublisher.class.getName(),
            fired.getComponent().getClassName()
        );
        assertEquals(
            STEP_UNLOCK_ID,
            fired.getIntExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, -1)
        );
    }

    // the tap route is the whole point of the reminder; it rides inside the built Notification's
    // content intent, several hops from the JSON the web layer passed in
    @Test
    public void theTapRouteSurvivesAllTheWayIntoTheContentIntent() {
        schedule(stepUnlock(System.currentTimeMillis() + 3_600_000L, false));

        Intent fired = savedIntent(alarms().get(0).operation);
        Notification notification = fired.getParcelableExtra(TimedNotificationPublisher.NOTIFICATION_KEY);
        assertNotNull("the alarm carries no built Notification", notification);
        assertNotNull("the notification has no content intent, so a tap opens nothing", notification.contentIntent);

        Intent tap = savedIntent(notification.contentIntent);
        String source = tap.getStringExtra(LocalNotificationManager.NOTIFICATION_OBJ_INTENT_KEY);
        assertNotNull("no notification payload on the tap intent", source);

        // parsed rather than substring-matched, because this is exactly what
        // handleNotificationActionPerformed does before handing the payload back to the router
        JSObject parsed;
        try {
            parsed = new JSObject(source);
        } catch (org.json.JSONException e) {
            throw new AssertionError("the tap payload is not the JSON the router parses: " + source);
        }
        JSObject extra = parsed.getJSObject("extra");
        assertNotNull("no extra on the tap payload: " + source, extra);
        assertEquals(
            "the extra.route the router reads did not survive into the tap intent",
            ROUTE,
            extra.getString("route")
        );
    }

    // omitted allowWhileIdle is RTC, which does NOT wake the device and which Doze may defer.
    // allowWhileIdle:true is RTC_WAKEUP. both branches are pinned so the consequence of the flag is
    // visible here rather than in a bug report about late reminders.
    //
    // the exact-alarm state is set explicitly in both halves because the plugin branches on it
    // FIRST, and a test that leaned on the shadow's default would be asserting whichever arm the
    // default happened to pick
    @Test
    public void theAlarmTypeFollowsTheAllowWhileIdleFlagWithoutTheExactPermission() {
        ShadowAlarmManager.setCanScheduleExactAlarms(false);
        assertAlarmTypesFollowTheIdleFlag();
    }

    @Test
    public void theAlarmTypeFollowsTheAllowWhileIdleFlagWithTheExactPermission() {
        ShadowAlarmManager.setCanScheduleExactAlarms(true);
        assertAlarmTypesFollowTheIdleFlag();
    }

    private void assertAlarmTypesFollowTheIdleFlag() {
        long at = System.currentTimeMillis() + 3_600_000L;

        schedule(stepUnlock(at, false));
        ShadowAlarmManager.ScheduledAlarm lenient = alarms().get(0);
        assertEquals(
            "a reminder without allowWhileIdle must not be a wakeup alarm",
            AlarmManager.RTC,
            lenient.getType()
        );
        assertFalse(lenient.isAllowWhileIdle());

        ShadowAlarmManager.ScheduledAlarm before = lenient;
        schedule(notification(STEP_UNLOCK_ID + 1, at, true));
        ShadowAlarmManager.ScheduledAlarm idle = null;
        for (ShadowAlarmManager.ScheduledAlarm alarm : alarms()) {
            if (alarm != before) idle = alarm;
        }
        assertNotNull("the allowWhileIdle reminder was never scheduled", idle);
        assertEquals(
            "allowWhileIdle must escape Doze, which needs a wakeup alarm",
            AlarmManager.RTC_WAKEUP,
            idle.getType()
        );
        assertTrue(idle.isAllowWhileIdle());
    }

    // targetSdk 36 means SCHEDULE_EXACT_ALARM is NOT granted on install, so the false branch is the
    // one real users take. it must still schedule - just inexactly - rather than dropping the alarm
    @Test
    public void aRefusedExactAlarmPermissionDowngradesInsteadOfDroppingTheReminder() {
        long at = System.currentTimeMillis() + 3_600_000L;

        ShadowAlarmManager.setCanScheduleExactAlarms(false);
        schedule(stepUnlock(at, false));
        List<ShadowAlarmManager.ScheduledAlarm> inexact = alarms();
        assertEquals("the reminder was dropped when exact alarms were unavailable", 1, inexact.size());
        assertEquals(at, inexact.get(0).getTriggerAtMs());
        assertEquals(
            "without the permission the plugin must use a windowed alarm",
            ShadowAlarmManager.WINDOW_HEURISTIC,
            inexact.get(0).getWindowLengthMs()
        );

        ShadowAlarmManager.reset();
        ShadowAlarmManager.setCanScheduleExactAlarms(true);
        schedule(stepUnlock(at, false));
        assertEquals(
            "with the permission the plugin must ask for an exact alarm",
            ShadowAlarmManager.WINDOW_EXACT,
            alarms().get(0).getWindowLengthMs()
        );
    }

    // the web layer already refuses to schedule inside 30s of the unlock; this is the native half of
    // the same guard, and it fails closed - no alarm at all rather than one that fires immediately
    @Test
    public void aScheduleInThePastSetsNoAlarm() {
        schedule(stepUnlock(System.currentTimeMillis() - 60_000L, false));
        assertTrue("a past-dated reminder was scheduled anyway", alarms().isEmpty());
    }

    // POST_NOTIFICATIONS is denied until the user grants it on API 33+, and this is what the app sees
    // then: an explicit rejection, which is why ensureLocalNotificationPermission() has to run first
    @Test
    public void disabledNotificationsRejectTheScheduleInsteadOfSwallowingIt() {
        shadowNotificationManager().setNotificationsEnabled(false);

        TestPluginCall call = new TestPluginCall(new JSObject());
        JSONArray ids = manager.schedule(
            call,
            Collections.singletonList(stepUnlock(System.currentTimeMillis() + 3_600_000L, false))
        );

        org.junit.Assert.assertNull("schedule() reported success with notifications disabled", ids);
        call.assertRejected("Notifications not enabled on this device");
        assertTrue(alarms().isEmpty());
    }

    // #endregion

    // #region cancellation

    @Test
    public void cancellingARemindersIdClearsItsAlarm() {
        schedule(stepUnlock(System.currentTimeMillis() + 3_600_000L, false));
        assertEquals(1, alarms().size());

        JSObject notification = new JSObject();
        notification.put("id", STEP_UNLOCK_ID);
        JSONArray list = new JSONArray();
        list.put(notification);
        JSObject data = new JSObject();
        data.put("notifications", list);

        TestPluginCall call = new TestPluginCall(data);
        manager.cancel(call);
        call.assertResolved();

        assertTrue("the alarm outlived the cancel, so the reminder still fires", alarms().isEmpty());
    }

    // cancelling one id must not take its neighbours with it; the step-unlock band holds one id per
    // (quest, step) and they are cancelled individually as steps complete
    @Test
    public void cancellingOneReminderLeavesTheOthersScheduled() {
        long at = System.currentTimeMillis() + 3_600_000L;
        manager.schedule(null, Collections.singletonList(stepUnlock(at, false)));
        manager.schedule(null, Collections.singletonList(notification(STEP_UNLOCK_ID + 1, at, false)));
        assertEquals(2, alarms().size());

        JSObject notification = new JSObject();
        notification.put("id", STEP_UNLOCK_ID);
        JSONArray list = new JSONArray();
        list.put(notification);
        JSObject data = new JSObject();
        data.put("notifications", list);
        manager.cancel(new TestPluginCall(data));

        List<ShadowAlarmManager.ScheduledAlarm> left = alarms();
        assertEquals(1, left.size());
        assertEquals(
            STEP_UNLOCK_ID + 1,
            savedIntent(left.get(0).operation).getIntExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, -1)
        );
    }

    // cancelAllStepUnlockNotifications() builds its id list by filtering pending notifications, so an
    // empty list is reachable. it must not be read as "cancel everything"
    @Test
    public void anEmptyCancelListIsRejectedRatherThanCancellingEverything() {
        schedule(stepUnlock(System.currentTimeMillis() + 3_600_000L, false));

        JSObject data = new JSObject();
        data.put("notifications", new JSONArray());

        TestPluginCall call = new TestPluginCall(data);
        manager.cancel(call);
        call.assertRejected("Must provide notifications array as notifications option");
        assertEquals("an empty cancel wiped a scheduled reminder", 1, alarms().size());
    }

    // #endregion

    // #region id space

    // javascript numbers are doubles and typescript will not notice an id that overflows a java int,
    // but LocalNotification.setId takes an Integer - so the bands have to be checked on this side
    @Test
    public void everyIdTheWebLayerCanMintFitsInAJavaInt() {
        String ts = RepoFiles.read(NOTIF_TS);
        long stepBase = numericConstant(ts, "STEP_UNLOCK_BASE");
        long dailyBase = numericConstant(ts, "DAILY_BASE");
        long declaredMax = numericConstant(ts, "MAX_NOTIFICATION_ID");

        assertEquals(
            "MAX_NOTIFICATION_ID no longer matches Integer.MAX_VALUE",
            Integer.MAX_VALUE,
            declaredMax
        );
        assertTrue("STEP_UNLOCK_BASE must be below DAILY_BASE", stepBase < dailyBase);
        assertTrue("the whole step-unlock band must fit in an int", dailyBase <= Integer.MAX_VALUE);
        // the daily band runs upward from DAILY_BASE and has no ceiling of its own in ts
        assertTrue("DAILY_BASE leaves no headroom below Integer.MAX_VALUE", dailyBase < Integer.MAX_VALUE);
    }

    // measured, not assumed: org.json narrows a too-large id with a C-style cast, so the plugin
    // schedules a DIFFERENT notification rather than refusing. that silent substitution is why the
    // bands above have to be checked on this side of the bridge
    @Test
    public void anIdBeyondTheIntRangeIsSilentlyTruncatedRatherThanRejected() {
        long requested = 4_294_967_296L; // 2^32, which truncates to 0
        JSObject data = jsonFor(System.currentTimeMillis() + 3_600_000L, false);
        data.put("id", requested);

        LocalNotification overflowed = build(data);
        assertNotNull("the plugin dropped the id entirely", overflowed.getId());
        assertFalse(
            "an out-of-range id would have to be rejected for this test to be wrong",
            requested == overflowed.getId().longValue()
        );

        schedule(overflowed);
        assertEquals(
            "the alarm was filed under the truncated id, so cancel() by the real id would miss it",
            overflowed.getId().intValue(),
            savedIntent(alarms().get(0).operation)
                .getIntExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, -1)
        );
    }

    // #endregion

    // #region helpers

    private LocalNotification stepUnlock(long at, boolean allowWhileIdle) {
        return notification(STEP_UNLOCK_ID, at, allowWhileIdle);
    }

    private LocalNotification notification(int id, long at, boolean allowWhileIdle) {
        JSObject data = jsonFor(at, allowWhileIdle);
        data.put("id", id);
        return build(data);
    }

    /** the exact payload scheduleStepUnlockNotification() puts on the bridge */
    private JSObject jsonFor(long at, boolean allowWhileIdle) {
        SimpleDateFormat sdf = new SimpleDateFormat(JS_DATE_FORMAT, Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));

        JSObject schedule = new JSObject();
        schedule.put("at", sdf.format(new Date(at)));
        if (allowWhileIdle) schedule.put("allowWhileIdle", true);

        JSObject extra = new JSObject();
        extra.put("route", ROUTE);

        JSObject data = new JSObject();
        data.put("title", "Quest Step Unlocked!");
        data.put("body", "Your next step is ready to complete.");
        data.put("channelId", "quest-reminders");
        data.put("schedule", schedule);
        data.put("extra", extra);
        return data;
    }

    private static LocalNotification build(JSObject data) {
        try {
            return LocalNotification.buildNotificationFromJSObject(data);
        } catch (Exception e) {
            throw new AssertionError("the plugin could not parse the payload the app sends: " + e);
        }
    }

    private void schedule(LocalNotification notification) {
        TestPluginCall call = new TestPluginCall(new JSObject());
        JSONArray ids = manager.schedule(call, Collections.singletonList(notification));
        assertNotNull("schedule() refused the payload: " + call.rejection(), ids);
    }

    private List<ShadowAlarmManager.ScheduledAlarm> alarms() {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return Shadows.shadowOf(alarmManager).getScheduledAlarms();
    }

    private ShadowNotificationManager shadowNotificationManager() {
        return Shadows.shadowOf(context.getSystemService(NotificationManager.class));
    }

    private static Intent savedIntent(PendingIntent pendingIntent) {
        assertNotNull("no PendingIntent on the alarm", pendingIntent);
        ShadowPendingIntent shadow = Shadows.shadowOf(pendingIntent);
        Intent[] intents = shadow.getSavedIntents();
        assertTrue("the PendingIntent wraps no intent", intents != null && intents.length > 0);
        return intents[intents.length - 1];
    }

    private static long numericConstant(String ts, String name) {
        Matcher matcher = Pattern.compile(name + ":?\\s*=?\\s*([0-9_]+)").matcher(ts);
        assertTrue("no " + name + " in " + NOTIF_TS, matcher.find());
        return Long.parseLong(matcher.group(1).replace("_", ""));
    }

    /** the channel definitions read out of the createChannel() calls in the web layer */
    private static Map<String, Channel> declaredChannels() {
        String ts = RepoFiles.read(NOTIF_TS);
        Map<String, Channel> ids = new LinkedHashMap<>();

        Matcher constants = Pattern
            .compile("(\\w+): '([a-z0-9-]+)'")
            .matcher(block(ts, "LOCAL_NOTIF_CHANNELS"));
        while (constants.find()) {
            ids.put(constants.group(1), new Channel(constants.group(2)));
        }
        assertFalse("no LOCAL_NOTIF_CHANNELS entries in " + NOTIF_TS, ids.isEmpty());

        Matcher calls = Pattern
            .compile("createChannel\\(\\{[^}]*?id: LOCAL_NOTIF_CHANNELS\\.(\\w+)[^}]*?name: '([^']*)'[^}]*?importance: (\\d+)")
            .matcher(ts);
        int found = 0;
        while (calls.find()) {
            Channel channel = ids.get(calls.group(1));
            assertNotNull("createChannel uses an unknown constant " + calls.group(1), channel);
            channel.name = calls.group(2);
            channel.importance = Integer.parseInt(calls.group(3));
            found++;
        }
        assertEquals("every declared channel constant must have a createChannel call", ids.size(), found);
        return ids;
    }

    private static String block(String source, String name) {
        int start = source.indexOf(name);
        assertTrue("no " + name + " in " + NOTIF_TS, start >= 0);
        int end = source.indexOf("}", start);
        assertTrue("unterminated " + name, end > start);
        return source.substring(start, end);
    }

    private static final class Channel {

        final String id;
        String name;
        int importance = -1;

        Channel(String id) {
            this.id = id;
        }
    }

    // #endregion
}
