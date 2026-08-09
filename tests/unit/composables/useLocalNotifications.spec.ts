import { beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
	isNative: vi.fn(() => true),
	platform: vi.fn(() => 'ios')
}));

const ln = vi.hoisted(() => ({
	checkPermissions: vi.fn(),
	requestPermissions: vi.fn(),
	createChannel: vi.fn(),
	schedule: vi.fn(),
	cancel: vi.fn(),
	getPending: vi.fn(),
	addListener: vi.fn()
}));

const navigateToMock = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: cap.isNative, getPlatform: cap.platform }
}));

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));

// nuxt's auto-import resolves `navigateTo` to this module; no @vue/test-utils here so
// mockNuxtImport is unavailable
vi.mock('#app/composables/router', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	navigateTo: navigateToMock
}));

import {
	LOCAL_NOTIF,
	LOCAL_NOTIF_CHANNELS,
	MAX_NOTIFICATION_ID,
	cancelAllStepUnlockNotifications,
	cancelStepUnlockNotification,
	createLocalNotificationChannels,
	ensureLocalNotificationPermission,
	initLocalNotificationRouting,
	scheduleStepUnlockNotification,
	stepUnlockNotificationId
} from '~/composables/useLocalNotifications';

type ActionHandler = (action: unknown) => void;

function lastListenerHandler(): ActionHandler {
	const call = ln.addListener.mock.calls.at(-1);
	if (!call) throw new Error('no listener was registered');
	return call[1] as ActionHandler;
}

beforeEach(() => {
	vi.clearAllMocks();
	cap.isNative.mockReturnValue(true);
	cap.platform.mockReturnValue('ios');
	ln.checkPermissions.mockResolvedValue({ display: 'granted' });
	ln.requestPermissions.mockResolvedValue({ display: 'granted' });
	ln.createChannel.mockResolvedValue(undefined);
	ln.schedule.mockResolvedValue(undefined);
	ln.cancel.mockResolvedValue(undefined);
	ln.getPending.mockResolvedValue({ notifications: [] });
	ln.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
});

describe('id bands', () => {
	it('keeps step-unlock ids inside their own band, never touching the daily band', () => {
		// probe a wide spread; a bad modulo would leak into DAILY_BASE and cancel the digests
		for (const questId of ['a', 'quest-1', 'zzzzzzzzzzzzzzzzzzzzzzz', '', '0']) {
			for (const step of [0, 1, 7, 99, 100000]) {
				const id = stepUnlockNotificationId(questId, step);
				expect(id).toBeGreaterThanOrEqual(LOCAL_NOTIF.STEP_UNLOCK_BASE);
				expect(id).toBeLessThan(LOCAL_NOTIF.DAILY_BASE);
				expect(id).toBeLessThanOrEqual(MAX_NOTIFICATION_ID);
				expect(Number.isInteger(id)).toBe(true);
			}
		}
	});

	it('is deterministic per (quest, step) and separates neighbouring steps', () => {
		expect(stepUnlockNotificationId('q1', 3)).toBe(stepUnlockNotificationId('q1', 3));
		expect(stepUnlockNotificationId('q1', 3)).not.toBe(stepUnlockNotificationId('q1', 4));
		expect(stepUnlockNotificationId('q1', 3)).not.toBe(stepUnlockNotificationId('q2', 3));
	});

	it('leaves room above the daily band for the digest ids', () => {
		// useDailyNotifications lays down DAILY_BASE + slotIndex * 10 + day
		expect(LOCAL_NOTIF.DAILY_BASE).toBeGreaterThan(LOCAL_NOTIF.STEP_UNLOCK_BASE);
		expect(LOCAL_NOTIF.DAILY_BASE + 2 * 10 + 2).toBeLessThanOrEqual(MAX_NOTIFICATION_ID);
	});
});

describe('ensureLocalNotificationPermission', () => {
	it('is false off-native and never touches the plugin', async () => {
		cap.isNative.mockReturnValue(false);
		expect(await ensureLocalNotificationPermission()).toBe(false);
		expect(ln.checkPermissions).not.toHaveBeenCalled();
	});

	it('accepts an existing grant without re-requesting', async () => {
		expect(await ensureLocalNotificationPermission()).toBe(true);
		expect(ln.requestPermissions).not.toHaveBeenCalled();
	});

	it('never re-prompts a refusal', async () => {
		ln.checkPermissions.mockResolvedValue({ display: 'denied' });
		expect(await ensureLocalNotificationPermission()).toBe(false);
		expect(ln.requestPermissions).not.toHaveBeenCalled();
	});

	it('requests when the user has not decided and honours the answer', async () => {
		ln.checkPermissions.mockResolvedValue({ display: 'prompt' });
		ln.requestPermissions.mockResolvedValue({ display: 'granted' });
		expect(await ensureLocalNotificationPermission()).toBe(true);

		ln.requestPermissions.mockResolvedValue({ display: 'denied' });
		expect(await ensureLocalNotificationPermission()).toBe(false);
	});

	it('is false when the plugin throws', async () => {
		ln.checkPermissions.mockRejectedValue(new Error('bridge down'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await ensureLocalNotificationPermission()).toBe(false);
	});
});

describe('createLocalNotificationChannels', () => {
	it('creates both channels on android with distinct importances', async () => {
		cap.platform.mockReturnValue('android');
		await createLocalNotificationChannels();
		expect(ln.createChannel).toHaveBeenCalledTimes(2);
		expect(ln.createChannel).toHaveBeenCalledWith(
			expect.objectContaining({ id: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS, importance: 4 })
		);
		expect(ln.createChannel).toHaveBeenCalledWith(
			expect.objectContaining({ id: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT, importance: 3 })
		);
	});

	it('is a no-op on ios (channels are an android concept)', async () => {
		await createLocalNotificationChannels();
		expect(ln.createChannel).not.toHaveBeenCalled();
	});

	it('swallows a channel failure so scheduling can still proceed', async () => {
		cap.platform.mockReturnValue('android');
		ln.createChannel.mockRejectedValue(new Error('channel exists'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(createLocalNotificationChannels()).resolves.toBeUndefined();
	});
});

describe('scheduleStepUnlockNotification', () => {
	const base = {
		questId: 'q-42',
		questTitle: 'Morning Ridge',
		stepIndex: 2
	};

	it('schedules the exact payload at the unlock time', async () => {
		const unlockAt = Date.now() + 3_600_000;
		await scheduleStepUnlockNotification({ ...base, unlockAt });

		expect(ln.schedule).toHaveBeenCalledTimes(1);
		const payload = ln.schedule.mock.calls[0]![0] as {
			notifications: Array<Record<string, unknown>>;
		};
		expect(payload.notifications).toHaveLength(1);
		const notification = payload.notifications[0]!;
		expect(notification.id).toBe(stepUnlockNotificationId('q-42', 2));
		expect(notification.title).toBe('Quest Step Unlocked!');
		expect(notification.body).toContain('Morning Ridge');
		expect(notification.channelId).toBe(LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS);
		expect(notification.extra).toEqual({ route: '/tabs/quests/q-42?step=2' });
		expect((notification.schedule as { at: Date }).at.getTime()).toBe(unlockAt);
	});

	it('cancels the previous notification for the same step before scheduling', async () => {
		await scheduleStepUnlockNotification({ ...base, unlockAt: Date.now() + 3_600_000 });
		const id = stepUnlockNotificationId('q-42', 2);
		expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id }] });
		// dedupe only works if the cancel lands first; a schedule-then-cancel order kills the reminder
		expect(ln.cancel.mock.invocationCallOrder[0]!).toBeLessThan(
			ln.schedule.mock.invocationCallOrder[0]!
		);
	});

	it('does nothing off-native', async () => {
		cap.isNative.mockReturnValue(false);
		await scheduleStepUnlockNotification({ ...base, unlockAt: Date.now() + 3_600_000 });
		expect(ln.schedule).not.toHaveBeenCalled();
		expect(ln.checkPermissions).not.toHaveBeenCalled();
	});

	it('skips unlocks that already happened or land inside the 30s guard', async () => {
		await scheduleStepUnlockNotification({ ...base, unlockAt: Date.now() - 1 });
		await scheduleStepUnlockNotification({ ...base, unlockAt: Date.now() + 29_000 });
		expect(ln.schedule).not.toHaveBeenCalled();
		expect(ln.cancel).not.toHaveBeenCalled();
	});

	it('does not schedule when the permission is refused', async () => {
		ln.checkPermissions.mockResolvedValue({ display: 'denied' });
		await scheduleStepUnlockNotification({ ...base, unlockAt: Date.now() + 3_600_000 });
		expect(ln.schedule).not.toHaveBeenCalled();
	});

	it('swallows a scheduling failure', async () => {
		ln.schedule.mockRejectedValue(new Error('too many pending'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			scheduleStepUnlockNotification({ ...base, unlockAt: Date.now() + 3_600_000 })
		).resolves.toBeUndefined();
	});
});

describe('cancelStepUnlockNotification', () => {
	it('cancels exactly the id the scheduler would have used', async () => {
		await cancelStepUnlockNotification('q-42', 2);
		expect(ln.cancel).toHaveBeenCalledWith({
			notifications: [{ id: stepUnlockNotificationId('q-42', 2) }]
		});
	});

	it('does nothing off-native', async () => {
		cap.isNative.mockReturnValue(false);
		await cancelStepUnlockNotification('q-42', 2);
		expect(ln.cancel).not.toHaveBeenCalled();
	});
});

describe('cancelAllStepUnlockNotifications', () => {
	it('cancels only the step-unlock band and leaves the daily digests alone', async () => {
		ln.getPending.mockResolvedValue({
			notifications: [
				{ id: LOCAL_NOTIF.STEP_UNLOCK_BASE },
				{ id: LOCAL_NOTIF.DAILY_BASE - 1 },
				{ id: LOCAL_NOTIF.DAILY_BASE },
				{ id: LOCAL_NOTIF.DAILY_BASE + 21 },
				{ id: 5 }
			]
		});
		await cancelAllStepUnlockNotifications();
		expect(ln.cancel).toHaveBeenCalledWith({
			notifications: [{ id: LOCAL_NOTIF.STEP_UNLOCK_BASE }, { id: LOCAL_NOTIF.DAILY_BASE - 1 }]
		});
	});

	it('coerces string ids the android bridge sometimes returns', async () => {
		ln.getPending.mockResolvedValue({
			notifications: [{ id: String(LOCAL_NOTIF.STEP_UNLOCK_BASE + 5) }]
		});
		await cancelAllStepUnlockNotifications();
		expect(ln.cancel).toHaveBeenCalledWith({
			notifications: [{ id: LOCAL_NOTIF.STEP_UNLOCK_BASE + 5 }]
		});
	});

	it('makes no cancel call when nothing in the band is pending', async () => {
		ln.getPending.mockResolvedValue({ notifications: [{ id: LOCAL_NOTIF.DAILY_BASE }] });
		await cancelAllStepUnlockNotifications();
		expect(ln.cancel).not.toHaveBeenCalled();
	});

	it('swallows a getPending failure', async () => {
		ln.getPending.mockRejectedValue(new Error('no permission'));
		await expect(cancelAllStepUnlockNotifications()).resolves.toBeUndefined();
		expect(ln.cancel).not.toHaveBeenCalled();
	});
});

describe('initLocalNotificationRouting', () => {
	it('registers no listener off-native', () => {
		cap.isNative.mockReturnValue(false);
		const stop = initLocalNotificationRouting();
		expect(ln.addListener).not.toHaveBeenCalled();
		expect(stop).toBeTypeOf('function');
		stop();
	});

	it('routes a tapped notification to its extra.route', async () => {
		const stop = initLocalNotificationRouting();
		await vi.waitFor(() => expect(ln.addListener).toHaveBeenCalledOnce());
		expect(ln.addListener.mock.calls[0]![0]).toBe('localNotificationActionPerformed');

		lastListenerHandler()({ notification: { extra: { route: '/tabs/quests/q1?step=2' } } });
		expect(navigateToMock).toHaveBeenCalledWith('/tabs/quests/q1?step=2');
		stop();
	});

	it('ignores routes that are absent, non-string, or not app-internal', async () => {
		const stop = initLocalNotificationRouting();
		await vi.waitFor(() => expect(ln.addListener).toHaveBeenCalledOnce());
		const handler = lastListenerHandler();

		handler({ notification: { extra: {} } });
		handler({ notification: {} });
		handler({});
		handler({ notification: { extra: { route: 42 } } });
		handler({ notification: { extra: { route: 'https://evil.example/x' } } });
		expect(navigateToMock).not.toHaveBeenCalled();
		stop();
	});

	it('removes the listener on teardown', async () => {
		const remove = vi.fn(async () => {});
		ln.addListener.mockResolvedValue({ remove });
		const stop = initLocalNotificationRouting();
		await vi.waitFor(() => expect(ln.addListener).toHaveBeenCalledOnce());
		stop();
		expect(remove).toHaveBeenCalledOnce();
	});

	it('removes the listener even when teardown wins the race against addListener', async () => {
		const remove = vi.fn(async () => {});
		let resolveHandle: (h: { remove: () => Promise<void> }) => void = () => {};
		ln.addListener.mockReturnValue(
			new Promise<{ remove: () => Promise<void> }>((r) => {
				resolveHandle = r;
			})
		);

		const stop = initLocalNotificationRouting();
		stop();
		resolveHandle({ remove });
		await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
	});
});
