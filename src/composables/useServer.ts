import { App } from '@capacitor/app';
import { onIonViewDidEnter, onIonViewDidLeave } from '@ionic/vue';
import { toValue, type MaybeRefOrGetter } from 'vue';

// #region Primary Request Handler

function isOfflineRequestBlocked() {
	const appSettings = useAppSettingsState();
	if (appSettings.value.offlineMode) return true;

	const networkOffline = useState<boolean>('network-offline', () => false);
	if (networkOffline.value) return true;

	if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
		return true;
	}

	return false;
}

function isDataSaverConstrained() {
	const appSettings = useAppSettingsState();
	const dataSaverEnabledState = useState<boolean>('network-data-saver-enabled', () => false);
	const connectionType = useState<'wifi' | 'cellular' | 'none' | 'unknown'>(
		'network-connection-type',
		() => 'unknown'
	);

	return (
		(appSettings.value.dataSaverMode || dataSaverEnabledState.value) &&
		connectionType.value === 'cellular'
	);
}

async function maybeDataSaverDelay() {
	if (!isDataSaverConstrained()) return;

	await new Promise((resolve) => setTimeout(resolve, 180));
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 400;

function getErrorStatus(error: unknown): number | null {
	const e = error as
		{ statusCode?: number; status?: number; response?: { status?: number } } | null | undefined;
	const candidate = e?.statusCode ?? e?.status ?? e?.response?.status;
	const numeric = Number(candidate);
	return Number.isFinite(numeric) && numeric >= 100 && numeric < 600 ? numeric : null;
}

function isTransientError(error: unknown): boolean {
	const status = getErrorStatus(error);
	if (status === null) return true; // network-level error (no HTTP response), retry
	if (status === 408 || status === 425 || status === 429) return true;
	return status >= 500 && status <= 599;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ServerRequestResult<T> =
	{ success: true; data: T } | { success: false; message: string; status?: number };

export interface MServerRequestOptions extends Record<string, any> {
	/** Number of retries on transient failures (default {@link DEFAULT_RETRIES}). Set to 0 to disable. */
	retries?: number;
	/** Base backoff in ms; grows exponentially per attempt with jitter (default {@link DEFAULT_RETRY_DELAY_MS}). */
	retryDelayMs?: number;
}

export async function makeMServerRequest<T>(
	key: string | null,
	suburl: string,
	token: string | null | undefined = null,
	options: MServerRequestOptions = {}
): Promise<ServerRequestResult<T>> {
	if (isOfflineRequestBlocked()) {
		return {
			success: false,
			message: 'Offline mode is enabled. Network requests are unavailable.'
		};
	}

	const {
		headers: extraHeaders,
		retries = DEFAULT_RETRIES,
		retryDelayMs = DEFAULT_RETRY_DELAY_MS,
		...restOptions
	} = options ?? {};

	const baseHeaders: Record<string, string> = {
		Accept: 'application/json',
		'User-Agent': `Earth-App Sky/1.0`
	};

	if (token) {
		baseHeaders['Authorization'] = `Bearer ${token}`;
	}

	if (restOptions.body && (restOptions.method === 'POST' || restOptions.method === 'PATCH')) {
		baseHeaders['Content-Type'] = 'application/json';
	}

	// crustBaseUrl is used so dev environments can point at a local crust instance.
	const config = useRuntimeConfig();
	const baseUrl = (config.public.crustBaseUrl as string | undefined) || 'https://app.earth-app.com';

	const maxAttempts = Math.max(1, retries + 1);
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await maybeDataSaverDelay();

			const data = await $fetch<T>(`${baseUrl}${suburl}`, {
				...restOptions,
				headers: { ...baseHeaders, ...(extraHeaders as Record<string, string> | undefined) }
			});

			return {
				success: true,
				data
			};
		} catch (error: unknown) {
			lastError = error;

			if (attempt < maxAttempts && isTransientError(error)) {
				// Exponential backoff with jitter so simultaneous retries don't stampede the edge.
				const backoff = retryDelayMs * 2 ** (attempt - 1) + Math.random() * retryDelayMs;
				console.warn(
					`Transient failure fetching ${key ?? suburl} (attempt ${attempt}/${maxAttempts}); retrying in ${Math.round(backoff)}ms`
				);
				await wait(backoff);
				continue;
			}

			break;
		}
	}

	console.error(`Failed to fetch ${key ?? suburl}:`, lastError);
	return {
		success: false,
		message: formatApiError(
			lastError,
			'An error occurred while fetching server data. Please try again.'
		),
		// surface the HTTP status so callers can distinguish server/transport (5xx / none)
		// from client (4xx) failures; null (transport) is normalized to undefined
		status: getErrorStatus(lastError) ?? undefined
	};
}

// #endregion

// #region Time on Page Tracking

// pause counted time after this long with no user activity; resume on the next activity event
const TIMER_IDLE_MS = 60_000;
// throttle activity-event handling so high-frequency events (scroll/touchmove) stay cheap
const TIMER_ACTIVITY_THROTTLE_MS = 1_000;

export function useTimeOnPageM(
	field: string,
	metadata: MaybeRefOrGetter<Record<string, any>> = {}
) {
	const authStore = useAuthStore();
	const timeOnPage = ref(0);
	const isTimerRunning = ref(false);
	const timerPending = ref(false);
	const desiredRunning = ref(false);
	const isMounted = ref(false);
	const isViewActive = ref(true);
	const isDocumentVisible = ref(import.meta.client ? document.visibilityState !== 'hidden' : false);
	const isDocumentFocused = ref(
		import.meta.client && typeof document !== 'undefined' && typeof document.hasFocus === 'function'
			? document.hasFocus()
			: false
	);
	const isAppActive = ref(true);
	const isUserActive = ref(true);
	let needsResync = false;
	let appListener: { remove: () => Promise<void> | void } | null = null;
	let pauseListener: { remove: () => Promise<void> | void } | null = null;
	let removeDocumentListeners: (() => void) | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	const resolveMetadata = () => {
		const value = toValue(metadata);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return {};
		}

		return value;
	};

	const recomputeLifecycleState = () => {
		desiredRunning.value =
			isMounted.value &&
			isViewActive.value &&
			isDocumentVisible.value &&
			isDocumentFocused.value &&
			isAppActive.value &&
			isUserActive.value &&
			Boolean(authStore.sessionToken);
	};

	// pause counted time once the user has gone quiet, resume on the next activity event
	const armIdleTimeout = () => {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			isUserActive.value = false;
			recomputeLifecycleState();
			void syncTimer();
		}, TIMER_IDLE_MS);
	};

	let lastActivity = 0;
	const onActivity = () => {
		const now = Date.now();
		if (now - lastActivity < TIMER_ACTIVITY_THROTTLE_MS) return;
		lastActivity = now;

		if (!isUserActive.value) {
			isUserActive.value = true;
			recomputeLifecycleState();
			void syncTimer();
		}
		armIdleTimeout();
	};

	const startTimer = async () => {
		desiredRunning.value = true;
		await syncTimer();
	};

	const stopTimer = async () => {
		desiredRunning.value = false;
		await syncTimer();
	};

	const syncTimer = async () => {
		if (timerPending.value) {
			needsResync = true;
			return;
		}

		if (desiredRunning.value === isTimerRunning.value) {
			return;
		}

		timerPending.value = true;

		try {
			if (desiredRunning.value) {
				const res = await makeMServerRequest<void>(
					null,
					'/api/user/timer',
					authStore.sessionToken,
					{
						method: 'POST',
						body: { action: 'start', field, metadata: resolveMetadata() }
					}
				);

				if (!res.success) {
					console.error('Failed to start timer:', res.message);
					return;
				}

				isTimerRunning.value = true;
			} else {
				const res = await makeMServerRequest<{ durationMs: number }>(
					null,
					'/api/user/timer',
					authStore.sessionToken,
					{
						method: 'POST',
						body: { action: 'stop', field, metadata: resolveMetadata() }
					}
				);

				if (!res.success) {
					console.error('Failed to stop timer:', res.message);
					return;
				}

				isTimerRunning.value = false;
				timeOnPage.value += res.data.durationMs;
			}
		} finally {
			timerPending.value = false;
			if (needsResync) {
				needsResync = false;
				void syncTimer();
			}
		}
	};

	watch(
		() => authStore.sessionToken,
		() => {
			recomputeLifecycleState();
			void syncTimer();
		},
		{ immediate: true }
	);

	onMounted(() => {
		isMounted.value = true;

		if (!import.meta.client || typeof document === 'undefined' || typeof window === 'undefined') {
			recomputeLifecycleState();
			void syncTimer();
			return;
		}

		const handleVisibilityChange = () => {
			isDocumentVisible.value = document.visibilityState !== 'hidden';
			isDocumentFocused.value =
				typeof document.hasFocus === 'function' ? document.hasFocus() : true;
			recomputeLifecycleState();
			void syncTimer();
		};

		const handleFocus = () => {
			isDocumentFocused.value = true;
			isDocumentVisible.value = document.visibilityState !== 'hidden';
			recomputeLifecycleState();
			void syncTimer();
		};

		const handleBlur = () => {
			isDocumentFocused.value = false;
			recomputeLifecycleState();
			void syncTimer();
		};

		const handlePageShow = () => {
			isDocumentVisible.value = true;
			isDocumentFocused.value =
				typeof document.hasFocus === 'function' ? document.hasFocus() : true;
			recomputeLifecycleState();
			void syncTimer();
		};

		const handlePageHide = () => {
			isDocumentVisible.value = false;
			isDocumentFocused.value = false;
			recomputeLifecycleState();
			void syncTimer();
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('focus', handleFocus);
		window.addEventListener('blur', handleBlur);
		window.addEventListener('pageshow', handlePageShow);
		window.addEventListener('pagehide', handlePageHide);

		// idle detection: any of these resumes counted time and re-arms the timeout
		const activityEvents = [
			'touchstart',
			'pointerdown',
			'keydown',
			'scroll',
			'wheel',
			'click'
		] as const;
		for (const evt of activityEvents) {
			document.addEventListener(evt, onActivity, { passive: true });
		}
		armIdleTimeout();

		removeDocumentListeners = () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('pageshow', handlePageShow);
			window.removeEventListener('pagehide', handlePageHide);
			for (const evt of activityEvents) {
				document.removeEventListener(evt, onActivity);
			}
		};

		// Track whether the component unmounted before the listener finished registering, so we
		// can immediately remove a late-arriving handle and avoid a dangling listener.
		let didUnmountBeforeListener = false;

		void App.addListener('appStateChange', ({ isActive }) => {
			isAppActive.value = isActive;
			if (isActive) armIdleTimeout();
			recomputeLifecycleState();
			void syncTimer();
		}).then((listener) => {
			if (didUnmountBeforeListener) {
				void listener.remove();
				return;
			}
			appListener = listener;
		});

		// pause is the explicit native-background backstop for appStateChange; stop here too so a
		// session can't leak while the app is suspended
		void App.addListener('pause', () => {
			isAppActive.value = false;
			recomputeLifecycleState();
			void syncTimer();
		}).then((listener) => {
			if (didUnmountBeforeListener) {
				void listener.remove();
				return;
			}
			pauseListener = listener;
		});

		// Expose the flag to the existing onUnmounted hook via a teardown callback so a late
		// listener resolution still gets cleaned up.
		const previousRemoveDocumentListeners = removeDocumentListeners;
		removeDocumentListeners = () => {
			didUnmountBeforeListener = true;
			previousRemoveDocumentListeners?.();
		};

		recomputeLifecycleState();
		void syncTimer();
	});

	onIonViewDidEnter(() => {
		isViewActive.value = true;
		recomputeLifecycleState();
		void syncTimer();
	});

	onIonViewDidLeave(() => {
		isViewActive.value = false;
		recomputeLifecycleState();
		void syncTimer();
	});

	onUnmounted(() => {
		if (idleTimer) clearTimeout(idleTimer);
		isMounted.value = false;
		isViewActive.value = false;
		isDocumentVisible.value = false;
		isDocumentFocused.value = false;
		isAppActive.value = false;
		isUserActive.value = false;
		desiredRunning.value = false;
		recomputeLifecycleState();
		void syncTimer();
		removeDocumentListeners?.();
		void appListener?.remove();
		void pauseListener?.remove();
	});

	return {
		timeOnPage,
		isTimerRunning,
		startTimer,
		stopTimer
	};
}

// #endregion
