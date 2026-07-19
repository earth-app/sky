import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Expedition } from 'types/circles';
import type { NatureMinutes } from 'types/trails';
import type { UserQuestProgress } from 'types/user';
import {
	LOCAL_NOTIF,
	LOCAL_NOTIF_CHANNELS,
	cancelAllStepUnlockNotifications,
	createLocalNotificationChannels,
	ensureLocalNotificationPermission,
	initLocalNotificationRouting
} from './useLocalNotifications';

const DAYS_AHEAD = 3;
const RESCHEDULE_THROTTLE_MS = 30 * 60 * 1000;
const NATURE_TARGET_FALLBACK = 120;

type DigestKey = 'morning' | 'midday' | 'evening';

// three intentional digests; hours chosen calm (start / midday / wind-down)
export const DIGEST_SLOTS: { key: DigestKey; hour: number; index: number }[] = [
	{ key: 'morning', hour: 8, index: 0 },
	{ key: 'midday', hour: 13, index: 1 },
	{ key: 'evening', hour: 19, index: 2 }
];

export interface SlotContent {
	title: string;
	body: string;
	route: string;
	channelId: string;
}

// everything the pure slot builders need; kept flat + serializable so it is trivially testable
export interface DigestContext {
	activeQuestTitle: string | null;
	activeQuestRoute: string | null;
	// active quest exists and its current step isn't sitting on a cooldown
	questNudgeOk: boolean;
	// a live trail run's if-then pledge (session-scoped)
	pledge: { when: string; trailId: string } | null;
	natureMinutes: { minutes: number; target: number; today: number } | null;
	expedition: { title: string; remaining: number; unit: string; percent: number } | null;
	contributedToday: boolean;
	// user already did an outdoor/quest action today -> suppress the redundant "go do it" nudge
	actedToday: boolean;
}

let scheduling = false;
let lastScheduledAt = 0;
let activeTeardown: (() => void) | null = null;

function allDigestIds(): number[] {
	const ids: number[] = [];
	for (const slot of DIGEST_SLOTS) {
		for (let day = 0; day < DAYS_AHEAD; day++) {
			ids.push(LOCAL_NOTIF.DAILY_BASE + slot.index * 10 + day);
		}
	}
	return ids;
}

function slotDate(dayOffset: number, hour: number): Date {
	const d = new Date();
	d.setDate(d.getDate() + dayOffset);
	d.setHours(hour, 0, 0, 0);
	return d;
}

function trimText(text: string, max: number): string {
	const clean = (text ?? '').trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
	try {
		return await fn();
	} catch (e) {
		console.error('Daily notification context fetch failed:', e);
		return null;
	}
}

function isSameLocalDay(a: number, b: number): boolean {
	const da = new Date(a);
	const db = new Date(b);
	return (
		da.getFullYear() === db.getFullYear() &&
		da.getMonth() === db.getMonth() &&
		da.getDate() === db.getDate()
	);
}

// "no step delay active": the active quest's current step isn't sitting on a cooldown yet
function isStepDelayActive(progress: UserQuestProgress): boolean {
	const idx = progress.currentStepIndex;
	const delay = progress.currentStep?.delay;
	if (!delay || !idx || idx <= 0) return false;

	const prev = progress.progress?.[idx - 1];
	const prevAt = Array.isArray(prev)
		? (prev.find((p) => p.submittedAt)?.submittedAt ?? 0)
		: (prev?.submittedAt ?? 0);
	if (!prevAt) return false;

	return prevAt + delay * 1000 > Date.now();
}

// -------- pure signal helpers (deterministic; unit-tested) --------

// minutes credited from any source today (trail steps + healthkit + manual), for the reflection nudge
export function natureMinutesToday(nm: NatureMinutes | null, now: number): number {
	if (!nm || !Array.isArray(nm.sources)) return 0;
	let total = 0;
	for (const s of nm.sources) {
		const at = Date.parse(s.at);
		if (Number.isFinite(at) && isSameLocalDay(at, now)) total += Math.max(0, s.minutes);
	}
	return total;
}

// did the active quest get a step submitted today
export function questActedToday(active: UserQuestProgress | null, now: number): boolean {
	if (!active || !Array.isArray(active.progress)) return false;
	for (const slot of active.progress) {
		const entries = Array.isArray(slot) ? slot : slot ? [slot] : [];
		for (const e of entries) {
			if (e && Number.isFinite(e.submittedAt) && isSameLocalDay(e.submittedAt, now)) return true;
		}
	}
	return false;
}

export function hasActedToday(
	active: UserQuestProgress | null,
	nm: NatureMinutes | null,
	now: number
): boolean {
	return natureMinutesToday(nm, now) > 0 || questActedToday(active, now);
}

export function buildMorningSlot(ctx: DigestContext): SlotContent | null {
	if (ctx.questNudgeOk && ctx.activeQuestRoute) {
		return {
			title: 'A Calm Start',
			body: `Pick up your ${ctx.activeQuestTitle ?? 'current'} Quest whenever you're ready today.`,
			route: ctx.activeQuestRoute,
			channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
		};
	}
	if (ctx.pledge) {
		return {
			title: 'Your Pledge for Today',
			body: `When ${trimText(ctx.pledge.when, 90)} — that's your cue to set out.`,
			route: `/tabs/trails/${ctx.pledge.trailId}`,
			channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
		};
	}
	if (ctx.natureMinutes) {
		const left = Math.max(0, ctx.natureMinutes.target - Math.round(ctx.natureMinutes.minutes));
		if (left > 0) {
			return {
				title: 'A Few Minutes Outside',
				body: `You're ${left} min from your weekly goal. A short walk near green space counts most.`,
				route: '/tabs/trails',
				channelId: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT
			};
		}
	}
	if (ctx.expedition && ctx.expedition.remaining > 0) {
		return {
			title: 'Your Circle Is on the Move',
			body: `${ctx.expedition.remaining} ${ctx.expedition.unit} left to reach ${ctx.expedition.title} together.`,
			route: '/tabs/circle',
			channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
		};
	}
	return null;
}

export function buildMiddaySlot(ctx: DigestContext): SlotContent | null {
	// already moved today; stay quiet (calm beats a redundant nudge)
	if (ctx.actedToday) return null;

	if (ctx.expedition && ctx.expedition.remaining > 0 && !ctx.contributedToday) {
		return {
			title: 'Your Circle Needs You',
			body: `A little outdoor time moves ${ctx.expedition.title} forward for everyone.`,
			route: '/tabs/circle',
			channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
		};
	}
	if (ctx.natureMinutes) {
		const left = Math.max(0, ctx.natureMinutes.target - Math.round(ctx.natureMinutes.minutes));
		if (left > 0) {
			return {
				title: 'Step Outside for a Bit',
				body: `Even a few minutes near green space lifts the day. You're ${left} from your weekly goal.`,
				route: '/tabs/trails',
				channelId: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT
			};
		}
	}
	return null;
}

export function buildEveningSlot(ctx: DigestContext): SlotContent | null {
	if (ctx.actedToday && ctx.natureMinutes && ctx.natureMinutes.today > 0) {
		return {
			title: 'Nicely Done Today',
			body: `You added ${ctx.natureMinutes.today} nature minutes. That's your own pace, never a comparison.`,
			route: '/tabs/trails',
			channelId: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT
		};
	}
	if (ctx.expedition && ctx.expedition.percent >= 0.8 && ctx.expedition.remaining > 0) {
		return {
			title: 'Your Circle Is Close',
			body: `Almost at ${ctx.expedition.title} — ${ctx.expedition.remaining} ${ctx.expedition.unit} to go.`,
			route: '/tabs/circle',
			channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
		};
	}
	if (!ctx.actedToday) {
		return {
			title: 'A Small Good Thing',
			body: 'Leave a kind note somewhere you pass, for the next person to find.',
			route: '/tabs/trailmarks',
			channelId: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT
		};
	}
	return null;
}

export function buildDigestSlot(key: DigestKey, ctx: DigestContext): SlotContent | null {
	if (key === 'morning') return buildMorningSlot(ctx);
	if (key === 'midday') return buildMiddaySlot(ctx);
	return buildEveningSlot(ctx);
}

// -------- context assembly (impure; pulls current state) --------

async function buildDigestContext(): Promise<DigestContext | null> {
	const authStore = useAuthStore();
	const user = authStore.currentUser;
	const userId = user?.id;
	if (!user || !userId) return null;

	const { fetchUserQuest } = useUser(userId);
	const { fetchNatureMinutes } = useTrails();
	const circles = useCircles();
	const trailsStore = useTrailsStore();

	const [activeQuest, nmRes, expRes] = await Promise.all([
		safe(() => fetchUserQuest()),
		safe(() => fetchNatureMinutes()),
		safe(() => circles.fetchExpedition())
	]);

	const now = Date.now();

	const hasActiveQuest = !!activeQuest?.questId && !activeQuest.completed;
	const stepDelayActive = hasActiveQuest && activeQuest ? isStepDelayActive(activeQuest) : false;
	const questNudgeOk = hasActiveQuest && !stepDelayActive;
	const activeQuestTitle = activeQuest?.quest?.title ?? null;
	const activeQuestRoute = activeQuest?.questId ? `/tabs/quests/${activeQuest.questId}` : null;

	const nm = nmRes?.success ? (nmRes.data ?? null) : null;
	const natureMinutes = nm
		? {
				minutes: nm.minutes,
				target: nm.target || NATURE_TARGET_FALLBACK,
				today: natureMinutesToday(nm, now)
			}
		: null;

	// session-scoped pledge from a live trail run (nudges the intention if one is set)
	let pledge: DigestContext['pledge'] = null;
	for (const [trailId, run] of trailsStore.runs) {
		if (run?.pledge?.when && !run.completed) {
			pledge = { when: run.pledge.when, trailId };
			break;
		}
	}

	const exp: Expedition | null = expRes?.success ? (expRes.data ?? null) : null;
	let expedition: DigestContext['expedition'] = null;
	let contributedToday = false;
	if (exp && exp.status === 'active') {
		const unit = EXPEDITION_GOAL_META[exp.goal]?.unit ?? 'min';
		const remaining = Math.max(0, exp.target - exp.progress);
		const percent = exp.target > 0 ? Math.min(1, exp.progress / exp.target) : 0;
		expedition = { title: exp.title, remaining, unit, percent };
		const mine = exp.contributors.find((c) => c.uid === userId);
		contributedToday = !!(
			mine?.last_contributed_at && isSameLocalDay(Date.parse(mine.last_contributed_at), now)
		);
	}

	return {
		activeQuestTitle,
		activeQuestRoute,
		questNudgeOk,
		pledge,
		natureMinutes,
		expedition,
		contributedToday,
		actedToday: hasActedToday(activeQuest, nm, now)
	};
}

async function buildNotifications(): Promise<LocalNotificationSchema[]> {
	const ctx = await buildDigestContext();
	if (!ctx) return [];

	const notifications: LocalNotificationSchema[] = [];
	const now = Date.now();

	for (let day = 0; day < DAYS_AHEAD; day++) {
		for (const slot of DIGEST_SLOTS) {
			const at = slotDate(day, slot.hour);
			// skip slots whose time has already passed today (or is essentially now)
			if (at.getTime() <= now + 30_000) continue;

			const content = buildDigestSlot(slot.key, ctx);
			// calm: a slot with nothing intentional to say stays silent (no filler content)
			if (!content) continue;

			notifications.push({
				id: LOCAL_NOTIF.DAILY_BASE + slot.index * 10 + day,
				title: content.title,
				body: content.body,
				schedule: { at },
				channelId: content.channelId,
				extra: { route: content.route }
			});
		}
	}

	return notifications;
}

/**
 * Rebuilds the rolling calm-digest schedule from current goal state. Native-only; throttled so
 * repeated foregrounding doesn't hammer the API. Suppresses nudges the user has already acted on.
 */
export async function scheduleDailyNotifications(force = false): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	if (scheduling) return;
	if (!force && Date.now() - lastScheduledAt < RESCHEDULE_THROTTLE_MS) return;

	const authStore = useAuthStore();
	if (!authStore.sessionToken || !authStore.currentUser) return;

	const granted = await ensureLocalNotificationPermission();
	if (!granted) return;

	scheduling = true;
	try {
		await createLocalNotificationChannels();
		// clear the previous window before laying down the new one
		await LocalNotifications.cancel({
			notifications: allDigestIds().map((id) => ({ id }))
		}).catch(() => undefined);

		const notifications = await buildNotifications();
		if (notifications.length > 0) {
			await LocalNotifications.schedule({ notifications });
		}
		lastScheduledAt = Date.now();
	} catch (e) {
		console.error('Failed to schedule daily notifications:', e);
	} finally {
		scheduling = false;
	}
}

async function clearDailyNotifications(): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	lastScheduledAt = 0;
	try {
		await LocalNotifications.cancel({ notifications: allDigestIds().map((id) => ({ id })) });
	} catch {
		// best-effort
	}
}

export function initDailyNotifications(): () => void {
	if (!Capacitor.isNativePlatform()) return () => {};
	if (activeTeardown) activeTeardown();

	const authStore = useAuthStore();
	const stopRouting = initLocalNotificationRouting();

	let appListener: PluginListenerHandle | null = null;
	let removedAppListener = false;
	void App.addListener('appStateChange', ({ isActive }) => {
		if (isActive) void scheduleDailyNotifications();
	}).then((handle) => {
		if (removedAppListener) {
			void handle.remove();
			return;
		}
		appListener = handle;
	});

	const stopAuthWatch = watch(
		() => authStore.sessionToken,
		(token) => {
			if (token) void scheduleDailyNotifications(true);
			else {
				void clearDailyNotifications();
				// orphaned step-unlock reminders should die with the session; otherwise
				// they fire after logout and route taps land on a 401 page
				void cancelAllStepUnlockNotifications();
			}
		},
		{ immediate: true }
	);

	const teardown = () => {
		stopRouting();
		stopAuthWatch();
		removedAppListener = true;
		void appListener?.remove();
		appListener = null;
		if (activeTeardown === teardown) activeTeardown = null;
	};
	activeTeardown = teardown;

	return teardown;
}
