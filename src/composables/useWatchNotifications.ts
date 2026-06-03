import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapgoWatch } from '@capgo/capacitor-watch';

interface WearNotificationBridgePlugin {
	isAvailable(): Promise<{ available: boolean; nodeCount?: number; error?: string }>;
	sendNotification(payload: {
		id: string;
		title: string;
		body: string;
		type?: string;
		source?: string;
		link?: string;
		createdAt?: number;
	}): Promise<{ delivered: number; error?: string }>;
}

const WearBridge = registerPlugin<WearNotificationBridgePlugin>('WearNotificationBridge', {
	web: () =>
		Promise.resolve({
			isAvailable: async () => ({ available: false }),
			sendNotification: async () => ({ delivered: 0 })
		} as WearNotificationBridgePlugin)
});

const KEY_DELIVER = 'notification.deliver';

export interface WatchNotificationPayload {
	id: string;
	title: string;
	body: string;
	type?: 'info' | 'warning' | 'error' | 'success';
	source?: string;
	link?: string;
	createdAt?: number;
}

let iosSupportedCache: boolean | null = null;
let lastSentIds: Set<string> = new Set();
const LAST_SENT_LIMIT = 200;

async function isAppleWatchAvailable(): Promise<boolean> {
	if (iosSupportedCache !== null) return iosSupportedCache;
	if (Capacitor.getPlatform() !== 'ios') {
		iosSupportedCache = false;
		return false;
	}
	try {
		const info = await CapgoWatch.getInfo();
		iosSupportedCache = !!info.isSupported;
		return iosSupportedCache;
	} catch (e) {
		console.warn('[watch] getInfo failed, disabling watch forwarding:', e);
		iosSupportedCache = false;
		return false;
	}
}

async function isWearOsAvailable(): Promise<boolean> {
	if (Capacitor.getPlatform() !== 'android') return false;
	try {
		const { available } = await WearBridge.isAvailable();
		return available;
	} catch (e) {
		console.warn('[watch] WearBridge.isAvailable failed:', e);
		return false;
	}
}

function recordSent(id: string) {
	lastSentIds.add(id);
	if (lastSentIds.size > LAST_SENT_LIMIT) {
		const overflow = lastSentIds.size - LAST_SENT_LIMIT;
		const it = lastSentIds.values();
		for (let i = 0; i < overflow; i++) {
			const next = it.next();
			if (next.done) break;
			lastSentIds.delete(next.value);
		}
	}
}

export function initWatchNotificationBridge(): () => void {
	const platform = Capacitor.getPlatform();
	if (platform !== 'ios' && platform !== 'android') {
		return () => {};
	}
	const { notifications } = useNotifications();
	const { forward } = useWatchNotifications();

	// track ids we've seen so we only forward true additions, not re-renders
	const seen = new Set<string>();
	for (const n of notifications.value) {
		seen.add(n.id);
	}

	const stop = watch(
		() => notifications.value,
		(list) => {
			for (const n of list) {
				if (seen.has(n.id)) continue;
				seen.add(n.id);
				void forward({
					id: n.id,
					title: n.title ?? '',
					body: n.message ?? '',
					type: n.type,
					source: n.source,
					link: n.link,
					createdAt: n.created_at
				});
			}
		},
		{ deep: true }
	);
	return stop;
}

async function forwardAppleWatch(payload: WatchNotificationPayload): Promise<void> {
	if (!(await isAppleWatchAvailable())) return;

	const body = {
		type: KEY_DELIVER,
		id: payload.id,
		title: payload.title,
		body: payload.body,
		notifType: payload.type ?? 'info',
		source: payload.source ?? 'system',
		link: payload.link ?? '',
		createdAt: payload.createdAt ?? Math.floor(Date.now() / 1000)
	};

	try {
		await CapgoWatch.transferUserInfo({ userInfo: body });
	} catch (e) {
		console.warn('[watch] transferUserInfo failed:', e);
	}
	try {
		const info = await CapgoWatch.getInfo();
		if (info.isReachable) {
			await CapgoWatch.sendMessage({ data: body });
		}
	} catch {
		// best-effort
	}
}

async function forwardWearOs(payload: WatchNotificationPayload): Promise<void> {
	if (!(await isWearOsAvailable())) return;
	try {
		await WearBridge.sendNotification({
			id: payload.id,
			title: payload.title,
			body: payload.body,
			type: payload.type,
			source: payload.source,
			link: payload.link,
			createdAt: payload.createdAt
		});
	} catch (e) {
		console.warn('[watch] WearBridge.sendNotification failed:', e);
	}
}

export function useWatchNotifications() {
	async function forward(payload: WatchNotificationPayload): Promise<void> {
		if (lastSentIds.has(payload.id)) return;
		recordSent(payload.id);

		const platform = Capacitor.getPlatform();
		if (platform === 'ios') {
			await forwardAppleWatch(payload);
		} else if (platform === 'android') {
			await forwardWearOs(payload);
		}
	}

	return { forward };
}
