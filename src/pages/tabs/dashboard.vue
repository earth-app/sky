<template>
	<IonPage>
		<IonContent
			ref="contentRef"
			:scroll-y="true"
		>
			<IonRefresher
				slot="fixed"
				:disabled="isRefreshing || isLoadingMore"
				@ionRefresh="handleRefresh"
			>
				<IonRefresherContent />
			</IonRefresher>
			<div class="flex flex-col size-full items-center">
				<div class="flex flex-col m-8 items-center">
					<IonImg
						src="/earth-app.png"
						alt="The Earth App"
						class="size-16 sm:size-24 md:size-28"
					/>
					<h2 class="text-4xl!">The Earth App</h2>
					<ClientOnly>
						<h4 class="text-lg! m-0!">Welcome, {{ user?.username ? `@${user.username}!` : '' }}</h4>
					</ClientOnly>
				</div>
				<ClientOnly>
					<div
						v-if="motd && motd.motd"
						id="motd"
						class="w-full px-4"
					>
						<IonCard
							:color="motdColor"
							class="p-2 border-4 border-black/50 light:border-white/50"
						>
							<IonCardHeader>
								<div class="flex items-center">
									<UIcon
										v-if="motd.icon"
										:name="motd.icon"
										class="size-8 md:size-12 mr-2"
									/>
									<IonCardTitle class="text-sm">{{ motd.motd }}</IonCardTitle>
								</div>
							</IonCardHeader>

							<div
								v-if="motd.link"
								class="flex w-full mt-2"
							>
								<IonButton
									:color="theme"
									size="small"
									@click="handleMotdLinkClick(motd.link)"
								>
									Learn More
									<UIcon
										name="mdi:arrow-right"
										class="ml-1 size-4"
									/>
								</IonButton>
							</div>
						</IonCard>
					</div>

					<div
						v-if="user?.activities"
						class="w-full max-w-full mt-4 px-4"
					>
						<h2 class="text-base! mt-0! mb-1! font-bold!">Your Activities</h2>
						<div
							ref="activityScroll"
							class="w-full max-w-full overflow-x-auto overflow-y-hidden min-h-12 cursor-grab active:cursor-grabbing select-none scrollbar-hide"
							@mousedown="startDrag"
							@mousemove="onDrag"
							@mouseup="stopDrag"
							@mouseleave="stopDrag"
						>
							<div class="flex w-max items-center justify-start gap-2 pr-4">
								<LazyActivityCircle
									v-for="activity in user.activities"
									:key="activity.id"
									:activity="activity"
								/>
							</div>
						</div>
					</div>

					<div
						v-if="!hasInitialized || isRefreshing"
						class="flex items-center justify-center w-full py-8"
					>
						<IonSpinner name="crescent" />
					</div>
					<div
						v-else
						class="flex flex-col gap-4 items-center justify-center w-full"
					>
						<template
							v-for="(item, index) in feedItems"
							:key="`${item.type}-${item.isGroup ? 'group' : 'single'}-${index}`"
						>
							<MInfoCardGroup
								v-if="item.type === 'activity' && item.isGroup"
								title="New Content"
								description="Explore new interests and activities"
								icon="material-symbols:apps"
								show-dots
								class="w-11/12"
							>
								<ActivityMCard
									v-for="activity in item.data"
									:key="activity.id"
									:activity="activity"
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'activity' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<ActivityMCard :activity="item.data[0]" />
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'prompt' && item.isGroup"
								title="Prompts for Reflection"
								description="Thought-provoking prompts to inspire your day"
								icon="material-symbols:lightbulb-circle-outline"
								show-dots
								class="w-11/12"
							>
								<PromptMCard
									v-for="prompt in item.data"
									:key="prompt.id"
									:prompt="prompt"
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'prompt' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<PromptMCard :prompt="item.data[0]" />
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'article' && item.isGroup"
								title="Latest Articles"
								description="Stay informed with the newest articles"
								icon="mdi:newspaper-variant-multiple-outline"
								show-dots
								class="w-11/12"
							>
								<ArticleMCard
									v-for="article in item.data"
									:key="article.id"
									:article="article"
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'article' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<ArticleMCard :article="item.data[0]" />
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'event' && item.isGroup"
								title="New Events"
								description="Join events happening around you"
								icon="mdi:calendar-star"
								show-dots
								class="w-11/12"
							>
								<EventMCard
									v-for="event in item.data"
									:key="event.id"
									:event="event"
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'event' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<EventMCard :event="item.data[0]" />
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'user' && item.isGroup"
								title="Discover Users"
								description="Connect with like-minded individuals"
								icon="mdi:account-group-outline"
								show-dots
								class="w-11/12"
							>
								<UserMCard
									v-for="user in item.data"
									:key="user.id"
									:user="user"
								/>
							</MInfoCardGroup>
						</template>
						<IonInfiniteScroll
							@ionInfinite="onInfinite"
							threshold="40%"
						>
							<IonInfiniteScrollContent />
						</IonInfiniteScroll>
					</div>
				</ClientOnly>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { type Event } from 'types/event';

type FeedItem =
	| { type: 'activity'; isGroup: boolean; data: Activity[] }
	| { type: 'prompt'; isGroup: boolean; data: Prompt[] }
	| { type: 'article'; isGroup: boolean; data: Article[] }
	| { type: 'event'; isGroup: boolean; data: Event[] }
	| { type: 'user'; isGroup: true; data: User[] };

type ContentType = FeedItem['type'];

const { user, fetchUser, fetchRecommendedActivities } = useAuth();
const { motd, fetchMotd } = useMotd();
const { settings: appSettings, init: initSettings } = useAppSettings();

const motdColor = computed(() => {
	if (!motd.value) return 'primary';
	if (motd.value.type === 'info') return 'secondary';
	if (motd.value.type === 'warning') return 'warning';
	if (motd.value.type === 'error') return 'danger';
	return 'primary';
});

const contentRef = ref<any>(null);
const feedItems = ref<FeedItem[]>([]);
const isLoadingMore = ref(false);
const isRefreshing = ref(false);
const hasInitialized = ref(false);
const lastContentType = ref<ContentType | null>(null);
const dashboardRefreshSignal = useState<number>('dashboard-refresh-signal', () => 0);

const GROUP_SIZES = {
	activity: 5,
	prompt: 3,
	article: 4,
	event: 5,
	user: 3
};

const groupSizes = computed(() => {
	const reduction = isDataConstrained.value ? 2 : 0;

	return {
		activity: Math.max(2, GROUP_SIZES.activity - reduction),
		prompt: Math.max(2, GROUP_SIZES.prompt - reduction),
		article: Math.max(2, GROUP_SIZES.article - reduction),
		event: Math.max(2, GROUP_SIZES.event - reduction),
		user: Math.max(2, GROUP_SIZES.user - reduction)
	};
});

const shouldPreloadRoutes = computed(
	() =>
		appSettings.value.preloadContent && !appSettings.value.offlineMode && !isDataConstrained.value
);

function handleMotdLinkClick(link?: string) {
	if (!link) return;
	navigateTo(link, { external: link.startsWith('http') });
}

function getNextContentType(): ContentType {
	const types: ContentType[] = ['activity', 'prompt', 'article', 'event', 'user'];
	const availableTypes = types.filter((t) => t !== lastContentType.value);
	const randomIndex = Math.floor(Math.random() * availableTypes.length);
	const nextType = availableTypes[randomIndex]!;
	lastContentType.value = nextType;
	return nextType;
}

function shouldBeGroup(): boolean {
	return Math.random() < 0.5;
}

function withFeedItemTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number = 12_000) {
	return new Promise<T | null>((resolve) => {
		const timer = setTimeout(() => {
			console.warn(`${label} timed out after ${timeoutMs}ms`);
			resolve(null);
		}, timeoutMs);

		promise
			.then((value) => {
				clearTimeout(timer);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timer);
				console.error(`${label} failed:`, error);
				resolve(null);
			});
	});
}

// fetch content based on type
async function fetchContent(
	type: 'activity',
	count: number,
	useRecommended?: boolean
): Promise<Activity[]>;
async function fetchContent(
	type: 'prompt',
	count: number,
	useRecommended?: boolean
): Promise<Prompt[]>;
async function fetchContent(
	type: 'article',
	count: number,
	useRecommended?: boolean
): Promise<Article[]>;
async function fetchContent(
	type: 'event',
	count: number,
	useRecommended?: boolean
): Promise<Event[]>;
async function fetchContent(type: 'user', count: number, useRecommended?: boolean): Promise<User[]>;
async function fetchContent(
	type: ContentType,
	count: number,
	useRecommended: boolean = false
): Promise<Activity[] | Prompt[] | Article[] | Event[] | User[]> {
	if (isOffline.value) {
		return [];
	}

	try {
		if (type === 'activity') {
			if (useRecommended && user.value) {
				const res = await fetchRecommendedActivities(count * 3);
				if (res.success && res.data && Array.isArray(res.data)) {
					return res.data.slice(0, count);
				}
			}

			const { fetchRandom } = useActivities();
			const res = await fetchRandom(count);
			if (res.success && res.data && Array.isArray(res.data)) {
				return res.data;
			}
		} else if (type === 'prompt') {
			const { fetchRandom } = usePrompts();
			const res = await fetchRandom(count);
			if (res.success && res.data && Array.isArray(res.data)) {
				return res.data;
			}
		} else if (type === 'article') {
			const { fetchRecommended, fetchRandom, fetchRecent } = useArticles();
			if (useRecommended && user.value) {
				const res = await fetchRecommended(count);
				if (res.success && res.data && Array.isArray(res.data)) {
					return res.data;
				}
			}

			const split = Math.random() * 0.4 + 0.3; // between 30% and 70%
			const recCount = Math.floor(count * split);
			const [res1, res2] = await Promise.all([
				fetchRandom(count - recCount),
				fetchRecent(count - recCount)
			]);
			const articles: Article[] = [];

			if (res1.success && res1.data && Array.isArray(res1.data)) {
				articles.push(...res1.data);
			}

			if (res2.success && res2.data && Array.isArray(res2.data)) {
				articles.push(...res2.data);
			}

			// Deduplicate articles by ID
			const uniqueArticlesMap = new Map<string, Article>();
			for (const article of articles) {
				uniqueArticlesMap.set(article.id, article);
			}

			return Array.from(uniqueArticlesMap.values()).slice(0, count);
		} else if (type === 'event') {
			const { fetchRandom, fetchRecent } = useEvents();

			const split = Math.random() * 0.4 + 0.4; // between 40% and 60%
			const recCount = Math.floor(count * split);
			const [res1, res2] = await Promise.allSettled([
				fetchRandom(count - recCount),
				fetchRecent(count - recCount)
			]);

			const events: Event[] = [];
			if (
				res1.status === 'fulfilled' &&
				res1.value.success &&
				res1.value.data &&
				Array.isArray(res1.value.data)
			) {
				events.push(...res1.value.data);
			}

			if (
				res2.status === 'fulfilled' &&
				res2.value.success &&
				res2.value.data &&
				Array.isArray(res2.value.data)
			) {
				events.push(...res2.value.data);
			}

			// Deduplicate events by ID
			const uniqueEventsMap = new Map<string, Event>();
			for (const event of events) {
				uniqueEventsMap.set(event.id, event);
			}

			return Array.from(uniqueEventsMap.values()).slice(0, count);
		} else if (type === 'user') {
			const { fetchAll } = useUsers();

			const split = Math.random() * 0.4 + 0.3; // between 30% and 70%
			const randCount = Math.floor(count * split);
			const [res1, res2] = await Promise.all([
				fetchAll(count - randCount),
				fetchAll(randCount, undefined, 'rand')
			]);

			const users: User[] = [];
			if (res1.success && res1.data && Array.isArray(res1.data)) {
				users.push(...res1.data);
			}

			if (res2.success && res2.data && Array.isArray(res2.data)) {
				users.push(...res2.data);
			}

			// Deduplicate users by ID
			const uniqueUsersMap = new Map<string, User>();
			for (const user of users) {
				uniqueUsersMap.set(user.id, user);
			}

			return Array.from(uniqueUsersMap.values()).slice(0, count);
		}
	} catch (error) {
		console.error(`Error fetching ${type}:`, error);
	}
	return [];
}

async function generateFeedItem(): Promise<FeedItem | null> {
	if (isOffline.value) return null;

	const type = getNextContentType();
	const isGroup = shouldBeGroup();
	const count = isGroup ? groupSizes.value[type] : 1;

	// alternate between random and recommended content
	const hasAuthenticatedUser = Boolean(user.value?.id);
	const useRecommended =
		Math.random() < (isDataConstrained.value ? 0.15 : 0.3) && hasAuthenticatedUser;
	let feedItem: FeedItem | null = null;

	if (type === 'activity') {
		const data = await fetchContent(type, count, useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const activity of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/activities/${activity.id}`);
			}
		}
	} else if (type === 'prompt') {
		const data = await fetchContent(type, count, useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const prompt of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/prompts/${prompt.id}`);
			}
		}
	} else if (type === 'article') {
		const data = await fetchContent(type, count, useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const article of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/articles/${article.id}`);
			}
		}
	} else if (type === 'event') {
		const data = await fetchContent(type, count, useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const event of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/events/${event.id}`);
			}
		}
	} else if (type === 'user') {
		// users are always groups since single user cards don't make much sense in a feed context
		const data = await fetchContent(type, Math.max(2, count), useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup: true, data };
		}

		// prerender routes
		for (const user of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/profile/${user.id}`);
				preloadRouteComponents(`/tabs/profile/@${user.username}`);
			}
		}
	}

	return feedItem;
}

async function loadMoreItems(count: number = 3) {
	if (isLoadingMore.value) return;

	isLoadingMore.value = true;

	try {
		if (isDataConstrained.value) {
			await new Promise((resolve) => setTimeout(resolve, 220));
		}

		const promises = Array.from({ length: count }, (_, index) =>
			withFeedItemTimeout(generateFeedItem(), `Feed item ${index + 1}`)
		);
		const items = await Promise.all(promises);
		const validItems = items.filter((item): item is FeedItem => item !== null);
		feedItems.value.push(...validItems);
	} catch (error) {
		console.error('Error loading more items:', error);
		await Toast.show({
			text: 'Failed to load more content',
			duration: 'short'
		});
	} finally {
		isLoadingMore.value = false;
	}
}

async function onInfinite(event: CustomEvent) {
	await loadMoreItems(isDataConstrained.value ? 2 : 3);
	(event.target as any).complete();
}

async function handleRefresh(event: CustomEvent<{ complete?: () => void }>) {
	try {
		await refreshFeed();
	} finally {
		event.detail?.complete?.();
	}
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

async function refreshFeed(scrollDurationMs: number = 300) {
	if (isRefreshing.value) return;

	isRefreshing.value = true;
	lastContentType.value = null;
	await scrollToTop(scrollDurationMs);
	feedItems.value = [];

	try {
		await loadMoreItems(isDataConstrained.value ? 3 : 5);
	} catch (error) {
		console.error('Error refreshing feed:', error);
		await Toast.show({
			text: 'Failed to refresh feed',
			duration: 'short'
		});
	} finally {
		isRefreshing.value = false;
		hasInitialized.value = true;
	}
}

watch(
	dashboardRefreshSignal,
	async () => {
		if (!hasInitialized.value) return;
		await nextTick();
		await scrollToTop(300);
	},
	{ flush: 'post' }
);

onMounted(async () => {
	try {
		await initSettings();
	} catch (error) {
		console.error('Failed to initialize dashboard settings:', error);
	}

	const hasSessionToken = Boolean(useCurrentSessionToken());
	if (!isOffline.value && (user.value === undefined || (user.value === null && hasSessionToken))) {
		try {
			await fetchUser(!hasSessionToken);
		} catch (error) {
			console.warn('Dashboard auth refresh failed:', error);
			await Toast.show({
				text: 'Failed to load user data. Some features may not work properly.',
				duration: 'long'
			});
		}
	}

	if (!isOffline.value) {
		void fetchMotd();
	}

	await nextTick();
	await refreshFeed(0);
});

// activity scrolling

const activityScroll = ref<HTMLElement | null>(null);
let isDragging = false;
let startX = 0;
let scrollLeft = 0;

function startDrag(e: MouseEvent) {
	isDragging = true;
	startX = e.pageX - (activityScroll.value?.offsetLeft ?? 0);
	scrollLeft = activityScroll.value?.scrollLeft ?? 0;
}

function onDrag(e: MouseEvent) {
	if (!isDragging || !activityScroll.value) return;
	e.preventDefault();
	const x = e.pageX - activityScroll.value.offsetLeft;
	const walk = (x - startX) * 1.2;
	activityScroll.value.scrollLeft = scrollLeft - walk;
}

function stopDrag() {
	isDragging = false;
}
</script>
