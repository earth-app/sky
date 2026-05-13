import { App } from '@capacitor/app';
import { onIonViewDidEnter, onIonViewDidLeave } from '@ionic/vue';
import type { Article } from 'types/article';
import type { Event, EventAutocompleteSuggestion } from 'types/event';
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

export async function makeMServerRequest<T>(
	key: string | null,
	suburl: string,
	token: string | null | undefined = null,
	options: any = {}
) {
	if (isOfflineRequestBlocked()) {
		return {
			success: false,
			message: 'Offline mode is enabled. Network requests are unavailable.'
		};
	}

	try {
		await maybeDataSaverDelay();

		const headers: Record<string, string> = {
			Accept: 'application/json',
			'User-Agent': `Earth-App Sky/1.0`
		};

		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		if (options.body && (options.method === 'POST' || options.method === 'PATCH')) {
			headers['Content-Type'] = 'application/json';
		}

		const data = await $fetch<T>(`https://app.earth-app.com${suburl}`, {
			headers,
			...options
		});

		return {
			success: true,
			data
		};
	} catch (error: any) {
		console.error(`Failed to fetch ${key}:`, error);
		return {
			success: false,
			message: error.message || 'An error occurred while fetching server data.'
		};
	}
}

// #endregion

// #region User Journeys

export async function getCurrentJourneyM(identifier: string, id: string) {
	if (!id) return { success: true, data: { count: 0 } };

	return await makeMServerRequest<{ count: number; lastWrite?: number }>(
		`journey-${identifier}`,
		`/api/user/journey?type=${identifier}&id=${id}`,
		useCurrentSessionToken()
	);
}

export async function tapCurrentJourneyM(identifier: string, activity?: string) {
	return await makeMServerRequest<{ count: number }>(
		null,
		`/api/user/journey?type=${identifier}${activity ? `&activity=${activity}` : ''}`,
		useCurrentSessionToken(),
		{
			method: 'POST'
		}
	);
}

export async function clearCurrentJourneyM(identifier: string) {
	return await makeMServerRequest<void>(
		null,
		`/api/user/journey/clear?type=${identifier}`,
		useCurrentSessionToken(),
		{
			method: 'POST'
		}
	);
}

// #endregion

// #region Articles

export async function getSimilarArticlesM(article: Article, count: number = 5) {
	const effectiveCount = isDataSaverConstrained() ? Math.max(2, count - 2) : count;
	const { fetchRandom } = useArticles();
	const pool = await fetchRandom(Math.min(effectiveCount * 3, 15)).then((res) =>
		res.success ? res.data : res.message
	);

	if (!pool || typeof pool === 'string') {
		throw new Error(`Failed to fetch random articles: ${pool}`);
	}

	if ('message' in pool) {
		throw new Error(`Failed to fetch random articles: ${pool.code} ${pool.message}`);
	}

	if (!pool || pool.length === 0) {
		return { success: true, data: [] };
	}

	const res = await makeMServerRequest<Article[]>(
		`article-${article.id}-similar_articles`,
		`/api/article/similar`,
		useCurrentSessionToken(),
		{
			method: 'POST',
			body: { article, count: effectiveCount, pool }
		}
	);

	if (res.success && res.data) {
		if ('message' in res.data) {
			return res;
		}

		// load similar articles into state
		for (const similarArticle of res.data) {
			useState<Article | null>(`article-${similarArticle.id}`, () => similarArticle);
		}
	}

	return res;
}

export async function submitMArticleQuiz(
	article: Article,
	quiz: ArticleQuizQuestion[],
	answers: number[]
) {
	if (!article) return;
	if (!quiz || quiz.length === 0) return;

	if (answers.length !== quiz.length) {
		throw new Error(
			`Number of answers (${answers.length}) does not match number of questions (${quiz.length})`
		);
	}

	const authStore = useAuthStore();
	const articleStore = useArticleStore();
	const answers0 = answers.map((a, i) => ({
		question: quiz[i]!.question,
		text: quiz[i]!.options[a]!,
		index: a
	}));

	const articleTypes = article.tags.map((t) => t.toUpperCase().replace(/\s+/g, '_'));

	try {
		const res = await makeMServerRequest<ArticleQuizScoreResult>(
			`article-${article.id}-quiz-submit`,
			`/api/article/quiz`,
			authStore.sessionToken,
			{
				method: 'POST',
				body: { answers: answers0, articleId: article.id, articleTypes }
			}
		);

		if (res.success && res.data) {
			if ('message' in res.data) {
				return res;
			}

			articleStore.setQuizScore(article.id, res.data);
		}

		return res;
	} catch (error) {
		console.error('Error submitting quiz:', error);
		throw error;
	}
}

// #endregion

// #region Events

export async function getSimilarEventsM(event: Event, count: number = 5) {
	const effectiveCount = isDataSaverConstrained() ? Math.max(2, count - 2) : count;
	const { fetchRandom } = useEvents();
	const pool = await fetchRandom(Math.min(effectiveCount * 3, 15)).then((res) =>
		res.success ? res.data : res.message
	);

	if (!pool || typeof pool === 'string') {
		throw new Error(`Failed to fetch random events: ${pool}`);
	}

	if ('message' in pool) {
		throw new Error(`Failed to fetch random events: ${pool.code} ${pool.message}`);
	}

	if (!pool || pool.length === 0) {
		return { success: true, data: [] };
	}

	const res = await makeMServerRequest<Event[]>(
		`event-${event.id}-similar_events`,
		`/api/event/similar`,
		useCurrentSessionToken(),
		{
			method: 'POST',
			body: { event, count: effectiveCount, pool }
		}
	);

	if (res.success && res.data) {
		if ('message' in res.data) {
			return res;
		}

		// load similar events into state
		for (const similarEvent of res.data) {
			useState<Event | null>(`event-${similarEvent.id}`, () => similarEvent);
		}
	}

	return res;
}

export function useEventThumbnailM(id: string) {
	const { event } = useEvent(id);
	const thumbnail = useState<string | null>(`event-thumbnail-${id}`, () => null);

	const fetchThumbnail = async () => {
		const res = await makeMServerRequest<Blob>(
			`event-thumbnail-${id}`,
			`/api/event/thumbnail?id=${encodeURIComponent(id)}`,
			useCurrentSessionToken()
		);

		if (res.success && res.data) {
			const url = URL.createObjectURL(res.data);
			thumbnail.value = url;
		} else {
			thumbnail.value = null;
		}

		return res;
	};

	if (!thumbnail.value) {
		fetchThumbnail();
	}

	const thumbnailAuthor = useState<string | null>(`event-thumbnail-author-${id}`, () => null);
	const thumbnailSize = useState<number | null>(`event-thumbnail-size-${id}`, () => null);

	const fetchThumbnailMetadata = async () => {
		const res = await makeMServerRequest<{ author: string; size: number }>(
			`event-thumbnail-metadata-${id}`,
			`/api/event/thumbnail?id=${encodeURIComponent(id)}&metadata=true`,
			useCurrentSessionToken()
		);

		if (res.success && res.data) {
			const author =
				res.data.author === '<user>' ? event.value?.host.full_name || 'Host' : res.data.author;
			thumbnailAuthor.value = author;

			thumbnailSize.value = res.data.size;
		} else {
			thumbnailAuthor.value = null;
			thumbnailSize.value = null;
		}

		return res;
	};

	if (!thumbnailAuthor.value || !thumbnailSize.value) {
		fetchThumbnailMetadata();
	}

	const uploadThumbnail = async (file: File) => {
		const formData = new FormData();
		formData.append('photo', file);

		const res = await makeMServerRequest(
			`event-thumbnail-upload-${id}`,
			`/api/event/thumbnail?id=${encodeURIComponent(id)}`,
			useCurrentSessionToken(),
			{
				method: 'POST',
				body: formData
			}
		);

		if (res.success) {
			await fetchThumbnail();
		}

		return res;
	};

	const deleteThumbnail = async () => {
		const res = await makeMServerRequest(
			`event-thumbnail-delete-${id}`,
			`/api/event/thumbnail?id=${encodeURIComponent(id)}`,
			useCurrentSessionToken(),
			{
				method: 'DELETE'
			}
		);

		if (res.success) {
			if (thumbnail.value) {
				URL.revokeObjectURL(thumbnail.value);
				thumbnail.value = null;
			}
		}

		return res;
	};

	const unloadThumbnail = () => {
		if (thumbnail.value) {
			URL.revokeObjectURL(thumbnail.value);
			thumbnail.value = null;
		}
	};

	return {
		thumbnail,
		thumbnailAuthor,
		thumbnailSize,
		fetchThumbnail,
		fetchThumbnailMetadata,
		uploadThumbnail,
		deleteThumbnail,
		unloadThumbnail
	};
}

// #region Geocoding

export function useGeocodingM() {
	const latitude = useState<number | null>('user-latitude', () => null);
	const longitude = useState<number | null>('user-longitude', () => null);

	const retrieveLocation = () => {
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					latitude.value = position.coords.latitude;
					longitude.value = position.coords.longitude;
				},
				(error) => {
					console.error('Error retrieving location:', error);
				}
			);
		}
	};

	if (latitude.value === null || longitude.value === null) {
		retrieveLocation();
	}

	const autocomplete = async (input: string, sessionToken: string) => {
		const res = await makeMServerRequest<EventAutocompleteSuggestion[]>(
			`event-autocomplete-${input}-${latitude.value ?? 'null'}-${longitude.value ?? 'null'}`,
			`/api/event/autocomplete?input=${encodeURIComponent(
				input
			)}&sessionToken=${encodeURIComponent(sessionToken)}${
				latitude.value !== null && longitude.value !== null
					? `&latitude=${latitude.value}&longitude=${longitude.value}`
					: ''
			}`,
			useCurrentSessionToken()
		);

		if (res.success && res.data) {
			if ('message' in res.data) {
				return res;
			}

			return res;
		}

		return { success: false, message: 'Failed to fetch autocomplete suggestions.' };
	};

	const geocode = async (address: string) => {
		const res = await makeMServerRequest<{ latitude: number; longitude: number }>(
			`event-geocode-${address}`,
			`/api/event/geocode?address=${encodeURIComponent(address)}`,
			useCurrentSessionToken()
		);

		if (res.success && res.data) {
			if ('message' in res.data) {
				return res;
			}

			return res;
		}

		return { success: false, message: 'Failed to geocode address.' };
	};

	const reverseGeocode = async (lat: number, lng: number) => {
		const res = await makeMServerRequest<{ address: string }>(
			`event-reverse-geocode-${lat}-${lng}`,
			`/api/event/geocode?lat=${lat}&lng=${lng}`,
			useCurrentSessionToken()
		);

		if (res.success && res.data) {
			if ('message' in res.data) {
				return res;
			}

			return res;
		}

		return { success: false, message: 'Failed to reverse geocode coordinates.' };
	};

	return {
		latitude,
		longitude,
		retrieveLocation,
		autocomplete,
		geocode,
		reverseGeocode
	};
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
			Authorization: `Bearer ${authStore.sessionToken}`,
			'X-Latitude': String(lat ?? 0),
			'X-Longitude': String(lng ?? 0)
		},
		body: stepResponse
	});

	if (!res.success || !res.data) {
		return {
			message: res.data?.message || res.message || 'Failed to update quest',
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

				if (!res.success || !res.data) {
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

		void App.addListener('appStateChange', ({ isActive }) => {
			isAppActive.value = isActive;
			recomputeLifecycleState();
			void syncTimer();
		}).then((listener) => {
			appListener = listener;
		});

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
