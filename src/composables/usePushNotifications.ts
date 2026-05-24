import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

type PushTeardown = () => Promise<void>;

let activeTeardown: PushTeardown | null = null;

// useIonRouter() causes a crash during this -> use navigateTo()
export async function initPushNotifications(): Promise<PushTeardown> {
	if (activeTeardown) {
		await activeTeardown();
	}

	const config = useRuntimeConfig();
	const authStore = useAuthStore();
	const { addLiveNotification } = useNotifications();

	let pendingToken: string | null = null;
	const uploadToken = async (token: string, sessionToken: string) => {
		const platform = Capacitor.getPlatform();
		if (platform !== 'ios' && platform !== 'android') return;

		try {
			await $fetch(`${config.public.apiBaseUrl}/v2/users/current/notifications/push`, {
				method: 'POST',
				body: { token, platform },
				headers: {
					Authorization: `Bearer ${sessionToken}`
				}
			});
			if (pendingToken === token) pendingToken = null;
		} catch (error) {
			console.error('Failed to upload push token:', error);
		}
	};

	const handles: PluginListenerHandle[] = [];

	// Listeners MUST be attached before PushNotifications.register() — the plugin
	// fires `registration` as soon as the OS delivers the token (which can be near-
	// instant on a warm Firebase cache), and any event fired before the JS listener
	// is attached is dropped silently. See @capacitor/push-notifications README.
	handles.push(
		await PushNotifications.addListener('registration', async (token) => {
			const sessionToken = authStore.sessionToken;
			if (!sessionToken) {
				pendingToken = token.value;
				return;
			}
			await uploadToken(token.value, sessionToken);
		})
	);

	handles.push(
		await PushNotifications.addListener('registrationError', (err) => {
			console.error('Push registration error:', err);
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

			addLiveNotification({
				id,
				user_id: userId,
				title: notification.title ?? '',
				message: notification.body ?? '',
				link: typeof data.link === 'string' ? data.link : undefined,
				type,
				source: typeof data.source === 'string' ? data.source : 'system',
				read: false,
				created_at: Math.floor(Date.now() / 1000)
			});
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

	const stopSessionWatch = watch(
		() => authStore.sessionToken,
		async (newToken) => {
			if (newToken && pendingToken) {
				await uploadToken(pendingToken, newToken);
			}
		}
	);

	const teardown: PushTeardown = async () => {
		stopSessionWatch();
		await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
		if (activeTeardown === teardown) {
			activeTeardown = null;
		}
	};
	activeTeardown = teardown;

	// permission prompt + native register happen AFTER listeners are wired
	const permStatus = await PushNotifications.requestPermissions();
	if (permStatus.receive !== 'granted') {
		await teardown();
		throw new Error('Push permission not granted');
	}

	await PushNotifications.register();

	return teardown;
}
