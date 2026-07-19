import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const LOCAL_NOTIF = {
	STEP_UNLOCK_BASE: 2_000_000_000, // quest step cooldown reminders
	DAILY_BASE: 2_100_000_000 // daily content/quest schedule
} as const;

// Android requires notification channels to exist before a notification can post on them
export const LOCAL_NOTIF_CHANNELS = {
	QUEST_REMINDERS: 'quest-reminders',
	DAILY_CONTENT: 'daily-content'
} as const;

const MAX_NOTIFICATION_ID = 2_147_483_647;

function hash(input: string): number {
	// djb2-ish, signed-safe
	let h = 5381;
	for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
	return Math.abs(h | 0);
}

export function stepUnlockNotificationId(questId: string, stepIndex: number): number {
	const span = LOCAL_NOTIF.DAILY_BASE - LOCAL_NOTIF.STEP_UNLOCK_BASE; // 100_000_000
	return LOCAL_NOTIF.STEP_UNLOCK_BASE + (hash(`${questId}:${stepIndex}`) % span);
}

export async function ensureLocalNotificationPermission(): Promise<boolean> {
	if (!Capacitor.isNativePlatform()) return false;
	try {
		const current = await LocalNotifications.checkPermissions();
		if (current.display === 'granted') return true;
		const requested = await LocalNotifications.requestPermissions();
		return requested.display === 'granted';
	} catch (e) {
		console.error('Local notification permission check failed:', e);
		return false;
	}
}

export async function createLocalNotificationChannels(): Promise<void> {
	if (Capacitor.getPlatform() !== 'android') return;
	try {
		await LocalNotifications.createChannel({
			id: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS,
			name: 'Quest Reminders',
			description: 'Reminders to continue and complete your active quests.',
			importance: 4
		});
		await LocalNotifications.createChannel({
			id: LOCAL_NOTIF_CHANNELS.DAILY_CONTENT,
			name: 'Gentle Nudges',
			description: 'A few calm, goal-shaped nudges a day (never content spam).',
			importance: 3
		});
	} catch (e) {
		console.error('Failed to create local notification channels:', e);
	}
}

export async function scheduleStepUnlockNotification(opts: {
	questId: string;
	questTitle: string;
	stepIndex: number;
	unlockAt: number;
}): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;

	// already unlocked (or about to be), nothing useful to remind about
	if (opts.unlockAt <= Date.now() + 30_000) return;

	const granted = await ensureLocalNotificationPermission();
	if (!granted) return;

	await createLocalNotificationChannels();

	const id = stepUnlockNotificationId(opts.questId, opts.stepIndex);
	try {
		await LocalNotifications.cancel({ notifications: [{ id }] });
		await LocalNotifications.schedule({
			notifications: [
				{
					id,
					title: 'Quest Step Unlocked!',
					body: `Your next step in "${opts.questTitle}" is ready to complete.`,
					schedule: { at: new Date(opts.unlockAt) },
					channelId: LOCAL_NOTIF_CHANNELS.QUEST_REMINDERS,
					extra: { route: `/tabs/quests/${opts.questId}?step=${opts.stepIndex}` }
				}
			]
		});
	} catch (e) {
		console.error('Failed to schedule step unlock notification:', e);
	}
}

export async function cancelStepUnlockNotification(
	questId: string,
	stepIndex: number
): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	try {
		await LocalNotifications.cancel({
			notifications: [{ id: stepUnlockNotificationId(questId, stepIndex) }]
		});
	} catch {
		// best-effort
	}
}

export async function cancelAllStepUnlockNotifications(): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	try {
		const { notifications } = await LocalNotifications.getPending();
		const ids = notifications
			.filter((n) => {
				const id = typeof n.id === 'number' ? n.id : Number(n.id);
				return id >= LOCAL_NOTIF.STEP_UNLOCK_BASE && id < LOCAL_NOTIF.DAILY_BASE;
			})
			.map((n) => ({ id: typeof n.id === 'number' ? n.id : Number(n.id) }));
		if (ids.length === 0) return;
		await LocalNotifications.cancel({ notifications: ids });
	} catch {
		// best-effort
	}
}

export function initLocalNotificationRouting(): () => void {
	if (!Capacitor.isNativePlatform()) return () => {};

	let handle: PluginListenerHandle | null = null;
	let removed = false;

	void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
		const extra = action?.notification?.extra as { route?: unknown } | undefined;
		const route = extra?.route;
		if (typeof route === 'string' && route.startsWith('/')) {
			void navigateTo(route);
		}
	}).then((h) => {
		if (removed) {
			void h.remove();
			return;
		}
		handle = h;
	});

	return () => {
		removed = true;
		void handle?.remove();
		handle = null;
	};
}

export { MAX_NOTIFICATION_ID };
