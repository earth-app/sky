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
					}}...</span
				>
			</div>
		</div>
		<IonRouterOutlet :animation="slide" />

		<ClientOnly>
			<MBadgeUnlockRibbon />
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
import { Capacitor, CapacitorHttp, type PluginListenerHandle } from '@capacitor/core';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import slide from './animations/slide';
import { initQuestCelebrationListener } from './composables/useHaptics';
import { logWarn } from './composables/useLogger';
import {
	applyNetworkStatus,
	isOffline,
	setDataSaverModeEnabled,
	setOfflineModeEnabled
} from './composables/useNetwork';
import { useRateApp } from './composables/useRateApp';
import { OAUTH_USERNAME_PROMPT_KEY } from './utils/username';

if (import.meta.client) {
	defineCustomElements(window);
}

const config = useAppConfig();
const runtimeConfig = useRuntimeConfig();
const { fetchUser, user } = useAuth();
const authStore = useAuthStore();
const { resolveDeepLink } = useDeepLinkRouting();
const { closeBrowser, clearFlow, refreshFlowState } = useMobileOAuth();
const { notifySuccess, notifyWarning } = useAppHaptics();
const { settings: appSettings, init: initSettings } = useAppSettings();
const {
	activeStepIndex,
	hasCompleted: tourCompleted,
	markCompleted: markTourCompleted,
	isActiveTour
} = useSiteTour();
const router = useIonRouter();
const isNative = Capacitor.isNativePlatform();
const { recordSession, recordMeaningfulAction, maybePromptForReview } = useRateApp();

const WELCOME_TOUR_RESUME_KEY = 'sky:welcome-tour-resume-step';
// crust tracks tour completion in localStorage, which ios/WKWebView reclaims under storage
// pressure -> the whole tour re-auto-plays for users who already finished it. mirror welcome
// completion into durable Preferences and re-seed on boot so it never replays
const WELCOME_TOUR_COMPLETED_KEY = 'sky:welcome-tour-completed';

// defer the rate-app prompt well past the splash + any welcome-tour auto-play
const RATE_APP_PROMPT_DELAY_MS = 6000;

// compact last-known user, persisted so cold launch paints the avatar tab before the network resolves
const CURRENT_USER_KEY = 'current_user';
type CachedCurrentUser = {
	id: string;
	username: string;
	avatar_url: string | null;
};

function handleWelcomeTourClosed() {
	if (tourCompleted('welcome')) {
		void Preferences.remove({ key: WELCOME_TOUR_RESUME_KEY }).catch(() => {});
		void Preferences.set({ key: WELCOME_TOUR_COMPLETED_KEY, value: 'true' }).catch(() => {});
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

// persist completion durably whenever it flips (covers finish-via-CTA which never emits close),
// and re-seed the volatile localStorage flag from Preferences on cold launch
if (import.meta.client) {
	watch(
		() => tourCompleted('welcome'),
		(done) => {
			if (done)
				void Preferences.set({ key: WELCOME_TOUR_COMPLETED_KEY, value: 'true' }).catch(() => {});
		}
	);
}

async function restoreWelcomeTourCompletion() {
	try {
		const { value } = await Preferences.get({ key: WELCOME_TOUR_COMPLETED_KEY });
		if (value === 'true' && !tourCompleted('welcome')) markTourCompleted('welcome');
	} catch {
		// preferences read failed; worst case the short tour offers once more
	}
}

const pendingMutationCount = computed(() => pendingMMutations.value.length);

const {
	open: celebrationOpen,
	payload: celebrationPayload,
	closeCelebration
} = useQuestCelebration();

const { shareQuestCard } = useShareQuestCard();

async function shareCelebration() {
	// questId rides along on the celebration payload (set in MSubmission.vue)
	const payload = celebrationPayload.value as typeof celebrationPayload.value & {
		questId?: string;
	};
	const questId = payload?.questId;
	const selfId = user.value?.id;

	if (questId && selfId) {
		await shareQuestCard({
			userId: selfId,
			questId,
			questTitle: payload?.questTitle,
			points: payload?.points
		});
	} else {
		// no questId/self id (e.g. fresh hydration): share a plain text win
		const title = payload?.questTitle || 'a quest';
		const points = payload?.points;
		const text = points
			? `I just completed "${title}" on The Earth App: earned ${points} Impact Points!`
			: `I just completed "${title}" on The Earth App!`;
		try {
			await Share.share({ title: 'Quest Complete', text, dialogTitle: 'Share Your Quest Win' });
		} catch {
			// user cancelled or plugin unavailable; silently swallow
		}
	}

	closeCelebration();
}

const welcomeTour = computed<SiteTourStep[]>(() => [
	{
		title: 'Welcome to The Earth App',
		description:
			'Discover hobbies, read short articles, answer creative prompts, complete quests, and meet people who share your interests.\n\nThis is a quick 30-second tour. Skip it any time with the X or by tapping outside.',
		footer: 'Tap Next to continue.',
		icon: 'mdi:earth',
		placement: 'center',
		dim: true,
		highlightPadding: 16
	},
	{
		id: 'navbar',
		title: 'Your Tab Bar',
		description:
			'Your home base, pinned to the bottom on every screen. Dashboard is your feed, Discover explores content, Quests are guided adventures, and Profile is your account.',
		footer: 'Tap any tab to jump straight there.',
		icon: 'mdi:compass-outline'
	},
	{
		id: 'getting-started',
		title: 'Start Here',
		description:
			'This Getting Started checklist sets up your account and unlocks personalized recommendations. It stays on your dashboard, so you can finish it whenever you like.',
		footer: 'Complete it at your own pace; nothing is mandatory.',
		icon: 'mdi:flag-checkered',
		highlightPadding: 10
	},
	{
		id: 'explore-strip',
		title: 'Head Outside',
		description:
			'Curiosity Trails, your Shared Garden, and Trailmarks turn real time outdoors into something you can grow with friends. Tap any of these to start a calm outdoor practice whenever you feel the pull.',
		footer: 'Time outside is the whole point, not the point total.',
		icon: 'mdi:pine-tree',
		waitFor: 'explore-strip',
		highlightPadding: 10
	},
	{
		id: 'tab-discover',
		title: 'Discover What You Love',
		description:
			'Tap Discover to browse activities, articles, prompts, and events. Pick a few activities and the whole app personalizes to you.',
		footer: 'Fresh content rotates in daily.',
		icon: 'mdi:magnify',
		placement: 'top',
		dim: true
	},
	{
		id: 'tab-quests',
		title: 'Quests: Guided Adventures',
		description:
			'Tap Quests to start a step-by-step adventure tied to an activity. You can have one active at a time, and finishing it earns badges and Impact Points.',
		footer: 'Start with an activity you already enjoy.',
		icon: 'mdi:sword-cross',
		placement: 'top',
		dim: true
	},
	{
		title: "You're All Set",
		description:
			"That's the tour. The best first move is to start a quest: it walks you through the app while you earn your first rewards.",
		footer: 'You can replay this tour any time from the dashboard.',
		icon: 'mdi:rocket-launch-outline',
		placement: 'center',
		dim: true,
		cta: {
			label: 'Start Your First Quest',
			icon: 'mdi:map-marker-path',
			color: 'tertiary',
			advance: true,
			handler: () => router.push('/tabs/quests', slide)
		}
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
let rateAppPromptTimer: ReturnType<typeof setTimeout> | null = null;
let stopCelebrationWatch: (() => void) | null = null;

const handledDeepLinkTimestamps = new Map<string, number>();
const MAX_DEEP_LINK_HISTORY = 64;

let appUrlListener: PluginListenerHandle | null = null;
let browserFinishedListener: PluginListenerHandle | null = null;

if (import.meta.client) {
	const persistedSessionToken = localStorage.getItem('session_token');
	if (!authStore.sessionToken && persistedSessionToken) {
		authStore.setSessionToken(persistedSessionToken);
	}

	let tokenMirrorPrimed = false;
	watch(
		() => authStore.sessionToken,
		(value) => {
			if (value) {
				localStorage.setItem('session_token', value);
				void Preferences.set({ key: 'session_token', value }).catch(() => {});
			} else if (tokenMirrorPrimed) {
				localStorage.removeItem('session_token');
				void Preferences.remove({ key: 'session_token' }).catch(() => {});
			}
			tokenMirrorPrimed = true;
		},
		{ immediate: true }
	);

	let userMirrorPrimed = false;
	watch(
		() => authStore.currentUser,
		(value) => {
			if (value) {
				const snapshot: CachedCurrentUser = {
					id: value.id,
					username: value.username,
					avatar_url: value.account?.avatar_url ?? null
				};
				void Preferences.set({
					key: CURRENT_USER_KEY,
					value: JSON.stringify(snapshot)
				}).catch(() => {});
			} else if (userMirrorPrimed) {
				void Preferences.remove({ key: CURRENT_USER_KEY }).catch(() => {});
			}
			userMirrorPrimed = true;
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
		console.warn('[oauth] deep link received', {
			provider: resolved.provider,
			context: resolved.context,
			hasToken: Boolean(resolved.sessionToken)
		});
		await closeBrowser();
		clearFlow();

		// offline check before persisting the token: otherwise we land "logged in but no user"
		if (isOffline.value) {
			await showErrorToast('You appear to be offline. Reconnect and try signing in again.');
			return;
		}

		// fresh oauth signup gets the optional username-change step on the dashboard
		if (resolved.context === 'signup') {
			void Preferences.set({ key: OAUTH_USERNAME_PROMPT_KEY, value: 'true' }).catch(() => {});
		}

		authStore.setSessionToken(resolved.sessionToken);
		notifySuccess();

		// oauth is the only flow that hydrates purely via /v2/users/current; force
		// the fetch so currentUser populates (avatar + username + profileHref) even
		// though a token was just set (the default shouldForce heuristic would skip it)
		await safeHydrateUser(true);
		if (!authStore.sessionToken) {
			authStore.setSessionToken(resolved.sessionToken);
			await safeHydrateUser(true);
		}

		// if OAuth was started somewhere without an in-outlet `user` watcher,
		// still attempt a navigation from here
		router.navigate(resolved.target, 'root', 'replace');
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

	router.navigate(resolved.target, 'root', 'replace');
}

async function handleAppUrlOpen(event: URLOpenListenerEvent) {
	await handleIncomingDeepLink(event.url);
}

// settings & other

async function hydrateUser(force?: boolean) {
	const hasToken = Boolean(authStore.sessionToken);
	const shouldForce = force ?? !hasToken;

	await fetchUser(shouldForce);
}

async function safeHydrateUser(force?: boolean) {
	try {
		await hydrateUser(force);
	} catch (error) {
		console.warn('User hydration failed:', error);
	}
}

const isFullyResolvedUser = (u: unknown): boolean =>
	!!(u as any)?.account?.account_type && typeof (u as any)?.id === 'string';

let repairInFlight = false;
let repairBudget = 8; // backstop against a repair<->refetch ping-pong

async function repairCurrentUser(
	cachedUser: NonNullable<typeof authStore.currentUser> | null = null
) {
	if (!isNative || repairInFlight) return;
	const token = authStore.sessionToken;
	if (!token) return;
	if (isFullyResolvedUser(authStore.currentUser)) return;
	if (repairBudget <= 0) return;

	repairInFlight = true;
	const apiBaseUrl = runtimeConfig.public.apiBaseUrl as string;
	try {
		for (let attempt = 0; attempt < 3 && !isFullyResolvedUser(authStore.currentUser); attempt++) {
			repairBudget--;
			// brief backoff so a retry lands after the cold-launch network settles
			if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
			try {
				const res = await CapacitorHttp.request({
					method: 'GET',
					url: `${apiBaseUrl}/v2/users/current`,
					headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
				});

				if (res.status === 401 || res.status === 403) {
					authStore.setSessionToken(null);
					authStore.currentUser = null;
					return;
				}

				let data: any = res.data;
				if (typeof data === 'string') {
					try {
						data = JSON.parse(data);
					} catch {
						data = null;
					}
				}
				// some transports wrap the body in an { data } envelope; unwrap once if needed
				if (
					data &&
					typeof data === 'object' &&
					!data.id &&
					data.data &&
					typeof data.data === 'object'
				) {
					data = data.data;
				}
				if (
					data &&
					typeof data === 'object' &&
					typeof data.id === 'string' &&
					data.id &&
					typeof data.username === 'string'
				) {
					authStore.currentUser = data;
					repairBudget = 8;
					return;
				}

				// live 2xx but unresolved; log the shape to pin the transport on a device run
				logWarn('auth.repair', 'unresolved current-user (2xx)', {
					attempt,
					status: res.status,
					dataType: typeof res.data,
					keys:
						res.data && typeof res.data === 'object'
							? Object.keys(res.data as Record<string, unknown>).slice(0, 12)
							: undefined
				});
			} catch (error: any) {
				logWarn('auth.repair', 'current-user repair request failed', {
					attempt,
					message: String(error?.message ?? error)
				});
			}
		}
	} finally {
		repairInFlight = false;
	}

	// couldn't resolve but token isn't rejected; keep the cached user so the shell isn't blank
	if (!authStore.currentUser && cachedUser) authStore.currentUser = cachedUser;
}

async function bootstrapAuth() {
	if (!authStore.sessionToken) {
		try {
			const { value } = await Preferences.get({ key: 'session_token' });
			if (value) authStore.setSessionToken(value);
		} catch {
			// Preferences unavailable; continue unauthenticated
		}
	}

	let cachedUser: NonNullable<typeof authStore.currentUser> | null = null;
	if (authStore.sessionToken) {
		try {
			const { value } = await Preferences.get({ key: CURRENT_USER_KEY });
			if (value) {
				const cached = JSON.parse(value) as Partial<CachedCurrentUser>;
				if (cached?.id && cached?.username) {
					cachedUser = {
						id: cached.id,
						username: cached.username,
						account: { avatar_url: cached.avatar_url ?? undefined }
					} as unknown as NonNullable<typeof authStore.currentUser>;
				}
			}
		} catch {
			// no cached user or parse failure; the fetch below will populate it
		}
	}
	if (cachedUser && !authStore.currentUser) authStore.currentUser = cachedUser;

	if (!(await isOfflineModePreferred())) {
		await safeHydrateUser(true);
		await repairCurrentUser(cachedUser);
	}
}

onMounted(async () => {
	// re-seed tour completion from durable storage before the dashboard can auto-play it
	void restoreWelcomeTourCompletion();

	const authReady = bootstrapAuth();

	watch(
		() => [authStore.sessionToken, authStore.currentUser] as const,
		([token, current]) => {
			if (token && !current) void repairCurrentUser();
		}
	);

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

	// settled by now on the fast path; awaited so downstream native/notification
	// setup still sees a resolved currentUser
	await authReady;

	// item 15: rate-app engagement prompt (native store builds only). count this launch as a
	// session, flag a completed quest as a meaningful action, then - well after the splash and
	// any welcome-tour auto-play - ask an engaged user once whether they'd leave a review
	if (isNative && import.meta.client && user.value) {
		void recordSession();

		// a completed quest opens the celebration overlay; treat that as meaningful engagement
		stopCelebrationWatch = watch(
			() => celebrationOpen.value,
			(open) => {
				if (open) void recordMeaningfulAction();
			}
		);

		rateAppPromptTimer = setTimeout(() => {
			rateAppPromptTimer = null;
			if (!user.value) return;
			if (isActiveTour('welcome')) return; // never surface during the welcome tour
			void maybePromptForReview();
		}, RATE_APP_PROMPT_DELAY_MS);
	}

	if (isNative) {
		// keep a quest Live Activity (iOS) in sync with the active quest + schedule step-unlock reminders
		useQuestLiveActivity().init();
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
			if (!id) return true; // malformed entry; drop it
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

			if (!authStore.sessionToken) return;
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

	if (rateAppPromptTimer) {
		clearTimeout(rateAppPromptTimer);
		rateAppPromptTimer = null;
	}

	if (stopCelebrationWatch) {
		stopCelebrationWatch();
		stopCelebrationWatch = null;
	}
});

useBackButton(10, () => {
	if (router.canGoBack()) {
		router.back(slide);
		return;
	}
	// no history; let the OS minimize the app instead of nav stack pop
	if (isNative) {
		void App.minimizeApp().catch(() => App.exitApp());
	}
});
</script>
