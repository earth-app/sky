<template>
	<IonPage>
		<IonContent
			ref="contentRef"
			:scroll-y="true"
		>
			<div class="flex flex-col items-center mb-8 px-4">
				<IonSearchbar
					v-model="search"
					placeholder="Explore..."
					color="medium"
					class="w-full max-w-2xl my-4"
				/>

				<IonSegment
					v-if="isSearchMode"
					v-model="selectedSegment"
					color="primary"
					class="flex items-center w-full max-w-2xl mb-4 *:flex *:items-center *:min-w-12! *:max-w-1/6 *:text-secondary"
				>
					<IonSegmentButton value="user">
						<UIcon
							name="mdi:account"
							class="size-5"
						/>
					</IonSegmentButton>
					<IonSegmentButton value="activity">
						<UIcon
							name="mdi:run"
							class="size-5"
						/>
					</IonSegmentButton>
					<IonSegmentButton value="article">
						<UIcon
							name="mdi:file-document"
							class="size-5"
						/>
					</IonSegmentButton>
					<IonSegmentButton value="prompt">
						<UIcon
							name="mdi:lightbulb-on"
							class="size-5"
						/>
					</IonSegmentButton>
					<IonSegmentButton value="event">
						<UIcon
							name="mdi:calendar-star"
							class="size-5"
						/>
					</IonSegmentButton>
				</IonSegment>

				<div class="w-full max-w-2xl flex flex-col items-center gap-2">
					<span
						v-if="isSearchMode"
						class="text-sm opacity-70 font-semibold"
						>{{ capitalizeFully(SEGMENT_LABELS[selectedSegment]) }} -
						{{ comma(displayedResults.length) }} Results</span
					>
					<div
						v-for="result in displayedResults"
						:key="`${result.data_type}-${result.id}`"
						class="flex flex-col gap-2"
					>
						<EventMCard
							v-if="result.data_type === 'event'"
							:event="result"
						/>
						<ActivityMCard
							v-else-if="result.data_type === 'activity'"
							:activity="result"
						/>
						<ArticleMCard
							v-else-if="result.data_type === 'article'"
							:article="result"
						/>
						<PromptMCard
							v-else-if="result.data_type === 'prompt'"
							:prompt="result"
						/>
						<UserMCard
							v-else-if="result.data_type === 'user'"
							:user="result"
						/>
					</div>

					<div
						v-if="!isLoading && displayedResults.length === 0"
						class="text-center text-sm opacity-70 py-6"
					>
						{{ emptyStateText }}
					</div>

					<div class="flex justify-center py-4">
						<IonButton
							color="medium"
							fill="clear"
							:disabled="isLoading || !canLoadMore"
							:class="[
								'flex items-center justify-center',
								isLoading || canLoadMore ? 'size-10 p-0.5' : 'min-h-10 px-3'
							]"
							@click="loadMore"
						>
							<div class="flex size-full items-center justify-center">
								<IonSpinner
									v-if="isLoading"
									name="crescent"
									class="min-w-6 min-h-6"
								/>
								<UIcon
									v-else-if="canLoadMore"
									name="mdi:plus-circle-outline"
									class="min-w-6 min-h-6"
								/>
								<span
									v-else
									class="text-sm font-medium"
								>
									No More Content
								</span>
							</div>
						</IonButton>
					</div>
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { type Event } from 'types/event';

const SEARCH_DEBOUNCE_MS = 450;
const SEARCH_LIMIT = 25;
const RANDOM_LIMIT = 25;
const RANDOM_FETCH_BASE = 5;
const LOAD_REQUEST_TIMEOUT_MS = 15000;
const MIN_LOADING_DISPLAY_MS = 180;

type DiscoverResult =
	| (Event & { data_type: 'event' })
	| (Activity & { data_type: 'activity' })
	| (Article & { data_type: 'article' })
	| (Prompt & { data_type: 'prompt' })
	| (User & { data_type: 'user' });

type DiscoverType = DiscoverResult['data_type'];
type SegmentType = 'user' | 'activity' | 'article' | 'prompt' | 'event';

const SEGMENT_LABELS: Record<SegmentType, string> = {
	user: 'users',
	activity: 'activities',
	article: 'articles',
	prompt: 'prompts',
	event: 'events'
};

const search = ref('');
const activeSearch = ref('');
const selectedSegment = ref<SegmentType>('user');
const results = ref<DiscoverResult[]>([]);
const contentRef = ref<any>(null);
const discoverScrollSignal = useState<number>('discover-scroll-signal', () => 0);

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const { fetchRandom: getRandomActivities, fetch: getActivities } = useActivities();
const { fetchRandom: getRandomPrompts, fetch: getPrompts } = usePrompts();
const {
	fetchRecommended: getRecommendedArticles,
	fetchRandom: getRandomArticles,
	fetch: getArticles
} = useArticles();
const {
	fetchRecommended: getRecommendedEvents,
	fetchRandom: getRandomEvents,
	fetch: getEvents
} = useEvents();
const { fetch: getUsers } = useUsers();

const hasMoreActivities = ref(true);
const hasMorePrompts = ref(true);
const hasMoreArticles = ref(true);
const hasMoreEvents = ref(true);
const hasMoreUsers = ref(true);
const isLoading = ref(false);
const loadingGeneration = ref<number | null>(null);
const queryGeneration = ref(0);

const isSearchMode = computed(() => activeSearch.value.length > 0);

const hasMoreForSelectedSegment = computed(() => {
	if (selectedSegment.value === 'user') return hasMoreUsers.value;
	if (selectedSegment.value === 'activity') return hasMoreActivities.value;
	if (selectedSegment.value === 'article') return hasMoreArticles.value;
	if (selectedSegment.value === 'prompt') return hasMorePrompts.value;
	return hasMoreEvents.value;
});

const hasMore = computed(
	() =>
		hasMoreActivities.value ||
		hasMorePrompts.value ||
		hasMoreArticles.value ||
		hasMoreEvents.value ||
		hasMoreUsers.value
);

const canLoadMore = computed(() => {
	if (!hasMore.value) return false;
	if (!isSearchMode.value) return true;
	return hasMoreForSelectedSegment.value;
});

const displayedResults = computed(() => {
	const source = isSearchMode.value
		? [...results.value].sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a))
		: results.value;

	if (!isSearchMode.value) {
		return source;
	}

	return source.filter((result) => result.data_type === selectedSegment.value);
});

const emptyStateText = computed(() => {
	if (!isSearchMode.value) {
		return 'No discover content available right now.';
	}

	return `No ${SEGMENT_LABELS[selectedSegment.value]} found for "${activeSearch.value}".`;
});

const page = ref(1);

watch(search, (nextValue) => {
	if (searchDebounceTimer) {
		clearTimeout(searchDebounceTimer);
	}

	searchDebounceTimer = setTimeout(() => {
		void applySearch(nextValue);
	}, SEARCH_DEBOUNCE_MS);
});

watch(
	discoverScrollSignal,
	async () => {
		await nextTick();
		await scrollToTop(300);
	},
	{ flush: 'post' }
);

onMounted(() => {
	void loadMore();
});

onBeforeUnmount(() => {
	if (searchDebounceTimer) {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = null;
	}

	queryGeneration.value += 1;
});

function resetPaginationState() {
	results.value = [];
	page.value = 1;
	hasMoreActivities.value = true;
	hasMorePrompts.value = true;
	hasMoreArticles.value = true;
	hasMoreEvents.value = true;
	hasMoreUsers.value = true;
}

function getSortTimestamp(result: DiscoverResult): number {
	if (result.data_type === 'event' && typeof result.date === 'number') {
		return result.date;
	}

	const updatedAt = (result as { updated_at?: string }).updated_at;
	if (updatedAt) {
		const updatedAtMs = Date.parse(updatedAt);
		if (!Number.isNaN(updatedAtMs)) {
			return updatedAtMs;
		}
	}

	const createdAt = (result as { created_at?: string }).created_at;
	if (createdAt) {
		const createdAtMs = Date.parse(createdAt);
		if (!Number.isNaN(createdAtMs)) {
			return createdAtMs;
		}
	}

	return 0;
}

function shuffleResults<T>(items: T[]): T[] {
	const shuffled = [...items];

	for (let i = shuffled.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = shuffled[i];
		shuffled[i] = shuffled[j]!;
		shuffled[j] = tmp!;
	}

	return shuffled;
}

function addUniqueResults(items: DiscoverResult[]): number {
	const seen = new Set(results.value.map((result) => `${result.data_type}:${result.id}`));
	let added = 0;

	for (const item of items) {
		const key = `${item.data_type}:${item.id}`;
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		results.value.push(item);
		added += 1;
	}

	return added;
}

async function showLoadError(type: DiscoverType, message: string, generation: number) {
	if (generation !== queryGeneration.value) {
		return;
	}

	const label = SEGMENT_LABELS[type];
	console.error(`Failed to fetch ${label}:`, message);
	await Toast.show({
		text: `Failed to load ${label}: ${message || 'Unknown error'}`,
		duration: 'short'
	});
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	if (typeof error === 'string' && error.trim().length > 0) {
		return error;
	}

	return 'Unknown error';
}

function withRequestTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number = LOAD_REQUEST_TIMEOUT_MS
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error(`Request timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		promise
			.then((value) => {
				clearTimeout(timeoutId);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timeoutId);
				reject(error);
			});
	});
}

async function scrollToTop(durationMs: number = 300) {
	const rawRef = contentRef.value as {
		scrollToTop?: (duration?: number) => Promise<void>;
		getScrollElement?: () => Promise<HTMLElement | null>;
		$el?: {
			scrollToTop?: (duration?: number) => Promise<void>;
			getScrollElement?: () => Promise<HTMLElement | null>;
		};
	} | null;

	const targets = [rawRef, rawRef?.$el].filter(Boolean) as {
		scrollToTop?: (duration?: number) => Promise<void>;
		getScrollElement?: () => Promise<HTMLElement | null>;
	}[];

	for (const target of targets) {
		if (!target.scrollToTop) continue;

		try {
			await target.scrollToTop(durationMs);
			return;
		} catch {
			// fallback to scroll element method below
		}
	}

	for (const target of targets) {
		if (!target.getScrollElement) continue;

		try {
			const scrollElement = await target.getScrollElement();
			if (!scrollElement) continue;

			scrollElement.scrollTo({ top: 0, behavior: durationMs > 0 ? 'smooth' : 'auto' });
			if (durationMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, durationMs));
			}
			return;
		} catch {
			// try next target shape
		}
	}

	const hostElement =
		rawRef && typeof rawRef === 'object' && '$el' in rawRef
			? (rawRef.$el as HTMLElement | undefined)
			: (rawRef as HTMLElement | null);

	const shadowScrollElement = hostElement?.shadowRoot?.querySelector<HTMLElement>(
		'.inner-scroll, .scroll-y, main'
	);

	if (shadowScrollElement) {
		shadowScrollElement.scrollTo({ top: 0, behavior: durationMs > 0 ? 'smooth' : 'auto' });
		if (durationMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, durationMs));
		}
		return;
	}

	window.scrollTo({ top: 0, behavior: durationMs > 0 ? 'smooth' : 'auto' });
}

function toDiscoverItems<T extends { id: string }, K extends DiscoverType>(
	items: T[],
	type: K
): (T & { data_type: K })[] {
	return items.map((item) => ({ ...item, data_type: type as K }));
}

function extractItemsFromResponse<T>(res: { success: boolean; data?: unknown }): {
	items: T[];
	total: number | null;
} {
	if (!res.success || !res.data) {
		return { items: [], total: null };
	}

	if (Array.isArray(res.data)) {
		return { items: res.data as T[], total: null };
	}

	if (typeof res.data === 'object' && res.data !== null && 'items' in res.data) {
		const paginated = res.data as { items?: unknown; total?: unknown };

		if (Array.isArray(paginated.items)) {
			return {
				items: paginated.items as T[],
				total: typeof paginated.total === 'number' ? paginated.total : null
			};
		}
	}

	return { items: [], total: null };
}

async function applySearch(rawSearch: string) {
	const nextSearch = rawSearch.trim();
	if (nextSearch === activeSearch.value) {
		return;
	}

	queryGeneration.value += 1;
	loadingGeneration.value = null;
	isLoading.value = false;
	activeSearch.value = nextSearch;
	selectedSegment.value = 'user';
	resetPaginationState();

	await loadMore();
}

async function loadSearchResults(generation: number) {
	const currentPage = page.value;
	const currentSearch = activeSearch.value;

	const [activitiesResult, promptsResult, articlesResult, eventsResult, usersResult] =
		await Promise.allSettled([
			withRequestTimeout(getActivities(currentPage, SEARCH_LIMIT, currentSearch)),
			withRequestTimeout(getPrompts(currentPage, SEARCH_LIMIT, currentSearch)),
			withRequestTimeout(getArticles(currentPage, SEARCH_LIMIT, currentSearch)),
			withRequestTimeout(getEvents(currentPage, SEARCH_LIMIT, currentSearch)),
			withRequestTimeout(getUsers(currentPage, SEARCH_LIMIT, currentSearch))
		]);

	if (generation !== queryGeneration.value) {
		return;
	}

	const nextBatch: DiscoverResult[] = [];

	if (activitiesResult.status === 'fulfilled') {
		const activityData = extractItemsFromResponse<Activity>(activitiesResult.value);
		nextBatch.push(...toDiscoverItems(activityData.items, 'activity'));

		if (activityData.total !== null) {
			hasMoreActivities.value = activityData.total > currentPage * SEARCH_LIMIT;
		} else {
			hasMoreActivities.value = activityData.items.length === SEARCH_LIMIT;
		}

		if (!activitiesResult.value.success) {
			hasMoreActivities.value = false;
			await showLoadError(
				'activity',
				activitiesResult.value.message || 'Unknown error',
				generation
			);
		}
	} else {
		hasMoreActivities.value = false;
		await showLoadError('activity', getErrorMessage(activitiesResult.reason), generation);
	}

	if (promptsResult.status === 'fulfilled') {
		const promptData = extractItemsFromResponse<Prompt>(promptsResult.value);
		nextBatch.push(...toDiscoverItems(promptData.items, 'prompt'));

		if (promptData.total !== null) {
			hasMorePrompts.value = promptData.total > currentPage * SEARCH_LIMIT;
		} else {
			hasMorePrompts.value = promptData.items.length === SEARCH_LIMIT;
		}

		if (!promptsResult.value.success) {
			hasMorePrompts.value = false;
			await showLoadError('prompt', promptsResult.value.message || 'Unknown error', generation);
		}
	} else {
		hasMorePrompts.value = false;
		await showLoadError('prompt', getErrorMessage(promptsResult.reason), generation);
	}

	if (articlesResult.status === 'fulfilled') {
		const articleData = extractItemsFromResponse<Article>(articlesResult.value);
		nextBatch.push(...toDiscoverItems(articleData.items, 'article'));

		if (articleData.total !== null) {
			hasMoreArticles.value = articleData.total > currentPage * SEARCH_LIMIT;
		} else {
			hasMoreArticles.value = articleData.items.length === SEARCH_LIMIT;
		}

		if (!articlesResult.value.success) {
			hasMoreArticles.value = false;
			await showLoadError('article', articlesResult.value.message || 'Unknown error', generation);
		}
	} else {
		hasMoreArticles.value = false;
		await showLoadError('article', getErrorMessage(articlesResult.reason), generation);
	}

	if (eventsResult.status === 'fulfilled') {
		const eventItems = Array.isArray(eventsResult.value.items) ? eventsResult.value.items : [];
		nextBatch.push(...toDiscoverItems(eventItems, 'event'));
		hasMoreEvents.value = eventsResult.value.total > currentPage * SEARCH_LIMIT;
	} else {
		hasMoreEvents.value = false;
		await showLoadError('event', getErrorMessage(eventsResult.reason), generation);
	}

	if (usersResult.status === 'fulfilled') {
		const userData = extractItemsFromResponse<User>(usersResult.value);
		nextBatch.push(...toDiscoverItems(userData.items, 'user'));

		if (userData.total !== null) {
			hasMoreUsers.value = userData.total > currentPage * SEARCH_LIMIT;
		} else {
			hasMoreUsers.value = userData.items.length === SEARCH_LIMIT;
		}

		if (!usersResult.value.success) {
			hasMoreUsers.value = false;
			await showLoadError('user', usersResult.value.message || 'Unknown error', generation);
		}
	} else {
		hasMoreUsers.value = false;
		await showLoadError('user', getErrorMessage(usersResult.reason), generation);
	}

	const addedCount = addUniqueResults(nextBatch);
	if (addedCount === 0 && nextBatch.length > 0) {
		results.value.push(...nextBatch);
	}

	if (addedCount > 0 || nextBatch.length > 0 || hasMore.value) {
		page.value = currentPage + 1;
	}
}

async function fetchRecommendedArticlesOrRandom(
	count: number
): Promise<{ items: Article[]; error: string | null }> {
	try {
		const recommended = await getRecommendedArticles(count);
		if (recommended.success && recommended.data && Array.isArray(recommended.data)) {
			return { items: recommended.data, error: null };
		}

		const random = await getRandomArticles(count);
		if (random.success && random.data && Array.isArray(random.data)) {
			return { items: random.data, error: null };
		}

		return {
			items: [],
			error: recommended.message || random.message || 'Unknown error'
		};
	} catch (error) {
		return {
			items: [],
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

async function fetchRecommendedEventsOrRandom(
	count: number
): Promise<{ items: Event[]; error: string | null }> {
	try {
		const recommended = await getRecommendedEvents(count);
		if (recommended.success && recommended.data && Array.isArray(recommended.data)) {
			return { items: recommended.data, error: null };
		}

		const random = await getRandomEvents(count);
		if (random.success && random.data && Array.isArray(random.data)) {
			return { items: random.data, error: null };
		}

		return {
			items: [],
			error: recommended.message || random.message || 'Unknown error'
		};
	} catch (error) {
		return {
			items: [],
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

async function loadRandomResults(generation: number) {
	const currentPage = page.value;
	const randomCount = RANDOM_FETCH_BASE + ((currentPage - 1) % 3);

	const [activitiesResult, promptsResult, articlesResult, eventsResult, usersResult] =
		await Promise.allSettled([
			withRequestTimeout(getRandomActivities(randomCount)),
			withRequestTimeout(getRandomPrompts(randomCount)),
			withRequestTimeout(fetchRecommendedArticlesOrRandom(randomCount)),
			withRequestTimeout(fetchRecommendedEventsOrRandom(randomCount)),
			withRequestTimeout(getUsers(currentPage, randomCount, '', 'rand'))
		]);

	if (generation !== queryGeneration.value) {
		return;
	}

	const randomPool: DiscoverResult[] = [];

	if (activitiesResult.status === 'fulfilled') {
		const activityData = extractItemsFromResponse<Activity>(activitiesResult.value);
		randomPool.push(...toDiscoverItems(activityData.items, 'activity'));
		hasMoreActivities.value = activityData.items.length > 0;

		if (!activitiesResult.value.success) {
			hasMoreActivities.value = false;
			await showLoadError(
				'activity',
				activitiesResult.value.message || 'Unknown error',
				generation
			);
		}
	} else {
		hasMoreActivities.value = false;
		await showLoadError('activity', getErrorMessage(activitiesResult.reason), generation);
	}

	if (promptsResult.status === 'fulfilled') {
		const promptData = extractItemsFromResponse<Prompt>(promptsResult.value);
		randomPool.push(...toDiscoverItems(promptData.items, 'prompt'));
		hasMorePrompts.value = promptData.items.length > 0;

		if (!promptsResult.value.success) {
			hasMorePrompts.value = false;
			await showLoadError('prompt', promptsResult.value.message || 'Unknown error', generation);
		}
	} else {
		hasMorePrompts.value = false;
		await showLoadError('prompt', getErrorMessage(promptsResult.reason), generation);
	}

	if (articlesResult.status === 'fulfilled') {
		randomPool.push(...toDiscoverItems(articlesResult.value.items, 'article'));
		hasMoreArticles.value = articlesResult.value.items.length > 0;

		if (articlesResult.value.error) {
			hasMoreArticles.value = false;
			await showLoadError('article', articlesResult.value.error, generation);
		}
	} else {
		hasMoreArticles.value = false;
		await showLoadError('article', getErrorMessage(articlesResult.reason), generation);
	}

	if (eventsResult.status === 'fulfilled') {
		randomPool.push(...toDiscoverItems(eventsResult.value.items, 'event'));
		hasMoreEvents.value = eventsResult.value.items.length > 0;

		if (eventsResult.value.error) {
			hasMoreEvents.value = false;
			await showLoadError('event', eventsResult.value.error, generation);
		}
	} else {
		hasMoreEvents.value = false;
		await showLoadError('event', getErrorMessage(eventsResult.reason), generation);
	}

	if (usersResult.status === 'fulfilled') {
		const userData = extractItemsFromResponse<User>(usersResult.value);
		randomPool.push(...toDiscoverItems(userData.items, 'user'));
		hasMoreUsers.value = userData.items.length > 0;

		if (!usersResult.value.success) {
			hasMoreUsers.value = false;
			await showLoadError('user', usersResult.value.message || 'Unknown error', generation);
		}
	} else {
		hasMoreUsers.value = false;
		await showLoadError('user', getErrorMessage(usersResult.reason), generation);
	}

	const limitedBatch = shuffleResults(randomPool).slice(0, RANDOM_LIMIT);
	const addedCount = addUniqueResults(limitedBatch);
	if (addedCount === 0 && limitedBatch.length > 0) {
		results.value.push(...limitedBatch);
	}

	if (addedCount > 0 || limitedBatch.length > 0 || hasMore.value) {
		page.value = currentPage + 1;
	}
}

async function loadMore() {
	if (isLoading.value && loadingGeneration.value === queryGeneration.value) {
		return;
	}

	if (!canLoadMore.value) {
		return;
	}

	const generation = queryGeneration.value;
	const startedAt = Date.now();
	isLoading.value = true;
	loadingGeneration.value = generation;

	try {
		await nextTick();

		if (generation !== queryGeneration.value) {
			return;
		}

		if (isSearchMode.value) {
			await loadSearchResults(generation);
		} else {
			await loadRandomResults(generation);
		}
	} catch (error) {
		if (generation === queryGeneration.value) {
			console.error('Failed to load discover content:', error);
			await Toast.show({
				text: 'Failed to load discover content',
				duration: 'short'
			});
		}
	} finally {
		if (loadingGeneration.value === generation) {
			const elapsed = Date.now() - startedAt;
			if (elapsed < MIN_LOADING_DISPLAY_MS) {
				await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DISPLAY_MS - elapsed));
			}

			loadingGeneration.value = null;
			isLoading.value = false;
		}
	}
}
</script>
