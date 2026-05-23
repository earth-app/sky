import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

type PushTeardown = () => Promise<void>;

let activeTeardown: PushTeardown | null = null;

export async function initPushNotifications(): Promise<PushTeardown> {
	if (activeTeardown) {
		await activeTeardown();
	}

	const config = useRuntimeConfig();
	const router = useIonRouter();

	const permStatus = await PushNotifications.requestPermissions();
	if (permStatus.receive !== 'granted') {
		throw new Error('Push permission not granted');
	}

	await PushNotifications.register();

	const handles: PluginListenerHandle[] = [];

	handles.push(
		await PushNotifications.addListener('registration', async (token) => {
			const sessionToken = useCurrentSessionToken();
			if (!sessionToken) {
				console.warn('Push registered before user sign-in; skipping token upload.');
				return;
			}

			const platform = Capacitor.getPlatform();
			if (platform !== 'ios' && platform !== 'android') {
				return;
			}

			try {
				await $fetch(`${config.public.apiBaseUrl}/v2/users/current/notifications/push`, {
					method: 'POST',
					body: { token: token.value, platform },
					headers: {
						Authorization: `Bearer ${sessionToken}`
					}
				});
			} catch (error) {
				console.error('Failed to upload push token:', error);
			}
		})
	);

	handles.push(
		await PushNotifications.addListener('registrationError', (err) => {
			console.error('Push registration error:', err);
		})
	);

	handles.push(
		await PushNotifications.addListener('pushNotificationReceived', (notification) => {
			console.debug('Push notification received:', notification);
		})
	);

	handles.push(
		await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
			const data = action.notification.data;

			if (data?.link) {
				const link = String(data.link);
				if (link.startsWith('earth-app://')) {
					const rest = link.split('//')[1] || '';
					router.push(`/tabs/${rest}`);
				} else {
					void Browser.open({ url: link });
				}
				return;
			}

			const id = data?.id;
			if (id) {
				router.push(`/tabs/profile/notifications/${id}`);
			}
		})
	);

	const teardown: PushTeardown = async () => {
		await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
		if (activeTeardown === teardown) {
			activeTeardown = null;
		}
	};

	activeTeardown = teardown;
	return teardown;
}
