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
				<div class="flex flex-col m-8 mt-20 w-full items-center justify-center">
					<IonImg
						src="/earth-app.png"
						alt="The Earth App"
						class="size-16 sm:size-24 md:size-28"
					/>
					<h2
						id="title"
						class="text-4xl!"
					>
						The Earth App
					</h2>
					<ClientOnly>
						<div class="flex flex-col gap-2 items-center">
							<h4 class="text-lg! m-0!">
								Welcome, {{ user?.username ? `@${user.username}!` : '' }}
							</h4>
							<div class="flex gap-2">
								<IonButton
									color="primary"
									shape="round"
									fill="outline"
									size="small"
									@click="startWelcomeTour"
								>
									<UIcon
										name="mdi:account-arrow-right"
										class="min-w-4 min-h-4"
									/>
								</IonButton>
								<IonButton
									color="tertiary"
									shape="round"
									fill="outline"
									size="small"
									@click="onboardingOpen = true"
								>
									<UIcon
										name="mdi:restart"
										class="min-w-4 min-h-4"
									/>
								</IonButton>
							</div>
						</div>
					</ClientOnly>
				</div>
				<ClientOnly>
					<div
						v-if="user && resumeStep && !hasCompleted('welcome')"
						class="w-full max-w-2xl mx-auto px-4 mb-3"
					>
						<IonCard
							:color="theme"
							class="m-0 px-3 py-2 flex items-center justify-between"
						>
							<div class="flex items-center gap-2 min-w-0">
								<UIcon
									name="mdi:compass-outline"
									class="size-5 text-primary shrink-0"
								/>
								<span class="text-sm font-medium truncate">
									Pick up your tour where you left off
								</span>
							</div>
							<div class="flex items-center gap-1 shrink-0">
								<IonButton
									size="small"
									color="primary"
									@click="resumeWelcomeTour"
								>
									Resume
								</IonButton>
								<IonButton
									size="small"
									fill="clear"
									color="medium"
									aria-label="Dismiss tour resume"
									@click="dismissResumeTour"
								>
									<UIcon
										name="mdi:close"
										class="size-4"
									/>
								</IonButton>
							</div>
						</IonCard>
					</div>
					<div
						v-if="motd && motd.motd"
						id="motd"
						class="w-full px-4 mb-4"
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

					<UserMJourneyHero v-if="user" />
					<UserMBadgeShowcase v-if="user" />
					<WidgetsMSavedWordsBlock v-if="user" />

					<div
						v-if="user && onboarding.state.value"
						class="w-full px-3"
					>
						<OnboardingMWelcomeChecklist @open-persona="personaOpen = true" />
						<OnboardingMPersonaPicker v-model="personaOpen" />
					</div>

					<div
						v-if="user?.activities && user.activities?.length > 0"
						class="w-full max-w-full my-4 px-4"
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
							<div class="flex w-max items-center justify-start gap-2 mb-4 pr-4">
								<LazyActivityCircle
									v-for="activity in user.activities"
									:key="activity.id"
									:activity="activity"
								/>
							</div>
						</div>
					</div>

					<h2 class="self-start text-base! mt-0! mb-1! ml-4! font-bold!">Your Feed</h2>

					<div
						v-if="feedItems.length === 0 && (isRefreshing || isLoadingMore || !hasInitialized)"
						class="flex flex-col gap-3 items-center w-full px-4 py-4"
					>
						<MSkeleton
							v-for="n in 4"
							:key="n"
							:height="100"
							width="100%"
						/>
					</div>
					<div
						v-else
						class="flex flex-col gap-4 items-center justify-center w-full"
					>
						<template
							v-for="(item, index) in renderableFeedItems"
							:key="`${item.type}-${item.isGroup ? 'group' : 'single'}-${index}`"
						>
							<MInfoCardGroup
								v-if="item.type === 'activity' && item.isGroup && item.data.length > 0"
								title="New Content"
								description="Explore new interests and activities"
								icon="material-symbols:apps"
								show-dots
								class="w-11/12"
							>
								<LazyActivityMCard
									v-for="activity in item.data"
									:key="activity.id"
									:activity="activity"
									hydrate-on-visible
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'activity' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<LazyActivityMCard
									:activity="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'prompt' && item.isGroup && item.data.length > 0"
								title="Prompts for Reflection"
								description="Thought-provoking prompts to inspire your day"
								icon="material-symbols:lightbulb-circle-outline"
								show-dots
								class="w-11/12"
							>
								<LazyPromptMCard
									v-for="prompt in item.data"
									:key="prompt.id"
									:prompt="prompt"
									hydrate-on-visible
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'prompt' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<LazyPromptMCard
									:prompt="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'article' && item.isGroup && item.data.length > 0"
								title="Latest Articles"
								description="Stay informed with the newest articles"
								icon="mdi:newspaper-variant-multiple-outline"
								show-dots
								class="w-11/12"
							>
								<LazyArticleMCard
									v-for="article in item.data"
									:key="article.id"
									:article="article"
									hydrate-on-visible
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'article' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<LazyArticleMCard
									:article="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'event' && item.isGroup && item.data.length > 0"
								title="New Events"
								description="Join events happening around you"
								icon="mdi:calendar-star"
								show-dots
								class="w-11/12"
							>
								<LazyEventMCard
									v-for="event in item.data"
									:key="event.id"
									:event="event"
									hydrate-on-visible
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'event' && !item.isGroup && item.data[0]"
								class="w-11/12"
							>
								<LazyEventMCard
									:event="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'user' && item.isGroup && item.data.length > 0"
								title="Discover Users"
								description="Connect with like-minded individuals"
								icon="mdi:account-group-outline"
								show-dots
								class="w-11/12"
							>
								<LazyUserMCard
									v-for="user in item.data"
									:key="user.id"
									:user="user"
									hydrate-on-visible
								/>
							</MInfoCardGroup>
							<LazyMWidgetSlot
								v-if="widgetForIndex(index)"
								:kind="widgetForIndex(index)!"
								topic="daily"
								hydrate-on-visible
							/>
						</template>
						<IonInfiniteScroll
							@ionInfinite="onInfinite"
							threshold="40%"
						>
							<IonInfiniteScrollContent />
						</IonInfiniteScroll>
					</div>

					<OnboardingMTextSizePrompt
						ref="textSizePromptRef"
						@closed="handleTextSizePromptClosed"
					/>
				</ClientOnly>
			</div>
			<IonModal
				:is-open="onboardingOpen"
				@didDismiss="onboardingOpen = false"
				style="--max-height: 80%; --width: 80%; --min-width: 350px"
			>
				<IonContent
					id="onboarding-modal-content"
					class="border-2"
					:scroll-y="true"
				>
					<OnboardingQuest @done="handleOnboardingQuestDone" />
				</IonContent>
			</IonModal>
		</IonContent>

		<MScrollCue :scroll-container="scrollContainerEl" />
	</IonPage>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { type Event } from 'types/event';
import { theme } from '~/composables/useSettings';

const onboardingOpen = ref(false);
const personaOpen = ref(false);
const onboarding = useOnboarding();

function handleOnboardingQuestDone() {
	onboardingOpen.value = false;
	if (onboarding.state.value && !onboarding.state.value.completed_steps.includes('welcome')) {
		void onboarding.completeStep('welcome');
	}
}

type FeedItem =
	| { type: 'activity'; isGroup: boolean; data: Activity[] }
	| { type: 'prompt'; isGroup: boolean; data: Prompt[] }
	| { type: 'article'; isGroup: boolean; data: Article[] }
	| { type: 'event'; isGroup: boolean; data: Event[] }
	| { type: 'user'; isGroup: true; data: User[] };

type ContentType = FeedItem['type'];

const { user, fetchUser, fetchRecommendedActivities } = useAuth();
const { widgetForIndex } = useFeedWidgets();
const { motd, fetchMotd } = useMotd();
const { settings: appSettings, init: initSettings } = useAppSettings();
const { startTour, startTourIfNew, hasCompleted } = useSiteTour();
const { fetchNotifications } = useNotifications();

const motdColor = computed(() => {
	if (!motd.value) return 'primary';
	if (motd.value.type === 'info') return 'secondary';
	if (motd.value.type === 'warning') return 'warning';
	if (motd.value.type === 'error') return 'danger';
	return 'primary';
});

const contentRef = ref<any>(null);
// IonContent's inner scroll element resolved post-mount; MScrollCue attaches its listener to it
const scrollContainerEl = ref<HTMLElement | null>(null);
const textSizePromptRef = ref<{ maybeOpen: () => void } | null>(null);
const feedItems = ref<FeedItem[]>([]);
// data can transiently empty during refetch, outer filter + inner v-if guards belt-and-suspenders
const renderableFeedItems = computed(() =>
	feedItems.value.filter((i) => Array.isArray(i.data) && i.data.length > 0)
);
const isLoadingMore = ref(false);
const isRefreshing = ref(false);
const hasInitialized = ref(false);
// last two types are blocked when picking the next one so groups don't cluster within 2 steps
const recentContentTypes = ref<ContentType[]>([]);
const RECENT_TYPE_LOOKBACK = 2;
// track recently shown IDs per content type so we don't recycle the same card across nearby groups
const recentlyShownIds = ref<Record<ContentType, Set<string>>>({
	activity: new Set(),
	prompt: new Set(),
	article: new Set(),
	event: new Set(),
	user: new Set()
});
const RECENT_ID_LOOKBACK = 30;
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

const WELCOME_TOUR_RESUME_KEY = 'sky:welcome-tour-resume-step';
const resumeStep = ref<number | null>(null);

async function loadResumeStep() {
	if (hasCompleted('welcome')) {
		resumeStep.value = null;
		return;
	}
	try {
		const { value } = await Preferences.get({ key: WELCOME_TOUR_RESUME_KEY });
		const parsed = value ? Number(value) : null;
		resumeStep.value = Number.isFinite(parsed) && parsed && parsed > 0 ? parsed : null;
	} catch {
		resumeStep.value = null;
	}
}

function startWelcomeTour() {
	startTour('welcome');
}

let tourTriggeredFromTextSize = false;
function handleTextSizePromptClosed() {
	if (tourTriggeredFromTextSize) return;
	tourTriggeredFromTextSize = true;
	if (!user.value) return;
	if (hasCompleted('welcome')) return;
	if (resumeStep.value) return; // show the resume chip instead of auto-starting
	startTourIfNew('welcome');
}

async function resumeWelcomeTour() {
	const step = resumeStep.value ?? 0;
	startTour('welcome', step);
	resumeStep.value = null;
	await Preferences.remove({ key: WELCOME_TOUR_RESUME_KEY }).catch(() => {});
}

async function dismissResumeTour() {
	resumeStep.value = null;
	await Preferences.remove({ key: WELCOME_TOUR_RESUME_KEY }).catch(() => {});
}

function getNextContentType(): ContentType {
	const types: ContentType[] = ['activity', 'prompt', 'article', 'event', 'user'];
	// block any type that appeared in the last RECENT_TYPE_LOOKBACK picks so groups stay spaced
	const blocked = new Set(recentContentTypes.value.slice(-RECENT_TYPE_LOOKBACK));
	let availableTypes = types.filter((t) => !blocked.has(t));
	// belt-and-suspenders: if the lookback ever blocks everything, fall back to "not the last one"
	if (availableTypes.length === 0) {
		const lastType = recentContentTypes.value[recentContentTypes.value.length - 1];
		availableTypes = types.filter((t) => t !== lastType);
	}
	const randomIndex = Math.floor(Math.random() * availableTypes.length);
	const nextType = availableTypes[randomIndex]!;
	recentContentTypes.value.push(nextType);
	if (recentContentTypes.value.length > RECENT_TYPE_LOOKBACK * 2) {
		recentContentTypes.value.splice(0, recentContentTypes.value.length - RECENT_TYPE_LOOKBACK * 2);
	}
	return nextType;
}

// strip out items we've already shown recently to keep duplicate data out of the visible feed
function dedupeData<T extends { id: string }>(type: ContentType, data: T[]): T[] {
	const seen = recentlyShownIds.value[type];
	const filtered: T[] = [];
	const seenInBatch = new Set<string>();
	for (const item of data) {
		if (!item?.id) continue;
		if (seen.has(item.id) || seenInBatch.has(item.id)) continue;
		seenInBatch.add(item.id);
		filtered.push(item);
	}
	return filtered;
}

function recordShownIds(type: ContentType, data: { id: string }[]) {
	const seen = recentlyShownIds.value[type];
	for (const item of data) {
		if (item?.id) seen.add(item.id);
	}
	// cap the set so it doesn't grow unbounded across infinite scroll
	if (seen.size > RECENT_ID_LOOKBACK) {
		const overflow = seen.size - RECENT_ID_LOOKBACK;
		let removed = 0;
		for (const id of seen) {
			if (removed >= overflow) break;
			seen.delete(id);
			removed++;
		}
	}
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
				if (valid(res)) {
					return res.data.slice(0, count);
				}
			}

			const { fetchRandom } = useActivities();
			const res = await fetchRandom(count);
			if (valid(res)) return res.data;
		} else if (type === 'prompt') {
			const { fetchRandom } = usePrompts();
			const res = await fetchRandom(count);
			if (valid(res)) return res.data;
		} else if (type === 'article') {
			const { fetchRecommended, fetchRandom, fetchRecent } = useArticles();
			if (useRecommended && user.value) {
				const res = await fetchRecommended(count);
				if (valid(res)) return res.data;
			}

			const split = Math.random() * 0.4 + 0.3; // between 30% and 70%
			const recCount = Math.floor(count * split);
			const [res1, res2] = await Promise.all([
				fetchRandom(count - recCount),
				fetchRecent(count - recCount)
			]);
			const articles: Article[] = [];

			if (valid(res1)) {
				articles.push(...res1.data);
			}

			if (valid(res2)) {
				articles.push(...res2.data.items);
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
			if (res1.status === 'fulfilled' && valid(res1.value)) {
				events.push(...res1.value.data);
			}

			if (res2.status === 'fulfilled' && valid(res2.value)) {
				events.push(...res2.value.data.items);
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

	// over-fetch when we need a group so dedupe still leaves enough items to fill it
	const requestCount = isGroup ? Math.min(count * 2 + 2, 16) : Math.max(count, 3);

	if (type === 'activity') {
		const raw = await fetchContent(type, requestCount, useRecommended);
		const data = dedupeData(type, raw).slice(0, isGroup ? count : 1);
		if (data.length > 0) {
			recordShownIds(type, data);
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const activity of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/activities/${activity.id}`);
			}
		}
	} else if (type === 'prompt') {
		const raw = await fetchContent(type, requestCount, useRecommended);
		const data = dedupeData(type, raw).slice(0, isGroup ? count : 1);
		if (data.length > 0) {
			recordShownIds(type, data);
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const prompt of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/prompts/${prompt.id}`);
			}
		}
	} else if (type === 'article') {
		const raw = await fetchContent(type, requestCount, useRecommended);
		const data = dedupeData(type, raw).slice(0, isGroup ? count : 1);
		if (data.length > 0) {
			recordShownIds(type, data);
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const article of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/articles/${article.id}`);
			}
		}
	} else if (type === 'event') {
		const raw = await fetchContent(type, requestCount, useRecommended);
		const data = dedupeData(type, raw).slice(0, isGroup ? count : 1);
		if (data.length > 0) {
			recordShownIds(type, data);
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
		const raw = await fetchContent(type, Math.max(2, requestCount), useRecommended);
		const data = dedupeData(type, raw).slice(0, Math.max(2, count));
		if (data.length > 0) {
			recordShownIds(type, data);
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
			withFeedItemTimeout(generateFeedItem(), `Feed item ${index + 1}`).then((item) => {
				if (item !== null) {
					feedItems.value.push(item);
					if (!hasInitialized.value) {
						hasInitialized.value = true;
					}
				}
			})
		);
		await Promise.all(promises);
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
	recentContentTypes.value = [];
	for (const type of Object.keys(recentlyShownIds.value) as ContentType[]) {
		recentlyShownIds.value[type].clear();
	}
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
	void fetchNotifications();
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

	// kick off onboarding fetch from the parent; the checklist container is
	// gated on onboarding.fetched, so we can't rely on the child's onMounted
	if (user.value) void onboarding.fetchState();

	await nextTick();
	await refreshFeed(0);

	// resolve IonContent's inner scroll element so MScrollCue can listen for scroll dismissal
	try {
		const rawRef = contentRef.value as {
			getScrollElement?: () => Promise<HTMLElement | null>;
			$el?: { getScrollElement?: () => Promise<HTMLElement | null> };
		} | null;
		const target = rawRef?.getScrollElement ? rawRef : rawRef?.$el;
		if (target?.getScrollElement) {
			scrollContainerEl.value = await target.getScrollElement();
		}
	} catch {
		// fall back to window scroll inside MScrollCue
	}

	if (user.value && !hasCompleted('welcome')) {
		// Text-size prompt fires first; the welcome tour only starts AFTER it
		// closes (see handleTextSizePromptClosed). If the user has already seen
		// the prompt, maybeOpen() emits `closed` immediately and the tour fires
		// on the next tick; no UX regression for returning users.
		await loadResumeStep();
		setTimeout(() => {
			if (!user.value) return;
			textSizePromptRef.value?.maybeOpen();
		}, 600);
	}

	// fetch additional data if not data constrainted
	if (!isDataConstrained.value && user.value) {
		const {
			fetchUserQuest,
			fetchQuestHistory,
			fetchCosmetics,
			fetchPoints,
			fetchMasteryList,
			fetchBadges,
			fetchAttendingEvents,
			fetchEventSubmissions
		} = useUser(user.value.id, makeMServerRequest);

		fetchUserQuest();
		fetchQuestHistory();
		fetchCosmetics();
		fetchPoints();
		fetchBadges();
		fetchMasteryList();
		fetchAttendingEvents();
		fetchEventSubmissions();
	}
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
