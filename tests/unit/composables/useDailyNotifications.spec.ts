import type { NatureMinutes } from 'types/trails';
import type { UserQuestProgress } from 'types/user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const appPlugin = vi.hoisted(() => ({ addListener: vi.fn() }));
const fetchUserQuest = vi.hoisted(() => vi.fn());
const fetchNatureMinutes = vi.hoisted(() => vi.fn());
const fetchExpedition = vi.hoisted(() => vi.fn());
const trailRuns = vi.hoisted(() => ({ value: new Map<string, unknown>() }));
const authRef = vi.hoisted(() => ({
	store: null as null | { sessionToken: string | null; currentUser: { id: string } | null }
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: cap.isNative, getPlatform: cap.platform },
	registerPlugin: () => ({})
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));
vi.mock('@capacitor/app', () => ({ App: appPlugin }));
vi.mock('@earth-app/crust/src/composables/useUser', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useUser: () => ({ fetchUserQuest })
}));
vi.mock('@earth-app/crust/src/composables/useTrails', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useTrails: () => ({ fetchNatureMinutes })
}));
vi.mock('@earth-app/crust/src/composables/useCircles', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useCircles: () => ({ fetchExpedition })
}));
vi.mock('@earth-app/crust/src/stores/trails', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useTrailsStore: () => ({ runs: trailRuns.value })
}));
vi.mock('@earth-app/crust/src/stores/auth', async () => {
	const { reactive } = await import('vue');
	const store = reactive({
		sessionToken: null as string | null,
		currentUser: null as { id: string } | null
	});
	authRef.store = store;
	return { useAuthStore: () => store };
});

import {
	buildDigestSlot,
	buildEveningSlot,
	buildMiddaySlot,
	buildMorningSlot,
	DIGEST_SLOTS,
	hasActedToday,
	natureMinutesToday,
	questActedToday,
	type DigestContext
} from '~/composables/useDailyNotifications';
import { LOCAL_NOTIF, LOCAL_NOTIF_CHANNELS } from '~/composables/useLocalNotifications';

const NOW = Date.now();
const todayISO = new Date(NOW).toISOString();
const twoDaysAgoISO = new Date(NOW - 2 * 86400000).toISOString();

function ctx(overrides: Partial<DigestContext> = {}): DigestContext {
	return {
		activeQuestTitle: null,
		activeQuestRoute: null,
		questNudgeOk: false,
		pledge: null,
		natureMinutes: null,
		expedition: null,
		contributedToday: false,
		actedToday: false,
		...overrides
	};
}

function nm(partial: Partial<NatureMinutes> = {}): NatureMinutes {
	return {
		week: '2026-W29',
		minutes: 0,
		target: 120,
		best: 0,
		sources: [],
		updated_at: todayISO,
		...partial
	};
}

describe('natureMinutesToday', () => {
	it('sums only sources credited today', () => {
		const value = nm({
			sources: [
				{ kind: 'trail_step', minutes: 15, at: todayISO },
				{ kind: 'healthkit', minutes: 20, at: todayISO },
				{ kind: 'manual', minutes: 99, at: twoDaysAgoISO }
			]
		});
		expect(natureMinutesToday(value, NOW)).toBe(35);
	});

	it('returns 0 for null / missing sources / garbage timestamps', () => {
		expect(natureMinutesToday(null, NOW)).toBe(0);
		expect(natureMinutesToday(nm({ sources: undefined as never }), NOW)).toBe(0);
		expect(
			natureMinutesToday(nm({ sources: [{ kind: 'manual', minutes: 10, at: 'not-a-date' }] }), NOW)
		).toBe(0);
	});

	it('never counts negative minutes', () => {
		const value = nm({ sources: [{ kind: 'manual', minutes: -50, at: todayISO }] });
		expect(natureMinutesToday(value, NOW)).toBe(0);
	});
});

describe('questActedToday', () => {
	function progress(entries: UserQuestProgress['progress']): UserQuestProgress {
		return {
			quest: { id: 'q1' } as never,
			questId: 'q1',
			currentStep: {} as never,
			currentStepIndex: 1,
			completed: false,
			progress: entries
		};
	}

	it('is true when any step was submitted today (flat + alt-group)', () => {
		expect(questActedToday(progress([{ type: 'x', submittedAt: NOW }]), NOW)).toBe(true);
		expect(questActedToday(progress([[{ type: 'x', altIndex: 0, submittedAt: NOW }]]), NOW)).toBe(
			true
		);
	});

	it('is false for only-older submissions, null slots, or no active quest', () => {
		expect(questActedToday(progress([{ type: 'x', submittedAt: NOW - 3 * 86400000 }]), NOW)).toBe(
			false
		);
		expect(questActedToday(progress([null as never, undefined as never]), NOW)).toBe(false);
		expect(questActedToday(null, NOW)).toBe(false);
	});
});

describe('hasActedToday', () => {
	it('ORs the nature-minute and quest signals', () => {
		expect(
			hasActedToday(null, nm({ sources: [{ kind: 'healthkit', minutes: 5, at: todayISO }] }), NOW)
		).toBe(true);
		expect(hasActedToday(null, null, NOW)).toBe(false);
	});
});

describe('buildMorningSlot priority', () => {
	it('prefers the active quest nudge when its step is ready', () => {
		const slot = buildMorningSlot(
			ctx({ questNudgeOk: true, activeQuestTitle: 'Sunrise', activeQuestRoute: '/tabs/quests/q1' })
		);
		expect(slot?.route).toBe('/tabs/quests/q1');
		expect(slot?.body).toContain('Sunrise');
	});

	it('falls to the if-then pledge when no quest nudge', () => {
		const slot = buildMorningSlot(ctx({ pledge: { when: 'I finish coffee', trailId: 't9' } }));
		expect(slot?.route).toBe('/tabs/trails/t9');
		expect(slot?.body).toContain('I finish coffee');
	});

	it('falls to nature minutes remaining, then expedition', () => {
		expect(
			buildMorningSlot(ctx({ natureMinutes: { minutes: 40, target: 120, today: 0 } }))?.route
		).toBe('/tabs/trails');
		expect(
			buildMorningSlot(
				ctx({
					natureMinutes: { minutes: 120, target: 120, today: 0 },
					expedition: { title: 'Ridge', remaining: 30, unit: 'min', percent: 0.5 }
				})
			)?.route
		).toBe('/tabs/circle');
	});

	it('is silent when nothing is goal-shaped to say', () => {
		expect(buildMorningSlot(ctx())).toBeNull();
		expect(
			buildMorningSlot(ctx({ natureMinutes: { minutes: 120, target: 120, today: 0 } }))
		).toBeNull();
	});
});

describe('buildMiddaySlot suppression', () => {
	it('stays silent once the user already acted today', () => {
		expect(
			buildMiddaySlot(
				ctx({
					actedToday: true,
					expedition: { title: 'Ridge', remaining: 30, unit: 'min', percent: 0.4 }
				})
			)
		).toBeNull();
	});

	it('surfaces "your circle needs you" when not contributed', () => {
		const slot = buildMiddaySlot(
			ctx({
				expedition: { title: 'Ridge', remaining: 30, unit: 'min', percent: 0.4 },
				contributedToday: false
			})
		);
		expect(slot?.title).toBe('Your Circle Needs You');
	});

	it('falls back to a nature nudge, else silence', () => {
		expect(
			buildMiddaySlot(ctx({ natureMinutes: { minutes: 10, target: 120, today: 0 } }))?.route
		).toBe('/tabs/trails');
		expect(buildMiddaySlot(ctx())).toBeNull();
	});
});

describe('buildEveningSlot reflection', () => {
	it('celebrates the day when the user acted (personal-best framing, no comparison)', () => {
		const slot = buildEveningSlot(
			ctx({ actedToday: true, natureMinutes: { minutes: 35, target: 120, today: 35 } })
		);
		expect(slot?.title).toBe('Nicely Done Today');
		expect(slot?.body).toContain('35');
		expect(slot?.body.toLowerCase()).toContain('own pace');
	});

	it('nudges a near-complete circle', () => {
		const slot = buildEveningSlot(
			ctx({ expedition: { title: 'Ridge', remaining: 10, unit: 'min', percent: 0.9 } })
		);
		expect(slot?.route).toBe('/tabs/circle');
	});

	it('offers a prosocial trailmark when nothing else and not acted', () => {
		expect(buildEveningSlot(ctx())?.route).toBe('/tabs/trailmarks');
	});

	it('stays silent when acted but has no minutes summary and nothing else', () => {
		expect(buildEveningSlot(ctx({ actedToday: true }))).toBeNull();
	});
});

describe('buildDigestSlot dispatch', () => {
	it('routes each key to its builder', () => {
		const c = ctx({
			questNudgeOk: true,
			activeQuestTitle: 'A',
			activeQuestRoute: '/tabs/quests/a'
		});
		expect(buildDigestSlot('morning', c)?.route).toBe('/tabs/quests/a');
		expect(buildDigestSlot('midday', ctx({ actedToday: true }))).toBeNull();
		expect(buildDigestSlot('evening', ctx())?.route).toBe('/tabs/trailmarks');
	});
});

// #region scheduling
const teardowns: Array<() => void> = [];

/** Reloads the composable so its throttle / in-flight module state starts clean each case. */
async function load() {
	vi.resetModules();
	const mod = await import('~/composables/useDailyNotifications');
	return {
		scheduleDailyNotifications: mod.scheduleDailyNotifications,
		initDailyNotifications: () => {
			const stop = mod.initDailyNotifications();
			teardowns.push(stop);
			return stop;
		}
	};
}

function scheduledNotifications(): Array<Record<string, unknown>> {
	const call = ln.schedule.mock.calls.at(-1);
	if (!call) throw new Error('nothing was scheduled');
	return (call[0] as { notifications: Array<Record<string, unknown>> }).notifications;
}

function digestId(slotIndex: number, day: number): number {
	return LOCAL_NOTIF.DAILY_BASE + slotIndex * 10 + day;
}

describe('scheduleDailyNotifications', () => {
	// mid-afternoon: today's morning and midday slots are already behind us
	const CLOCK = new Date(2026, 7, 10, 15, 0, 0);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(CLOCK);

		cap.isNative.mockReturnValue(true);
		cap.platform.mockReturnValue('ios');
		ln.checkPermissions.mockResolvedValue({ display: 'granted' });
		ln.requestPermissions.mockResolvedValue({ display: 'granted' });
		ln.createChannel.mockResolvedValue(undefined);
		ln.schedule.mockResolvedValue(undefined);
		ln.cancel.mockResolvedValue(undefined);
		ln.getPending.mockResolvedValue({ notifications: [] });
		ln.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
		appPlugin.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });

		fetchUserQuest.mockResolvedValue({
			questId: 'q1',
			quest: { title: 'Ridge' },
			completed: false,
			currentStepIndex: 0,
			progress: []
		});
		fetchNatureMinutes.mockResolvedValue({
			success: true,
			data: { minutes: 30, target: 120, sources: [] }
		});
		fetchExpedition.mockResolvedValue({ success: true, data: null });
		trailRuns.value = new Map();

		if (authRef.store) {
			authRef.store.sessionToken = 'sess-1';
			authRef.store.currentUser = { id: 'u1' };
		}
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		while (teardowns.length) teardowns.pop()!();
		vi.useRealTimers();
	});

	it('lays down a rolling 3-day window, skipping slots that already passed today', async () => {
		const { scheduleDailyNotifications } = await load();
		if (authRef.store) authRef.store.sessionToken = 'sess-1';
		await scheduleDailyNotifications();

		const ids = scheduledNotifications().map((n) => n.id);
		expect(ids).toEqual([
			digestId(2, 0),
			digestId(0, 1),
			digestId(1, 1),
			digestId(2, 1),
			digestId(0, 2),
			digestId(1, 2),
			digestId(2, 2)
		]);
	});

	it('fires each slot at its own local hour on the right day', async () => {
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();

		const times = scheduledNotifications().map((n) => (n.schedule as { at: Date }).at);
		expect(times[0]).toEqual(new Date(2026, 7, 10, 19, 0, 0, 0));
		expect(times[1]).toEqual(new Date(2026, 7, 11, 8, 0, 0, 0));
		expect(times[2]).toEqual(new Date(2026, 7, 11, 13, 0, 0, 0));
		expect(times.at(-1)).toEqual(new Date(2026, 7, 12, 19, 0, 0, 0));
	});

	it('carries the route and the slot-appropriate channel', async () => {
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();

		const morning = scheduledNotifications().find((n) => n.id === digestId(0, 1))!;
		expect(morning.extra).toEqual({ route: '/tabs/quests/q1' });
		expect(morning.channelId).toBe(LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS);

		const evening = scheduledNotifications().find((n) => n.id === digestId(2, 1))!;
		expect(evening.extra).toEqual({ route: '/tabs/trailmarks' });
		expect(evening.channelId).toBe(LOCAL_NOTIF_CHANNELS.DAILY_CONTENT);
	});

	it('clears the whole previous window before laying down the new one', async () => {
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();

		const cancelled = (ln.cancel.mock.calls[0]![0] as { notifications: Array<{ id: number }> })
			.notifications;
		expect(cancelled.map((n) => n.id)).toEqual([
			digestId(0, 0),
			digestId(0, 1),
			digestId(0, 2),
			digestId(1, 0),
			digestId(1, 1),
			digestId(1, 2),
			digestId(2, 0),
			digestId(2, 1),
			digestId(2, 2)
		]);
		// a schedule that lands before the cancel would wipe the notifications it just wrote
		expect(ln.cancel.mock.invocationCallOrder[0]!).toBeLessThan(
			ln.schedule.mock.invocationCallOrder[0]!
		);
	});

	it('stays entirely quiet when every slot has nothing goal-shaped to say', async () => {
		// quest finished today, weekly nature goal already met, no circle: nothing to nudge about
		fetchUserQuest.mockResolvedValue({
			questId: 'q1',
			completed: true,
			currentStepIndex: 1,
			progress: [{ type: 'x', submittedAt: CLOCK.getTime() }]
		});
		fetchNatureMinutes.mockResolvedValue({
			success: true,
			data: { minutes: 200, target: 120, sources: [] }
		});
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();

		expect(ln.cancel).toHaveBeenCalledOnce();
		expect(ln.schedule).not.toHaveBeenCalled();
	});

	it('does nothing off-native or without a hydrated session', async () => {
		cap.isNative.mockReturnValue(false);
		const offNative = await load();
		await offNative.scheduleDailyNotifications();
		expect(ln.schedule).not.toHaveBeenCalled();

		cap.isNative.mockReturnValue(true);
		if (authRef.store) authRef.store.sessionToken = null;
		const loggedOut = await load();
		await loggedOut.scheduleDailyNotifications();
		expect(ln.schedule).not.toHaveBeenCalled();

		if (authRef.store) {
			authRef.store.sessionToken = 'sess-1';
			authRef.store.currentUser = null;
		}
		const noUser = await load();
		await noUser.scheduleDailyNotifications();
		expect(ln.schedule).not.toHaveBeenCalled();
	});

	it('never schedules without the notification permission', async () => {
		ln.checkPermissions.mockResolvedValue({ display: 'denied' });
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();
		expect(ln.requestPermissions).not.toHaveBeenCalled();
		expect(ln.schedule).not.toHaveBeenCalled();
	});

	it('throttles a repeat rebuild for 30 minutes unless forced', async () => {
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();
		expect(ln.schedule).toHaveBeenCalledOnce();

		await scheduleDailyNotifications();
		expect(ln.schedule).toHaveBeenCalledOnce();

		await scheduleDailyNotifications(true);
		expect(ln.schedule).toHaveBeenCalledTimes(2);

		vi.setSystemTime(new Date(CLOCK.getTime() + 30 * 60 * 1000 + 1));
		await scheduleDailyNotifications();
		expect(ln.schedule).toHaveBeenCalledTimes(3);
	});

	it('does not run two rebuilds concurrently', async () => {
		// the re-entrancy guard has to be claimed before the first await, or a cold launch that
		// fires the auth watch and the resume listener together rebuilds the window twice
		const { scheduleDailyNotifications } = await load();
		await Promise.all([scheduleDailyNotifications(true), scheduleDailyNotifications(true)]);
		expect(ln.schedule).toHaveBeenCalledOnce();
		expect(fetchNatureMinutes).toHaveBeenCalledOnce();
	});

	it('survives a failing context fetch by dropping that signal, not the whole schedule', async () => {
		fetchNatureMinutes.mockRejectedValue(new Error('offline'));
		fetchExpedition.mockRejectedValue(new Error('offline'));
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();

		// the quest nudge still lands; the nature-minute slots simply go quiet
		const ids = scheduledNotifications().map((n) => n.id);
		expect(ids).toContain(digestId(0, 1));
		expect(ids).not.toContain(digestId(1, 1));
	});

	it('swallows a scheduling failure and lets the next foreground retry', async () => {
		ln.schedule.mockRejectedValue(new Error('too many pending'));
		const { scheduleDailyNotifications } = await load();
		await scheduleDailyNotifications();

		ln.schedule.mockResolvedValue(undefined);
		// lastScheduledAt was never advanced, so the throttle does not block the retry
		await scheduleDailyNotifications();
		expect(ln.schedule).toHaveBeenCalledTimes(2);
	});
});

describe('initDailyNotifications', () => {
	const CLOCK = new Date(2026, 7, 10, 15, 0, 0);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(CLOCK);
		cap.isNative.mockReturnValue(true);
		cap.platform.mockReturnValue('ios');
		ln.checkPermissions.mockResolvedValue({ display: 'granted' });
		ln.createChannel.mockResolvedValue(undefined);
		ln.schedule.mockResolvedValue(undefined);
		ln.cancel.mockResolvedValue(undefined);
		ln.getPending.mockResolvedValue({ notifications: [] });
		ln.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
		appPlugin.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
		fetchUserQuest.mockResolvedValue(null);
		fetchNatureMinutes.mockResolvedValue({
			success: true,
			data: { minutes: 30, target: 120, sources: [] }
		});
		fetchExpedition.mockResolvedValue({ success: true, data: null });
		trailRuns.value = new Map();
		if (authRef.store) {
			authRef.store.sessionToken = null;
			authRef.store.currentUser = { id: 'u1' };
		}
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		while (teardowns.length) teardowns.pop()!();
		vi.useRealTimers();
	});

	it('registers nothing off-native', async () => {
		cap.isNative.mockReturnValue(false);
		const { initDailyNotifications } = await load();
		initDailyNotifications();
		expect(appPlugin.addListener).not.toHaveBeenCalled();
		expect(ln.addListener).not.toHaveBeenCalled();
	});

	it('rebuilds the schedule on login and clears both bands on logout', async () => {
		ln.getPending.mockResolvedValue({
			notifications: [{ id: LOCAL_NOTIF.STEP_UNLOCK_BASE + 7 }]
		});
		const { initDailyNotifications } = await load();
		initDailyNotifications();

		authRef.store!.sessionToken = 'sess-1';
		await vi.waitFor(() => expect(ln.schedule).toHaveBeenCalled());

		ln.cancel.mockClear();
		authRef.store!.sessionToken = null;
		// digests are cancelled by id, and orphaned step reminders die with the session
		await vi.waitFor(() => expect(ln.cancel).toHaveBeenCalledTimes(2));
		expect(ln.cancel.mock.calls[1]![0]).toEqual({
			notifications: [{ id: LOCAL_NOTIF.STEP_UNLOCK_BASE + 7 }]
		});
	});

	it('reschedules on foreground instead of relying on repeating notifications', async () => {
		const { initDailyNotifications } = await load();
		initDailyNotifications();
		authRef.store!.sessionToken = 'sess-1';
		await vi.waitFor(() => expect(ln.schedule).toHaveBeenCalled());

		// no notification is ever laid down with `repeats`; the window is rebuilt each resume
		for (const notification of scheduledNotifications()) {
			expect(notification.schedule).not.toHaveProperty('repeats');
		}

		const onState = appPlugin.addListener.mock.calls.find(
			(c) => c[0] === 'appStateChange'
		)![1] as (payload: { isActive: boolean }) => unknown;

		vi.setSystemTime(new Date(CLOCK.getTime() + 31 * 60 * 1000));
		await onState({ isActive: true });
		await vi.waitFor(() => expect(ln.schedule).toHaveBeenCalledTimes(2));

		await onState({ isActive: false });
		expect(ln.schedule).toHaveBeenCalledTimes(2);
	});

	it('replaces a previous registration rather than stacking listeners', async () => {
		const { initDailyNotifications } = await load();
		initDailyNotifications();
		const first = appPlugin.addListener.mock.calls.length;
		initDailyNotifications();
		expect(appPlugin.addListener.mock.calls.length).toBe(first * 2);

		// the first auth watch is gone, so a login only schedules once
		authRef.store!.sessionToken = 'sess-1';
		await vi.waitFor(() => expect(ln.schedule).toHaveBeenCalled());
		expect(ln.schedule).toHaveBeenCalledOnce();
	});
});

describe('DIGEST_SLOTS', () => {
	it('keeps three calm, ordered slots with unique id offsets', () => {
		expect(DIGEST_SLOTS.map((s) => s.key)).toEqual(['morning', 'midday', 'evening']);
		expect(DIGEST_SLOTS.map((s) => s.hour)).toEqual([8, 13, 19]);
		expect(new Set(DIGEST_SLOTS.map((s) => s.index)).size).toBe(DIGEST_SLOTS.length);
	});
});
// #endregion
