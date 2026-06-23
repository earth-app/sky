import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import {
	LOCAL_NOTIF,
	LOCAL_NOTIF_CHANNELS,
	cancelAllStepUnlockNotifications,
	createLocalNotificationChannels,
	ensureLocalNotificationPermission,
	initLocalNotificationRouting
} from './useLocalNotifications';

// schedule rolling window that rebuilds since can't work off live state
const DAYS_AHEAD = 3;
const RESCHEDULE_THROTTLE_MS = 30 * 60 * 1000;

type SlotKey = 'morning' | 'activity' | 'workday' | 'article' | 'prompt';

const SLOTS: { key: SlotKey; hour: number; index: number }[] = [
	{ key: 'morning', hour: 7, index: 0 }, // quest nudge OR random quest
	{ key: 'activity', hour: 10, index: 1 }, // activity of the day
	{ key: 'workday', hour: 15, index: 2 }, // quest nudge (3pm)
	{ key: 'article', hour: 18, index: 3 }, // article of the day (6pm)
	{ key: 'prompt', hour: 20, index: 4 } // prompt of the day (8pm)
];

interface SlotContent {
	title: string;
	body: string;
	route: string;
	channelId: string;
}

let scheduling = false;
let lastScheduledAt = 0;
let activeTeardown: (() => void) | null = null;

function allDailyIds(): number[] {
	const ids: number[] = [];
	for (const slot of SLOTS) {
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

function pick<T>(items: T[], day: number): T | null {
	if (!items || items.length === 0) return null;
	return items[day % items.length] ?? items[0] ?? null;
}

function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j]!, copy[i]!];
	}
	return copy;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
	try {
		return await fn();
	} catch (e) {
		console.error('Daily notification content fetch failed:', e);
		return null;
	}
}

async function safeList<T>(fn: () => Promise<{ success: boolean; data?: T[] }>): Promise<T[]> {
	try {
		const res = await fn();
		return res?.success && Array.isArray(res.data) ? res.data : [];
	} catch (e) {
		console.error('Daily notification content fetch failed:', e);
		return [];
	}
}

function canAccessPremium(user: User): boolean {
	if (user.account?.subscribed === true) return true;
	const type = user.account?.account_type;
	return !!type && type !== 'FREE';
}

function isEligibleRandomQuest(
	quest: Quest,
	user: User,
	history: Map<string, QuestHistoryEntry>
): boolean {
	if (!quest?.id) return false;

	// exclude generated activity quests, badge-mastery quests, and user custom quests
	if (quest.id.startsWith('activity_quest_')) return false;
	if (quest.id.startsWith('badge_mastery_')) return false;
	if ((quest as { custom?: boolean }).custom === true) return false;
	if (history.get(quest.id)?.completedAt !== undefined) return false;
	if (quest.premium && !canAccessPremium(user)) return false;

	return true;
}

// "no step delay active": the active quest's current step isn't sitting on a cooldown yet.
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

async function buildNotifications(): Promise<LocalNotificationSchema[]> {
	const authStore = useAuthStore();
	const user = authStore.currentUser;
	const userId = user?.id;
	if (!user || !userId) return [];

	const { fetchUserQuest } = useUser(userId);

	const [activeQuest, activities, articles, prompts] = await Promise.all([
		safe(() => fetchUserQuest()),
		safeList<Activity>(() => useActivities().fetchRandom(DAYS_AHEAD)),
		safeList<Article>(() => useArticles().fetchRandom(DAYS_AHEAD)),
		safeList<Prompt>(() => usePrompts().fetchRandom(DAYS_AHEAD))
	]);

	const hasActiveQuest = !!activeQuest?.questId && !activeQuest.completed;
	const stepDelayActive = hasActiveQuest && activeQuest ? isStepDelayActive(activeQuest) : false;
	const questNudgeOk = hasActiveQuest && !stepDelayActive;
	const activeQuestTitle = activeQuest?.quest?.title ?? 'current';
	const activeQuestRoute = activeQuest?.questId ? `/tabs/quests/${activeQuest.questId}` : '';

	// Only need the eligible-quest list for the morning slot when there's no active quest.
	let eligibleQuests: Quest[] = [];
	if (!hasActiveQuest) {
		const { fetchQuests } = useQuests();
		const { fetchQuestHistory } = useUser(userId);
		const [list, history] = await Promise.all([
			safeList<Quest>(() => fetchQuests().then((quests) => ({ success: true, data: quests }))),
			safe(() => fetchQuestHistory())
		]);
		const historyMap = history ?? new Map<string, QuestHistoryEntry>();
		eligibleQuests = shuffle(list.filter((q) => isEligibleRandomQuest(q, user, historyMap)));
	}

	const buildSlot = (key: SlotKey, day: number): SlotContent | null => {
		switch (key) {
			case 'morning': {
				if (questNudgeOk) {
					return {
						title: 'Good morning!',
						body: `Let's see if we can finish your ${activeQuestTitle} Quest today!`,
						route: activeQuestRoute,
						channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
					};
				}
				if (!hasActiveQuest) {
					const quest = pick(eligibleQuests, day);
					if (!quest) return null; // user has nothing eligible left, silently skip
					return {
						title: 'Seize the Day',
						body: `Start your day off with ${quest.title} Quest!`,
						route: `/tabs/quests/${quest.id}`,
						channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
					};
				}

				return null;
			}
			case 'activity': {
				const activity = pick(activities, day);
				if (!activity) return null;
				return {
					title: 'Activity of the Day',
					body: `${activity.name} - ${trimText(activity.description, 80)}`,
					route: `/tabs/activities/${activity.id}`,
					channelId: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT
				};
			}
			case 'workday': {
				if (!questNudgeOk) return null;
				return {
					title: 'End of the Work Day!',
					body: `Have some spare time to finish your ${activeQuestTitle} Quest?`,
					route: activeQuestRoute,
					channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS
				};
			}
			case 'article': {
				const article = pick(articles, day);
				if (!article) return null;
				return {
					title: 'Article of the Day',
					body: trimText(article.title, 120),
					route: `/tabs/articles/${article.id}`,
					channelId: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT
				};
			}
			case 'prompt': {
				const prompt = pick(prompts, day);
				if (!prompt) return null;
				return {
					title: 'Thoughts Before Bed',
					body: trimText(prompt.prompt, 120),
					route: `/tabs/prompts/${prompt.id}`,
					channelId: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT
				};
			}
		}
	};

	const notifications: LocalNotificationSchema[] = [];
	const now = Date.now();

	for (let day = 0; day < DAYS_AHEAD; day++) {
		for (const slot of SLOTS) {
			const at = slotDate(day, slot.hour);

			// skip slots whose time has already passed today (or is essentially now)
			if (at.getTime() <= now + 30_000) continue;

			const content = buildSlot(slot.key, day);
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
 * Rebuilds the rolling daily-notification schedule from current state + freshly picked random
 * content. Native-only; throttled so repeated foregrounding doesn't hammer the API.
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
		// Clear the previous window before laying down the new one.
		await LocalNotifications.cancel({
			notifications: allDailyIds().map((id) => ({ id }))
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
		await LocalNotifications.cancel({ notifications: allDailyIds().map((id) => ({ id })) });
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
				// they fire after logout and route taps land on a 401 page.
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
