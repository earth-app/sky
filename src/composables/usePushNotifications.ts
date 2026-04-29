import { Browser } from '@capacitor/browser';
import { PushNotifications } from '@capacitor/push-notifications';

export async function initPushNotifications() {
	const config = useRuntimeConfig();
	const router = useIonRouter();
	let permStatus = await PushNotifications.requestPermissions();
	if (permStatus.receive !== 'granted') {
		throw new Error('Push permission not granted');
	}

	await PushNotifications.register();

	PushNotifications.addListener('registration', (token) => {
		console.log('Push Token:', token.value);

		$fetch(`${config.public.apiBaseUrl}/v2/users/current/notifications/push`, {
			method: 'POST',
			body: JSON.stringify({ token: token.value }),
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${useCurrentSessionToken()}`
			}
		});
	});

	PushNotifications.addListener('registrationError', (err) => {
		console.error('Registration error:', err);
	});

	PushNotifications.addListener('pushNotificationReceived', (notification) => {
		console.log('Notification received:', notification);
	});

	PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
		const data = action.notification.data;

		if (data?.link) {
			const link = String(data?.link);
			if (link.startsWith('earth-app://')) {
				// relative links, prepend /tabs/
				const link0 = `/tabs/${link.split('//')[1]}`;
				router.push(link0);
			} else {
				Browser.open({ url: link });
			}
		} else {
			const id = data?.id;
			router.push(`/tabs/profile/notifications/${id}`);
		}
	});
}
