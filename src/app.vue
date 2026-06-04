<template>
	<IonApp>
		<div
			v-if="isOffline || pendingMutationCount > 0"
			class="fixed top-12 left-1/2 -translate-x-1/2 z-1000 pointer-events-none"
			role="status"
			aria-live="polite"
		>
			<div
				v-if="isOffline"
				class="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white shadow-lg shadow-black/40"
			>
				<UIcon
					name="material-symbols:cloud-off-outline"
					class="size-5"
				/>
				<span class="font-medium text-sm">You're offline</span>
				<span
					v-if="pendingMutationCount > 0"
					class="text-xs px-2 py-0.5 rounded-full bg-white/20 font-medium"
				>
					{{ pendingMutationCount }} pending
				</span>
			</div>
			<div
				v-else
				class="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 text-white shadow-lg shadow-black/40"
			>
				<UIcon
					name="mdi:cloud-sync-outline"
					class="size-5"
				/>
				<span class="font-medium text-sm"
					>Syncing {{ pendingMutationCount }} change{{
						pendingMutationCount === 1 ? '' : 's'
					}}…</span
				>
			</div>
		</div>
		<IonRouterOutlet :animation="slide" />

		<ClientOnly>
			<MSiteTour
				:steps="welcomeTour"
				name="Welcome Tour"
				tour-id="welcome"
				:pulse="true"
				@close-tour="handleWelcomeTourClosed"
			/>
			<UserEmailMGate />
			<UserQuestCompletionOverlay
				v-model:open="celebrationOpen"
				:quest-title="celebrationPayload.questTitle"
				:points="celebrationPayload.points"
			>
				<template #actions="{ close }">
					<IonButton
						color="tertiary"
						size="small"
						@click="shareCelebration"
					>
						<UIcon
							name="mdi:share-variant"
							class="size-5 mr-2"
						/>
						Share
					</IonButton>

					<IonButton
						color="primary"
						size="small"
						@click="close"
					>
						Keep Exploring
						<UIcon
							name="mdi:arrow-right"
							class="size-5 ml-2"
						/>
					</IonButton>
				</template>
			</UserQuestCompletionOverlay>
		</ClientOnly>
	</IonApp>
</template>

<script setup lang="ts">
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import slide from './animations/slide';
import { initQuestCelebrationListener } from './composables/useHaptics';
import {
	applyNetworkStatus,
	isOffline,
	setDataSaverModeEnabled,
	setOfflineModeEnabled
} from './composables/useNetwork';

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
const { activeStepIndex, hasCompleted: tourCompleted } = useSiteTour();
const router = useIonRouter();
const isNative = Capacitor.isNativePlatform();

const WELCOME_TOUR_RESUME_KEY = 'sky:welcome-tour-resume-step';

// save the current step on close so the dashboard can offer a "Continue tour" chip;
// MSiteTour already marks complete internally on the Finish path
function handleWelcomeTourClosed() {
	if (tourCompleted('welcome')) {
		void Preferences.remove({ key: WELCOME_TOUR_RESUME_KEY }).catch(() => {});
		return;
	}
	const step = activeStepIndex.value;
	if (step > 0) {
		void Preferences.set({
			key: WELCOME_TOUR_RESUME_KEY,
			value: String(step)
		}).catch(() => {});
	}
}

const pendingMutationCount = computed(() => pendingMMutations.value.length);

const {
	open: celebrationOpen,
	payload: celebrationPayload,
	closeCelebration
} = useQuestCelebration();

async function shareCelebration() {
	const title = celebrationPayload.value?.questTitle || 'a quest';
	const points = celebrationPayload.value?.points;
	const text = points
		? `I just completed "${title}" on The Earth App — earned ${points} Impact Points!`
		: `I just completed "${title}" on The Earth App!`;
	try {
		await Share.share({
			title: 'Quest Complete',
			text,
			dialogTitle: 'Share your quest win'
		});
	} catch {
		// user cancelled or plugin unavailable — silently swallow
	}
	closeCelebration();
}

const profilePath = computed(() =>
	user.value?.username ? `/tabs/profile/@${user.value.username}` : '/tabs/profile/editor'
);

const welcomeTour = computed<SiteTourStep[]>(() => [
	{
		id: 'title',
		title: 'Welcome to The Earth App',
		description:
			'A new kind of social experience: discover hobbies, dive into articles, answer thoughtful prompts, and meet people with similar interests.\n\nThis short tour will walk you through the highlights — feel free to skip it at any time with the X button or by tapping outside.',
		footer: 'Tap Next to continue, or use the hardware back button to exit.',
		icon: 'mdi:earth',
		placement: 'center',
		dim: true,
		highlightPadding: 16
	},
	{
		id: 'navbar',
		title: 'Your Tab Bar',
		description:
			'The tab bar is your home base. Jump between Dashboard, Discover, Quests, and your Profile from anywhere in the app.',
		footer: 'It stays pinned to the bottom while you explore.',
		icon: 'mdi:compass-outline'
	},
	{
		url: '/tabs/discover?tab=activity',
		id: 'discover-search',
		title: 'Activities — Find What You Love',
		description:
			'Activities are hobbies, sports, and interests you can explore. Each one has curated guides, resources, and even quests you can complete to level up.',
		footer: 'Tip: pick a few activities on your profile to get personalized recommendations.',
		icon: 'mdi:run',
		prerendered: true,
		highlightPadding: 12,
		cta: {
			label: 'Try Activities Now',
			icon: 'mdi:run',
			color: 'secondary',
			advance: true,
			handler: () => router.push('/tabs/discover?tab=activity', slide)
		}
	},
	{
		url: '/tabs/discover?tab=article',
		id: 'discover-search',
		title: 'Articles — Read & Learn',
		description:
			'Bite-sized articles tailored to your interests. Read about science, culture, sustainability, and more — then take a quick quiz to lock in what you learned.\n\nArticles auto-archive after 2 weeks, so the catalog stays fresh. Writers: publish now while readers are looking.',
		footer: 'Articles personalize over time as you engage with the community.',
		icon: 'mdi:book-open-page-variant-outline',
		prerendered: true
	},
	{
		url: '/tabs/discover?tab=prompt',
		id: 'discover-search',
		title: 'Prompts — Get Creative',
		description:
			"Daily creative prompts to spark your imagination. Share a short response, browse what others wrote, and discover new perspectives from the community.\n\nPrompts vanish after 2 days — if you've got something to say, say it now.",
		footer: 'Your answers can be public, friends-only, or private — your call.',
		icon: 'mdi:lightbulb-on-outline',
		prerendered: true
	},
	{
		url: '/signup',
		id: 'title',
		title: 'Create Your Account',
		description:
			'Sign up to unlock personalized recommendations, earn badges and Impact Points, complete quests, and connect with friends across the Earth App.',
		footer: "It's free and only takes a minute.",
		anonymous: true,
		icon: 'mdi:account-plus-outline',
		dim: true,
		cta: {
			label: 'Sign Up Now',
			icon: 'mdi:account-plus',
			color: 'tertiary',
			advance: false,
			closeOnSuccess: true,
			handler: () => router.push('/signup', slide)
		}
	},
	{
		url: profilePath.value,
		id: 'profile-title',
		title: 'Your Profile',
		description:
			'Your profile is the heart of your Earth App experience. The activities you pick power your recommendations across the entire app — articles, prompts, and events.',
		footer: 'A complete profile gets far more friend requests and replies.',
		anonymous: false,
		icon: 'mdi:account-circle-outline'
	},
	{
		id: 'avatar',
		title: 'Your Avatar',
		description:
			'Your avatar is generated from the activities you choose — no boring placeholder! Regenerate it any time, or unlock decorative cosmetics with Impact Points.',
		footer: 'Customize it to match your vibe.',
		anonymous: false,
		icon: 'mdi:face-man-shimmer-outline'
	},
	{
		id: 'notifications',
		title: 'Notifications',
		description:
			'The bell shows new replies, friend activity, quest progress, and important account events. Tap it to see the full list.',
		footer: 'Fine-tune which notifications you receive in your account settings.',
		anonymous: false,
		icon: 'mdi:bell-outline',
		highlightPadding: 6
	},
	{
		url: '/tabs/settings',
		id: 'settings-link',
		title: 'Your Settings',
		description:
			'In settings, tune appearance, performance, push notifications, offline mode, and account behavior to match your device and preferences.',
		footer: 'Review settings any time to tailor your experience.',
		anonymous: false,
		icon: 'mdi:cog-outline'
	},
	{
		url: '/tabs/profile/editor',
		title: 'Profile Editor',
		description:
			'The profile editor is where you update your info, bio, interests, and visibility. Tap the help button there for a full walkthrough of every field.',
		footer: 'Keep your profile fresh to get the best recommendations.',
		anonymous: false,
		icon: 'mdi:account-edit-outline',
		cta: {
			label: 'Open Profile Editor',
			icon: 'mdi:account-edit-outline',
			color: 'secondary',
			advance: true,
			handler: () => router.push('/tabs/profile/editor', slide)
		}
	},
	{
		url: '/tabs/quests',
		title: 'Quests',
		description:
			'Quests are guided journeys that turn an activity into a structured adventure with steps, rewards, and a satisfying finish. Start with one tied to an activity you already love.',
		footer: 'You can only have one active quest at a time — choose wisely!',
		anonymous: false,
		icon: 'mdi:map-marker-path',
		cta: {
			label: 'Pick a Quest',
			icon: 'mdi:map-marker-path',
			color: 'tertiary',
			advance: true,
			handler: () => router.push('/tabs/quests', slide)
		}
	},
	{
		url: profilePath.value,
		id: 'badges',
		title: 'Badges',
		description:
			'Badges celebrate your milestones — first article read, first quest completed, streaks, mastery achievements, and more. They show on your public profile.',
		footer: 'Some badges have a "Mastery" path that goes way deeper if you commit.',
		anonymous: false,
		icon: 'mdi:shield-star-outline'
	},
	{
		id: 'points-history',
		title: 'Impact Points',
		description:
			'Impact Points reward you for engaging with the Earth App and the world around you — reading, writing, completing quests, helping others. Spend them on cosmetics, or watch them climb the leaderboard.',
		footer: 'Tap "Points History" to see exactly how you earned them.',
		anonymous: false,
		icon: 'mdi:chart-line'
	},
	{
		id: 'user-activities',
		title: 'Your Activities Showcase',
		description:
			"Your selected activities appear here on your profile, giving friends an at-a-glance look at what you're into.",
		footer: 'Keep this list current — recommendations follow these choices closely.',
		anonymous: false,
		icon: 'mdi:format-list-bulleted-square'
	},
	{
		id: 'friends-buttons',
		title: 'Your Friends',
		description:
			'Add friends to follow their activities, react to their content, and unlock friends-only privacy settings. Building a network makes the Earth App way more fun.',
		footer: 'Tap any user avatar across the app to view their profile and add them.',
		anonymous: false,
		icon: 'mdi:account-multiple-outline'
	},
	{
		id: 'user-journeys',
		title: 'Your Journeys',
		description:
			'Journeys summarize how you engage with prompts, articles, events, and activities — and reward streaks of meaningful engagement.',
		footer: 'Daily login alone is enough to keep most journeys going.',
		anonymous: false,
		icon: 'mdi:walk'
	},
	{
		id: 'user-content',
		title: 'Your Content',
		description:
			"Every article and prompt response you publish lives here. It's your portfolio on the Earth App — and a great way for others to discover your perspective.",
		footer: "You're all caught up! Tap Finish to start exploring.",
		anonymous: false,
		icon: 'mdi:notebook-multiple'
	}
]);

let networkListener: PluginListenerHandle | null = null;
let navHandler: (() => void) | null = null;
let stopUserCacheWatch: (() => void) | null = null;
let stopOfflineSettingWatch: (() => void) | null = null;
let stopDataSaverSettingWatch: (() => void) | null = null;
let pushTeardown: (() => Promise<void>) | null = null;
let dailyNotificationTeardown: (() => void) | null = null;
let watchBridgeTeardown: (() => void) | null = null;
let questCelebrationTeardown: (() => void) | null = null;
let offlineQueueTeardown: (() => void) | null = null;

const handledDeepLinkTimestamps = new Map<string, number>();
const MAX_DEEP_LINK_HISTORY = 64;

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

const appName = config.name;
const appThemeColor = config.themeColor;

useSeoMeta({
	charset: 'utf-8',
	title: appName,
	themeColor: appThemeColor,
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

	// Guard against an unbounded set of unique URLs in a long session.
	if (handledDeepLinkTimestamps.size > MAX_DEEP_LINK_HISTORY) {
		const oldestKey = handledDeepLinkTimestamps.keys().next().value;
		if (oldestKey !== undefined) {
			handledDeepLinkTimestamps.delete(oldestKey);
		}
	}

	return now - last < 1_500;
}

async function handleIncomingDeepLink(url: string) {
	if (!url || shouldIgnoreDuplicateDeepLink(url)) return;

	const resolved = resolveDeepLink(url);
	if (resolved.type === 'ignore') return;

	const flowState = refreshFlowState();

	if (resolved.type === 'oauth-complete') {
		await closeBrowser();
		clearFlow();

		// offline check before persisting the token — otherwise we land "logged in but no user"
		if (isOffline.value) {
			await showErrorToast('You appear to be offline. Reconnect and try signing in again.');
			return;
		}

		authStore.setSessionToken(resolved.sessionToken);
		await safeHydrateUser();

		const effectiveContext = resolved.context || flowState.context;
		const destination =
			effectiveContext === 'signup' && user.value && !user.value.account?.email_verified
				? '/verify-email'
				: resolved.target;

		await navigateTo(destination, { replace: true });
		notifySuccess();
		return;
	}

	if (flowState.active) {
		await closeBrowser();
		clearFlow();
		if (!isOffline.value) {
			await safeHydrateUser();
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

async function safeHydrateUser() {
	try {
		await hydrateUser();
	} catch (error) {
		console.warn('User hydration failed:', error);
	}
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
		await safeHydrateUser();
	}

	if (import.meta.client && !questCelebrationTeardown) {
		questCelebrationTeardown = initQuestCelebrationListener();
	}

	if (import.meta.client && !offlineQueueTeardown) {
		// register dispatchers before init so any persisted queue can replay
		// immediately when the network comes back
		const { markNotificationRead, markAllNotificationsRead } = useNotifications();
		const notificationStore = useNotificationStore();

		registerMMutationDispatcher('mark-read', async (m) => {
			const id = typeof m.payload?.id === 'string' ? m.payload.id : null;
			if (!id) return true; // malformed entry — drop it
			const res = await markNotificationRead(id);
			return res.success === true;
		});

		registerMMutationDispatcher('mark-all-read', async () => {
			const res = await markAllNotificationsRead();
			return res.success === true;
		});

		registerMMutationDispatcher('mark-notification-delete', async (m) => {
			const id = typeof m.payload?.id === 'string' ? m.payload.id : null;
			if (!id) return true;
			const res = await notificationStore.deleteNotification(id);
			return res.success === true;
		});

		offlineQueueTeardown = await initMOfflineQueue();
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

			if (!wasOffline && isOffline.value) notifyWarning();
			if (wasOffline && !isOffline.value) notifySuccess();
		};

		await updateFromStatus(await Network.getStatus());
		networkListener = await Network.addListener('networkStatusChange', updateFromStatus);

		appUrlListener = await App.addListener('appUrlOpen', handleAppUrlOpen);
		browserFinishedListener = await Browser.addListener('browserFinished', async () => {
			const flowState = refreshFlowState();
			if (!flowState.active) return;

			clearFlow();
			if (!isOffline.value) {
				await safeHydrateUser();
			}
		});

		const launchUrl = await App.getLaunchUrl();
		if (launchUrl?.url) {
			await handleIncomingDeepLink(launchUrl.url);
		}

		try {
			pushTeardown = await initPushNotifications();
		} catch (error) {
			console.warn('Push notification setup failed:', error);
		}

		try {
			dailyNotificationTeardown = initDailyNotifications();
		} catch (error) {
			console.warn('Daily notification setup failed:', error);
		}

		try {
			watchBridgeTeardown = initWatchNotificationBridge();
		} catch (error) {
			console.warn('Watch notification bridge setup failed:', error);
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

		if (!wasOffline && isOffline.value) notifyWarning();
		if (wasOffline && !isOffline.value) notifySuccess();
	};

	updateFromNavigator();
	window.addEventListener('online', updateFromNavigator);
	window.addEventListener('offline', updateFromNavigator);
	navHandler = updateFromNavigator;
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

	if (pushTeardown) {
		const teardown = pushTeardown;
		pushTeardown = null;
		void teardown().catch((error) => console.warn('Push teardown failed:', error));
	}

	if (watchBridgeTeardown) {
		watchBridgeTeardown();
		watchBridgeTeardown = null;
	}

	if (dailyNotificationTeardown) {
		dailyNotificationTeardown();
		dailyNotificationTeardown = null;
	}

	if (questCelebrationTeardown) {
		questCelebrationTeardown();
		questCelebrationTeardown = null;
	}

	if (offlineQueueTeardown) {
		offlineQueueTeardown();
		offlineQueueTeardown = null;
	}
});

useBackButton(10, () => {
	if (router.canGoBack()) {
		router.back(slide);
		return;
	}
	// no history — let the OS minimize the app instead of nav stack pop
	if (isNative) {
		void App.minimizeApp().catch(() => App.exitApp());
	}
});
</script>
