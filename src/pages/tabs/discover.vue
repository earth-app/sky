<template>
	<IonPage>
		<IonHeader class="bg-black/10 dark:bg-gray-900/20">
			<div class="flex items-center w-full">
				<IonSearchbar
					id="discover-search"
					v-model="search"
					placeholder="Explore..."
					:color="theme"
					class="flex-1 max-w-2xl mt-12 border-b-2 border-black/15 dark:border-white/30"
				/>
				<IonButton
					id="discover-help"
					fill="outline"
					size="small"
					color="secondary"
					class="mt-12 mr-2"
					aria-label="Help"
					@click="startTour('discover-index')"
				>
					<UIcon
						name="mdi:progress-question"
						class="size-5"
					/>
				</IonButton>
			</div>
		</IonHeader>
		<IonContent
			ref="contentRef"
			:scroll-y="true"
		>
			<IonRefresher
				slot="fixed"
				@ionRefresh="onRefresh"
			>
				<IonRefresherContent />
			</IonRefresher>
			<div class="flex flex-col items-center my-8 px-4">
				<IonSegment
					v-if="showSegmentSelector"
					id="discover-segments"
					v-model="selectedSegment"
					color="primary"
					class="flex items-center py-1 w-full max-w-2xl mb-4 *:flex *:items-center *:min-w-12! *:max-w-1/6 *:text-secondary"
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

				<div
					id="discover-results"
					class="w-full max-w-2xl flex flex-col items-center gap-2"
				>
					<!-- standalone word-of-the-day above the results stream (not in rotation pool) -->
					<div class="w-full px-2">
						<LazyWidgetsMWordOfTheDay hydrate-on-visible />
					</div>

					<span
						v-if="showResultsSummary"
						class="text-sm opacity-70 font-semibold"
						>{{ capitalizeFully(SEGMENT_LABELS[activeSegment]) }} -
						{{ comma(displayedResults.length) }} Results</span
					>
					<div
						v-if="displayedResults.length === 0 && isLoading"
						class="flex flex-col gap-3 w-full px-2 py-4"
					>
						<MSkeleton
							v-for="n in 4"
							:key="`discover-skeleton-${n}`"
							:height="120"
							width="100%"
						/>
					</div>
					<template
						v-for="(result, index) in displayedResults"
						:key="`${result.data_type}-${result.id}`"
					>
						<div class="flex flex-col gap-2 w-full">
							<LazyEventMCard
								v-if="result.data_type === 'event'"
								:event="result"
								hydrate-on-visible
							/>
							<LazyActivityMCard
								v-else-if="result.data_type === 'activity'"
								:activity="result"
								hydrate-on-visible
							/>
							<LazyArticleMCard
								v-else-if="result.data_type === 'article'"
								:article="result"
								hydrate-on-visible
							/>
							<LazyPromptMCard
								v-else-if="result.data_type === 'prompt'"
								:prompt="result"
								hydrate-on-visible
							/>
							<LazyUserMCard
								v-else-if="result.data_type === 'user'"
								:user="result"
								hydrate-on-visible
								class="text-center text-sm opacity-70 py-6"
							/>
						</div>
						<!-- interleave a rotation widget mid-stream; uses crust's deterministic per-day picker -->
						<LazyMWidgetSlot
							v-if="widgetForIndex(index)"
							:kind="widgetForIndex(index)!"
							topic="discover"
							class="w-full"
							hydrate-on-visible
						/>
					</template>

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

			<ClientOnly>
				<MSiteTour
					:steps="discoverTour"
					name="Discover Tour"
					tour-id="discover-index"
				/>
			</ClientOnly>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { type Event } from 'types/event';
import { capitalizeFully, comma } from 'utils';
import { theme } from '~/composables/useSettings';

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

const route = useRoute();

const search = ref('');
const activeSearch = ref('');
const selectedSegment = ref<SegmentType>('user');
const results = ref<DiscoverResult[]>([]);
const contentRef = ref<any>(null);
const discoverScrollSignal = useState<number>('discover-scroll-signal', () => 0);

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const { widgetForIndex } = useFeedWidgets();
const { fetchRandom: getRandomActivities, fetch: getActivities } = useActivities();
const { fetchRandom: getRandomPrompts, fetch: getPrompts } = usePrompts();
const {
	fetchRecommended: getRecommendedArticles,
	fetchRandom: getRandomArticles,
	fetch: getArticles
} = useArticles(1, 25, '', 'desc', makeMServerRequest);
const {
	fetchRecommended: getRecommendedEvents,
	fetchRandom: getRandomEvents,
	fetch: getEvents
} = useEvents(makeMServerRequest);
const { fetch: getUsers } = useUsers();

const hasMoreActivities = ref(true);
const hasMorePrompts = ref(true);
const hasMoreArticles = ref(true);
const hasMoreEvents = ref(true);
const hasMoreUsers = ref(true);
const isLoading = ref(false);
const loadingGeneration = ref<number | null>(null);
const queryGeneration = ref(0);

function normalizeRouteQuery(value: unknown): string | null {
	if (Array.isArray(value)) {
		const first = value[0];
		return typeof first === 'string' ? first : null;
	}

	return typeof value === 'string' ? value : null;
}

function parseRouteSegment(value: unknown): SegmentType | null {
	const normalized = normalizeRouteQuery(value)?.toLowerCase();
	if (!normalized) return null;

	if (normalized === 'user') return 'user';
	if (normalized === 'activity') return 'activity';
	if (normalized === 'article') return 'article';
	if (normalized === 'prompt') return 'prompt';
	if (normalized === 'event') return 'event';
	return null;
}

const isSearchMode = computed(() => activeSearch.value.length > 0);
const routeSegment = computed<SegmentType | null>(() => {
	const tabSegment = parseRouteSegment(route.query.tab);
	if (tabSegment) return tabSegment;

	// Backward compatibility with older tour query usage.
	return parseRouteSegment(route.query.tour);
});
const isSegmentPinnedByRoute = computed(() => routeSegment.value !== null);
const showSegmentSelector = computed(() => isSearchMode.value || isSegmentPinnedByRoute.value);
const showResultsSummary = computed(() => isSearchMode.value || isSegmentPinnedByRoute.value);
const activeSegment = computed<SegmentType>(() => routeSegment.value ?? selectedSegment.value);

const hasMoreForSelectedSegment = computed(() => {
	if (activeSegment.value === 'user') return hasMoreUsers.value;
	if (activeSegment.value === 'activity') return hasMoreActivities.value;
	if (activeSegment.value === 'article') return hasMoreArticles.value;
	if (activeSegment.value === 'prompt') return hasMorePrompts.value;
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
	if (!isSearchMode.value && !isSegmentPinnedByRoute.value) return true;
	return hasMoreForSelectedSegment.value;
});

const displayedResults = computed(() => {
	const source = isSearchMode.value
		? [...results.value].sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a))
		: results.value;

	if (!isSearchMode.value && !isSegmentPinnedByRoute.value) {
		return source;
	}

	return source.filter((result) => result.data_type === activeSegment.value);
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
	routeSegment,
	async (segment, previousSegment) => {
		if (!segment) {
			return;
		}

		selectedSegment.value = segment;

		if (segment !== previousSegment) {
			await nextTick();
			await scrollToTop(200);

			if (!isLoading.value && displayedResults.value.length === 0 && canLoadMore.value) {
				void loadMore();
			}
		}
	},
	{ immediate: true }
);

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
	selectedSegment.value = routeSegment.value ?? 'user';
	resetPaginationState();

	await loadMore();
}

async function onRefresh(event: CustomEvent) {
	queryGeneration.value += 1;
	loadingGeneration.value = null;
	isLoading.value = false;
	resetPaginationState();
	try {
		await loadMore();
	} finally {
		(event.target as HTMLIonRefresherElement | null)?.complete();
	}
}

async function loadSearchResults(generation: number) {
	const currentPage = page.value;
	const currentSearch = activeSearch.value;

	let anyReceived = false;

	const streamBatch = (items: DiscoverResult[]) => {
		if (generation !== queryGeneration.value || items.length === 0) return;
		anyReceived = true;
		addUniqueResults(items);
	};

	await Promise.allSettled([
		withRequestTimeout(getActivities(currentPage, SEARCH_LIMIT, currentSearch))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				const data = extractItemsFromResponse<Activity>(res);
				hasMoreActivities.value =
					data.total !== null
						? data.total > currentPage * SEARCH_LIMIT
						: data.items.length === SEARCH_LIMIT;
				if (!res.success) {
					hasMoreActivities.value = false;
					await showLoadError('activity', res.message || 'Unknown error', generation);
				}
				streamBatch(toDiscoverItems(data.items, 'activity'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreActivities.value = false;
				await showLoadError('activity', getErrorMessage(err), generation);
			}),
		withRequestTimeout(getPrompts(currentPage, SEARCH_LIMIT, currentSearch))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				const data = extractItemsFromResponse<Prompt>(res);
				hasMorePrompts.value =
					data.total !== null
						? data.total > currentPage * SEARCH_LIMIT
						: data.items.length === SEARCH_LIMIT;
				if (!res.success) {
					hasMorePrompts.value = false;
					await showLoadError('prompt', res.message || 'Unknown error', generation);
				}
				streamBatch(toDiscoverItems(data.items, 'prompt'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMorePrompts.value = false;
				await showLoadError('prompt', getErrorMessage(err), generation);
			}),
		withRequestTimeout(getArticles(currentPage, SEARCH_LIMIT, currentSearch))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				const data = extractItemsFromResponse<Article>(res);
				hasMoreArticles.value =
					data.total !== null
						? data.total > currentPage * SEARCH_LIMIT
						: data.items.length === SEARCH_LIMIT;
				if (!res.success) {
					hasMoreArticles.value = false;
					await showLoadError('article', res.message || 'Unknown error', generation);
				}
				streamBatch(toDiscoverItems(data.items, 'article'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreArticles.value = false;
				await showLoadError('article', getErrorMessage(err), generation);
			}),
		withRequestTimeout(getEvents(currentPage, SEARCH_LIMIT, currentSearch))
			.then((res) => {
				if (generation !== queryGeneration.value) return;
				const items = Array.isArray(res.items) ? res.items : [];
				hasMoreEvents.value = res.total > currentPage * SEARCH_LIMIT;
				streamBatch(toDiscoverItems(items, 'event'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreEvents.value = false;
				await showLoadError('event', getErrorMessage(err), generation);
			}),
		withRequestTimeout(getUsers(currentPage, SEARCH_LIMIT, currentSearch))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				const data = extractItemsFromResponse<User>(res);
				hasMoreUsers.value =
					data.total !== null
						? data.total > currentPage * SEARCH_LIMIT
						: data.items.length === SEARCH_LIMIT;
				if (!res.success) {
					hasMoreUsers.value = false;
					await showLoadError('user', res.message || 'Unknown error', generation);
				}
				streamBatch(toDiscoverItems(data.items, 'user'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreUsers.value = false;
				await showLoadError('user', getErrorMessage(err), generation);
			})
	]);

	if (generation !== queryGeneration.value) return;

	if (anyReceived || hasMore.value) {
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

	let anyReceived = false;
	let addedSoFar = 0;

	const streamBatch = (items: DiscoverResult[]) => {
		if (generation !== queryGeneration.value || items.length === 0) return;
		anyReceived = true;

		const remaining = Math.max(0, RANDOM_LIMIT - addedSoFar);
		if (remaining === 0) return;

		const shuffled = shuffleResults(items).slice(0, remaining);
		const added = addUniqueResults(shuffled);
		addedSoFar += added;
	};

	await Promise.allSettled([
		withRequestTimeout(getRandomActivities(randomCount))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				const data = extractItemsFromResponse<Activity>(res);
				hasMoreActivities.value = data.items.length > 0;
				if (!res.success) {
					hasMoreActivities.value = false;
					await showLoadError('activity', res.message || 'Unknown error', generation);
				}
				streamBatch(toDiscoverItems(data.items, 'activity'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreActivities.value = false;
				await showLoadError('activity', getErrorMessage(err), generation);
			}),
		withRequestTimeout(getRandomPrompts(randomCount))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				const data = extractItemsFromResponse<Prompt>(res);
				hasMorePrompts.value = data.items.length > 0;
				if (!res.success) {
					hasMorePrompts.value = false;
					await showLoadError('prompt', res.message || 'Unknown error', generation);
				}
				streamBatch(toDiscoverItems(data.items, 'prompt'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMorePrompts.value = false;
				await showLoadError('prompt', getErrorMessage(err), generation);
			}),
		withRequestTimeout(fetchRecommendedArticlesOrRandom(randomCount))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				hasMoreArticles.value = res.items.length > 0;
				if (res.error) {
					hasMoreArticles.value = false;
					await showLoadError('article', res.error, generation);
				}
				streamBatch(toDiscoverItems(res.items, 'article'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreArticles.value = false;
				await showLoadError('article', getErrorMessage(err), generation);
			}),
		withRequestTimeout(fetchRecommendedEventsOrRandom(randomCount))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				hasMoreEvents.value = res.items.length > 0;
				if (res.error) {
					hasMoreEvents.value = false;
					await showLoadError('event', res.error, generation);
				}
				streamBatch(toDiscoverItems(res.items, 'event'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreEvents.value = false;
				await showLoadError('event', getErrorMessage(err), generation);
			}),
		withRequestTimeout(getUsers(currentPage, randomCount, '', 'rand'))
			.then(async (res) => {
				if (generation !== queryGeneration.value) return;
				const data = extractItemsFromResponse<User>(res);
				hasMoreUsers.value = data.items.length > 0;
				if (!res.success) {
					hasMoreUsers.value = false;
					await showLoadError('user', res.message || 'Unknown error', generation);
				}
				streamBatch(toDiscoverItems(data.items, 'user'));
			})
			.catch(async (err) => {
				if (generation !== queryGeneration.value) return;
				hasMoreUsers.value = false;
				await showLoadError('user', getErrorMessage(err), generation);
			})
	]);

	if (generation !== queryGeneration.value) return;

	if (anyReceived || hasMore.value) {
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

const { startTour } = useSiteTour();

const discoverTour = computed<SiteTourStep[]>(() => [
	{
		id: 'discover-search',
		title: 'Discover Anything',
		description:
			'Search across people, activities, articles, prompts, and events. Type a keyword to find what you need, or leave it blank for a curated random feed.',
		footer: 'Results stream in as you type.',
		icon: 'mdi:magnify',
		placement: 'bottom',
		highlightPadding: 8
	},
	{
		id: 'discover-results',
		title: showSegmentSelector.value ? 'Filtered Results' : 'Your Feed',
		description: showSegmentSelector.value
			? 'When you search or land on a specific tab, results are filtered to that type. Tap any card to open it.'
			: 'Without a search query, you get a shuffled mix of activities, articles, prompts, events, and users, refreshed each load.',
		footer: 'Scroll to load more, or pull-to-refresh to shuffle a new batch.',
		icon: 'mdi:compass-outline',
		highlightPadding: 12,
		waitFor: 'discover-results'
	},
	{
		id: 'discover-segments',
		title: 'Filter by Type',
		description:
			'Once you start searching, this segment bar appears so you can narrow results to users, activities, articles, prompts, or events.',
		footer: "The selector also appears when you arrive here from the welcome tour's deep links.",
		icon: 'mdi:filter-variant',
		highlightPadding: 6,
		condition: () => showSegmentSelector.value
	}
]);
</script>
