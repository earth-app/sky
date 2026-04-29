<template>
	<IonApp>
		<div
			v-if="isOffline"
			class="fixed top-4 left-1/2 -translate-x-1/2 z-1000 pointer-events-none"
		>
			<div
				class="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white shadow-lg shadow-black/40"
			>
				<UIcon
					name="material-symbols:cloud-off-outline"
					class="size-5"
				/>
				<span class="font-medium text-sm">You're offline</span>
			</div>
		</div>
		<IonRouterOutlet :animation="slide" />

		<ClientOnly>
			<MSiteTour
				:steps="welcomeTour"
				name="Welcome Tour"
				tour-id="welcome"
			/>
		</ClientOnly>
	</IonApp>
</template>

<script setup lang="ts">
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import slide from './animations/slide';
import {
	applyNetworkStatus,
	isOffline,
	setDataSaverModeEnabled,
	setOfflineModeEnabled
} from './composables/useNetwork';
import { initPushNotifications } from './composables/usePushNotifications';

if (import.meta.client) {
	defineCustomElements(window);
}

const config = useAppConfig();
const { fetchUser, user } = useAuth();
const authStore = useAuthStore();
const { resolveDeepLink } = useDeepLinkRouting();
const { closeBrowser, clearFlow, refreshFlowState } = useMobileOAuth();
const { notifySuccess, notifyWarning } = useAppHaptics();
const { settings: appSettings, init: initSettings } = useAppSettings();
const isNative = Capacitor.isNativePlatform();

const profilePath = computed(() =>
	user.value?.username ? `/tabs/profile/@${user.value.username}` : '/tabs/profile/editor'
);

const welcomeTour = computed<SiteTourStep[]>(() => [
	{
		id: 'title',
		title: 'Welcome to The Earth App',
		description:
			'The Earth App encourages you to explore new things and engage with people who share your interests.',
		footer: 'Click Next to continue.'
	},
	{
		id: 'navbar',
		title: 'Navigation Bar',
		description:
			'The tab bar lets you quickly move between the main areas of the app, including discover and your profile.',
		footer: 'Click Next to continue.'
	},
	{
		url: '/tabs/discover?tab=activity',
		id: 'discover-search',
		title: 'Activities Page',
		description:
			'The Discover page helps you find new activities and interests. Use search to quickly jump into topics you care about.',
		footer: 'There are lots of things to explore. Click Next to continue.',
		prerendered: true
	},
	{
		url: '/tabs/discover?tab=article',
		id: 'discover-search',
		title: 'Articles Page',
		description:
			'Discover also surfaces articles tailored to your interests so you can keep learning and share what you find.',
		footer:
			'Your feed gets better as your profile and activity preferences become more complete. Click Next to continue.'
	},
	{
		url: '/tabs/discover?tab=prompt',
		id: 'discover-search',
		title: 'Prompts Page',
		description:
			'Prompts spark creativity and discussion. Responding to prompts is a great way to share ideas with the community.',
		footer: 'Click Next to continue.'
	},
	{
		url: profilePath.value,
		id: 'profile-title',
		title: 'Your Profile',
		description:
			'Your profile helps personalize recommendations and shows others who you are. Keep it updated to get the most out of the app.',
		footer: 'You can highlight your interests and make your profile stand out.'
	},
	{
		id: 'avatar',
		title: 'Your Avatar',
		description:
			'Your avatar represents you across the app and community. It appears on your profile and in social spaces.',
		footer: 'Customize it to match your vibe.'
	},
	{
		url: '/tabs/settings',
		id: 'settings',
		title: 'Your Settings',
		description:
			'In settings, you can tune appearance, performance, and account behavior to match your device and preferences.',
		footer: 'Review settings any time to tailor your experience.'
	},
	{
		id: 'notifications',
		title: 'Notifications',
		description:
			'Control how the app alerts you so you can stay informed without being overwhelmed.',
		footer: 'Choose the notification experience that works best for you.'
	},
	{
		url: profilePath.value,
		id: 'badges',
		title: 'Badges',
		description:
			'Badges are a fun way to show your achievements and interests as you engage with content and activities.',
		footer: 'Open your badges to see what you have earned.'
	},
	// Quests are not currently exposed in the mobile tab shell.
	// {
	// 	id: 'quests',
	// 	title: 'Quests',
	// 	description: 'Complete quests to explore new interests and earn rewards.'
	// },
	{
		id: 'points-history',
		title: 'Points History',
		description:
			'Engaging with the app rewards Impact Points. You can track how your points change over time here.',
		footer: 'Keep engaging with content to grow your score.'
	},
	{
		id: 'user-activities',
		title: 'Your Activities',
		description:
			'Your selected activities shape recommendations and help others quickly see what you are into.',
		footer: 'Updating activities keeps your experience fresh and relevant.'
	},
	{
		id: 'friends-buttons',
		title: 'Your Friends',
		description:
			'Friends help you discover people and content you might otherwise miss. Build your network over time.',
		footer: 'Connect with friends to see more activity from your community.'
	},
	{
		id: 'user-journeys',
		title: 'Your Journeys',
		description:
			'Journeys summarize how you engage with prompts, articles, events, and activities.',
		footer: 'Keep exploring to grow each journey category.'
	},
	{
		id: 'user-content',
		title: 'Your Content',
		description:
			'Articles and prompts you create appear here. Sharing content is a great way to contribute to the community.',
		footer: 'Thank you for taking the tour. Tap Finish to continue exploring.'
	}
]);

let networkListener: PluginListenerHandle | null = null;
let navHandler: (() => void) | null = null;
let stopUserCacheWatch: (() => void) | null = null;
let stopOfflineSettingWatch: (() => void) | null = null;
let stopDataSaverSettingWatch: (() => void) | null = null;

const handledDeepLinkTimestamps = new Map<string, number>();

let appUrlListener: PluginListenerHandle | null = null;
let browserFinishedListener: PluginListenerHandle | null = null;

if (import.meta.client) {
	const persistedSessionToken = localStorage.getItem('session_token');
	if (!authStore.sessionToken && persistedSessionToken) {
		authStore.setSessionToken(persistedSessionToken);
	}

	watch(
		() => authStore.sessionToken,
		(value) => {
			if (value) {
				localStorage.setItem('session_token', value);
				return;
			}

			localStorage.removeItem('session_token');
		},
		{ immediate: true }
	);
}

useSeoMeta({
	charset: 'utf-8',
	title: config.name,
	themeColor: {
		content: config.themeColor,
		media: '(prefers-color-scheme: dark)'
	},
	mobileWebAppCapable: 'yes',
	appleMobileWebAppCapable: 'yes',
	appleMobileWebAppStatusBarStyle: 'black'
});

// deep linking

function shouldIgnoreDuplicateDeepLink(url: string) {
	const now = Date.now();
	const last = handledDeepLinkTimestamps.get(url) || 0;
	handledDeepLinkTimestamps.set(url, now);

	for (const [key, timestamp] of handledDeepLinkTimestamps.entries()) {
		if (now - timestamp > 30_000) {
			handledDeepLinkTimestamps.delete(key);
		}
	}

	return now - last < 1_500;
}

async function handleIncomingDeepLink(url: string) {
	if (!url || shouldIgnoreDuplicateDeepLink(url)) return;

	const resolved = resolveDeepLink(url);
	if (resolved.type === 'ignore') return;

	const flowState = refreshFlowState();
	if (flowState.active) {
		await closeBrowser();
		clearFlow();
		if (!isOffline.value) {
			await hydrateUser();
		}
	}

	if (resolved.type === 'external') {
		await Browser.open({ url: resolved.target });
		return;
	}

	await navigateTo(resolved.target, { replace: true });
}

async function handleAppUrlOpen(event: URLOpenListenerEvent) {
	await handleIncomingDeepLink(event.url);
}

// settings & other

async function hydrateUser() {
	const hasToken = Boolean(authStore.sessionToken);
	const shouldForce = !hasToken;
	await fetchUser(shouldForce);
}

onMounted(async () => {
	try {
		await initSettings();
	} catch (error) {
		console.error('Failed to initialize app settings:', error);
	}

	stopOfflineSettingWatch = watch(
		() => appSettings.value.offlineMode,
		(value) => {
			setOfflineModeEnabled(Boolean(value));
		},
		{ immediate: true }
	);

	stopDataSaverSettingWatch = watch(
		() => appSettings.value.dataSaverMode,
		(value) => {
			setDataSaverModeEnabled(Boolean(value));
		},
		{ immediate: true }
	);

	if (isNative) {
		const initialStatus = await Network.getStatus();
		applyNetworkStatus(initialStatus);
	} else if (import.meta.client) {
		applyNetworkStatus({
			connected: navigator.onLine,
			connectionType: navigator.onLine ? 'unknown' : 'none'
		});
	}

	if (!isOffline.value) {
		await hydrateUser();
	}

	// on client persist authenticated user for offline fallback whenever it changes
	if (import.meta.client && !stopUserCacheWatch) {
		stopUserCacheWatch = watch(
			() => user.value,
			(newUser) => {
				if (newUser) {
					void saveCachedUser(newUser).catch(() => {});
				}
			},
			{ immediate: true }
		);
	}

	if (isNative) {
		const updateFromStatus = async (s: ConnectionStatus) => {
			const wasOffline = isOffline.value;
			applyNetworkStatus(s);

			if (!wasOffline && isOffline.value) await notifyWarning();
			if (wasOffline && !isOffline.value) await notifySuccess();
		};

		await updateFromStatus(await Network.getStatus());
		networkListener = await Network.addListener('networkStatusChange', updateFromStatus);

		appUrlListener = await App.addListener('appUrlOpen', handleAppUrlOpen);
		browserFinishedListener = await Browser.addListener('browserFinished', async () => {
			const flowState = refreshFlowState();
			if (!flowState.active) return;

			clearFlow();
			if (!isOffline.value) {
				await hydrateUser();
			}
		});

		const launchUrl = await App.getLaunchUrl();
		if (launchUrl?.url) {
			await handleIncomingDeepLink(launchUrl.url);
		}
		return;
	}

	// browser fallback
	const updateFromNavigator = async () => {
		const wasOffline = isOffline.value;
		applyNetworkStatus({
			connected: navigator.onLine,
			connectionType: navigator.onLine ? 'unknown' : 'none'
		});

		if (!wasOffline && isOffline.value) await notifyWarning();
		if (wasOffline && !isOffline.value) await notifySuccess();
	};

	updateFromNavigator();
	window.addEventListener('online', updateFromNavigator);
	window.addEventListener('offline', updateFromNavigator);
	navHandler = updateFromNavigator;

	// register push notifications
	if (isNative) {
		await initPushNotifications();
	}
});

onBeforeUnmount(() => {
	appUrlListener?.remove();
	browserFinishedListener?.remove();
	stopUserCacheWatch?.();
	stopOfflineSettingWatch?.();
	stopDataSaverSettingWatch?.();

	networkListener?.remove();
	networkListener = null;
	stopUserCacheWatch = null;
	stopOfflineSettingWatch = null;
	stopDataSaverSettingWatch = null;

	if (navHandler) {
		window.removeEventListener('online', navHandler);
		window.removeEventListener('offline', navHandler);
		navHandler = null;
	}

	appUrlListener = null;
	browserFinishedListener = null;
});
</script>
