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

export type ServerRequestResult<T> =
	| { success: true; data: T }
	| { success: false; message: string };

export async function makeMServerRequest<T>(
	key: string | null,
	suburl: string,
	token: string | null | undefined = null,
	options: any = {}
): Promise<ServerRequestResult<T>> {
	if (isOfflineRequestBlocked()) {
		return {
			success: false,
			message: 'Offline mode is enabled. Network requests are unavailable.'
		};
	}

	try {
		await maybeDataSaverDelay();

		const baseHeaders: Record<string, string> = {
			Accept: 'application/json',
			'User-Agent': `Earth-App Sky/1.0`
		};

		if (token) {
			baseHeaders['Authorization'] = `Bearer ${token}`;
		}

		if (options.body && (options.method === 'POST' || options.method === 'PATCH')) {
			baseHeaders['Content-Type'] = 'application/json';
		}

		// crustBaseUrl is used so dev environments can point at a local crust instance.
		const config = useRuntimeConfig();
		const baseUrl =
			(config.public.crustBaseUrl as string | undefined) || 'https://app.earth-app.com';

		const { headers: extraHeaders, ...restOptions } = options ?? {};

		const data = await $fetch<T>(`${baseUrl}${suburl}`, {
			...restOptions,
			headers: { ...baseHeaders, ...(extraHeaders as Record<string, string> | undefined) }
		});

		return {
			success: true,
			data
		};
	} catch (error: unknown) {
		console.error(`Failed to fetch ${key ?? suburl}:`, error);
		return {
			success: false,
			message: formatApiError(error, 'An error occurred while fetching server data.')
		};
	}
}

// #endregion

// #region Quest Updates

export async function updateQuestM(
	identifier: string,
	stepResponse: {
		type: string;
		index: number;
		altIndex?: number;
		dataUrl?: string;
		[x: string]: any;
	},
	lat: number | null,
	lng: number | null
): Promise<{ message: string; completed: boolean; validated: boolean }> {
	if (!identifier) {
		return {
			message: `Invalid user identifier '${identifier}'`,
			completed: false,
			validated: false
		};
	}

	const { fetchUserQuest } = useUserStore();
	const authStore = useAuthStore();

	const res = await makeMServerRequest<{
		message: string;
		completed: boolean;
		validated: boolean;
	}>(null, '/api/user/updateQuest', authStore.sessionToken, {
		method: 'POST',
		headers: {
			'X-Latitude': String(lat ?? 0),
			'X-Longitude': String(lng ?? 0)
		},
		body: stepResponse
	});

	if (!res.success) {
		return {
			message: formatApiError(res.message, 'Failed to update quest. Please try again.'),
			completed: false,
			validated: false
		};
	}

	if (res.data.validated) {
		await fetchUserQuest(identifier, true);
	}

	return res.data;
}

// #endregion

// #region Time on Page Tracking

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
	let needsResync = false;
	let appListener: { remove: () => Promise<void> | void } | null = null;
	let removeDocumentListeners: (() => void) | null = null;

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
			Boolean(authStore.sessionToken);
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

		removeDocumentListeners = () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('pageshow', handlePageShow);
			window.removeEventListener('pagehide', handlePageHide);
		};

		// Track whether the component unmounted before the listener finished registering, so we
		// can immediately remove a late-arriving handle and avoid a dangling listener.
		let didUnmountBeforeListener = false;

		void App.addListener('appStateChange', ({ isActive }) => {
			isAppActive.value = isActive;
			recomputeLifecycleState();
			void syncTimer();
		}).then((listener) => {
			if (didUnmountBeforeListener) {
				void listener.remove();
				return;
			}
			appListener = listener;
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
		isMounted.value = false;
		isViewActive.value = false;
		isDocumentVisible.value = false;
		isDocumentFocused.value = false;
		isAppActive.value = false;
		desiredRunning.value = false;
		recomputeLifecycleState();
		void syncTimer();
		removeDocumentListeners?.();
		void appListener?.remove();
	});

	return {
		timeOnPage,
		isTimerRunning,
		startTimer,
		stopTimer
	};
}

// #endregion
