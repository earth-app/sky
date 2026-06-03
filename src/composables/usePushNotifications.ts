import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';

type PushTeardown = () => Promise<void>;
type PushPlatform = 'ios' | 'android';

interface CachedToken {
	token: string;
	platform: PushPlatform;
}

const TOKEN_CACHE_KEY = 'push:token-v1';
const UPLOAD_DEDUPE_MS = 60_000;
const RESUME_REGISTER_TTL_MS = 4 * 60 * 60 * 1000;

let activeTeardown: PushTeardown | null = null;
let cachedToken: CachedToken | null = null;
let cacheLoaded = false;
let lastUploadKey: string | null = null;
let lastUploadAt = 0;
let lastResumeRegisterAt = 0;

async function loadCachedToken(): Promise<CachedToken | null> {
	if (cacheLoaded) return cachedToken;
	cacheLoaded = true;
	try {
		const { value } = await Preferences.get({ key: TOKEN_CACHE_KEY });
		if (!value) return null;
		const parsed = JSON.parse(value) as Partial<CachedToken>;
		if (
			parsed &&
			typeof parsed.token === 'string' &&
			(parsed.platform === 'ios' || parsed.platform === 'android')
		) {
			cachedToken = { token: parsed.token, platform: parsed.platform };
		}
	} catch (error) {
		console.warn('[push] failed to load cached token:', error);
	}
	return cachedToken;
}

async function saveCachedToken(value: CachedToken): Promise<void> {
	cachedToken = value;
	try {
		await Preferences.set({ key: TOKEN_CACHE_KEY, value: JSON.stringify(value) });
	} catch (error) {
		console.warn('[push] failed to persist token:', error);
	}
}

// useIonRouter() causes a crash during this -> use navigateTo()
export async function initPushNotifications(): Promise<PushTeardown> {
	if (!Capacitor.isNativePlatform()) {
		return async () => {};
	}

	if (activeTeardown) {
		await activeTeardown();
	}

	const platform = Capacitor.getPlatform();
	if (platform !== 'ios' && platform !== 'android') {
		return async () => {};
	}

	const config = useRuntimeConfig();
	const authStore = useAuthStore();
	const { addLiveNotification } = useNotifications();
	const { forward: forwardToWatch } = useWatchNotifications();

	await loadCachedToken();

	const uploadToken = async (token: string): Promise<boolean> => {
		const sessionToken = authStore.sessionToken;
		if (!sessionToken) return false;

		const userId = authStore.currentUser?.id ?? '__pending__';
		const key = `${userId}:${token}`;
		if (key === lastUploadKey && Date.now() - lastUploadAt < UPLOAD_DEDUPE_MS) {
			return true;
		}

		try {
			await $fetch(`${config.public.apiBaseUrl}/v2/users/current/notifications/push`, {
				method: 'POST',
				body: { token, platform: platform as PushPlatform },
				headers: {
					Authorization: `Bearer ${sessionToken}`
				}
			});
			lastUploadKey = key;
			lastUploadAt = Date.now();
			return true;
		} catch (error) {
			console.error('[push] failed to upload token:', error);
			return false;
		}
	};

	const syncCachedToken = async (): Promise<void> => {
		if (!cachedToken) return;
		if (!authStore.sessionToken) return;
		await uploadToken(cachedToken.token);
	};

	const triggerRegister = async (): Promise<void> => {
		try {
			const status = await PushNotifications.checkPermissions();
			if (status.receive !== 'granted') {
				const req = await PushNotifications.requestPermissions();
				if (req.receive !== 'granted') return;
			}
			await PushNotifications.register();
		} catch (error) {
			console.error('[push] register failed:', error);
		}
	};

	const handles: PluginListenerHandle[] = [];

	// Listeners MUST be attached before PushNotifications.register() — the plugin
	// fires `registration` as soon as the OS delivers the token (which can be near-
	// instant on a warm Firebase cache), and any event fired before the JS listener
	// is attached is dropped silently. See @capacitor/push-notifications README.
	handles.push(
		await PushNotifications.addListener('registration', async (token) => {
			await saveCachedToken({ token: token.value, platform: platform as PushPlatform });
			await syncCachedToken();
		})
	);

	handles.push(
		await PushNotifications.addListener('registrationError', (err) => {
			console.error('[push] registration error:', err);
		})
	);

	handles.push(
		await PushNotifications.addListener('pushNotificationReceived', (notification) => {
			const data = (notification.data ?? {}) as Record<string, unknown>;
			const id = typeof data.id === 'string' ? data.id : null;
			const userId = authStore.currentUser?.id;
			if (!id || !userId) return;

			const rawType = typeof data.type === 'string' ? data.type : 'info';
			const type: UserNotification['type'] = (
				['info', 'warning', 'error', 'success'] as const
			).includes(rawType as UserNotification['type'])
				? (rawType as UserNotification['type'])
				: 'info';

			const title = notification.title ?? '';
			const body = notification.body ?? '';
			const link = typeof data.link === 'string' ? data.link : undefined;
			const source = typeof data.source === 'string' ? data.source : 'system';
			const createdAt = Math.floor(Date.now() / 1000);

			addLiveNotification({
				id,
				user_id: userId,
				title,
				message: body,
				link,
				type,
				source,
				read: false,
				created_at: createdAt
			});

			// forward push notification to watch
			void forwardToWatch({ id, title, body, type, source, link, createdAt });
		})
	);

	handles.push(
		await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
			const data = action.notification.data;

			if (data?.link) {
				const link = String(data.link);
				if (link.startsWith('earth-app://')) {
					const rest = link.split('//')[1] || '';
					void navigateTo(`/tabs/${rest}`);
				} else {
					void Browser.open({ url: link });
				}
				return;
			}

			const id = data?.id;
			if (id) {
				void navigateTo(`/tabs/profile/notifications/${id}`);
			}
		})
	);

	// Any sessionToken transition (login, re-login as same user, login as different
	// user) needs a re-upload because mantle2 deletes the push_tokens row on /logout
	// and keys the row by (user_id, platform). Without this, a logout → re-login in
	// the same app process never restores the row and pushes stay silent until the
	// next cold start.
	const stopSessionWatch = watch(
		() => authStore.sessionToken,
		async (newToken) => {
			if (!newToken) {
				// logged out — force the next session to re-upload even if same user/token.
				lastUploadKey = null;
				return;
			}
			if (cachedToken) {
				await uploadToken(cachedToken.token);
			} else {
				// no cached token yet (first install + first login) — kick the OS to
				// deliver one; the registration listener will pick up the upload.
				await triggerRegister();
			}
		}
	);

	// currentUser typically loads after sessionToken; if our first upload happened
	// before we knew the user, the dedupe key was pinned to '__pending__'. A fresh
	// upload tied to the real user id keeps server-side telemetry correct and lets
	// future identical uploads be deduped properly.
	const stopUserWatch = watch(
		() => authStore.currentUser?.id,
		async (newId, oldId) => {
			if (!newId || newId === oldId) return;
			if (cachedToken && authStore.sessionToken) {
				await uploadToken(cachedToken.token);
			}
		}
	);

	// App resume: re-sync the cached token (mantle2 merge is idempotent + bumps the
	// updated timestamp, which is useful once server-side stale-token pruning ever
	// goes time-based), and throttled re-register so a token rotation that happened
	// while backgrounded gets picked up without waiting for a full cold start.
	const appStateHandle = await App.addListener('appStateChange', async ({ isActive }) => {
		if (!isActive) return;
		await syncCachedToken();
		if (Date.now() - lastResumeRegisterAt > RESUME_REGISTER_TTL_MS) {
			lastResumeRegisterAt = Date.now();
			await triggerRegister();
		}
	});
	handles.push(appStateHandle);

	const teardown: PushTeardown = async () => {
		stopSessionWatch();
		stopUserWatch();
		await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
		if (activeTeardown === teardown) {
			activeTeardown = null;
		}
	};
	activeTeardown = teardown;

	await triggerRegister();

	// Fallback: if register() doesn't actually fire the `registration` event (rare
	// but observed on warm-cache edge cases), the previously persisted token still
	// gets a chance to land on mantle2.
	await syncCachedToken();

	return teardown;
}
