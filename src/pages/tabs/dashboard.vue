<template>
	<IonPage>
		<IonContent
			ref="contentRef"
			:scroll-y="true"
		>
			<IonRefresher
				slot="fixed"
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
						<h4 class="text-lg! m-0!">Welcome, @{{ user?.username }}</h4>
					</ClientOnly>
				</div>
				<ClientOnly>
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
						</template>
						<IonInfiniteScroll
							@ionInfinite="onInfinite"
							threshold="75%"
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
import { type Activity } from '@earth-app/crust/src/shared/types/activity';
import { type Article } from '@earth-app/crust/src/shared/types/article';
import { type Prompt } from '@earth-app/crust/src/shared/types/prompts';

type FeedItem =
	| { type: 'activity'; isGroup: boolean; data: Activity[] }
	| { type: 'prompt'; isGroup: boolean; data: Prompt[] }
	| { type: 'article'; isGroup: boolean; data: Article[] };

type ContentType = FeedItem['type'];

const { user } = useAuth();

const contentRef = ref<any>(null);
const feedItems = ref<FeedItem[]>([]);
const isLoadingMore = ref(false);
const isRefreshing = ref(false);
const hasInitialized = ref(false);
const lastContentType = ref<ContentType | null>(null);

const GROUP_SIZES = {
	activity: 5,
	prompt: 3,
	article: 4
};

function getNextContentType(): ContentType {
	const types: ContentType[] = ['activity', 'prompt', 'article'];
	const availableTypes = types.filter((t) => t !== lastContentType.value);
	const randomIndex = Math.floor(Math.random() * availableTypes.length);
	const nextType = availableTypes[randomIndex]!;
	lastContentType.value = nextType;
	return nextType;
}

function shouldBeGroup(): boolean {
	return Math.random() < 0.5;
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
	type: ContentType,
	count: number,
	useRecommended: boolean = false
): Promise<Activity[] | Prompt[] | Article[]> {
	try {
		if (type === 'activity') {
			if (useRecommended && user.value) {
				const res = await getRecommendedActivities(count * 3);
				if (res.success && res.data && Array.isArray(res.data)) {
					return res.data.slice(0, count);
				}
			}
			const res = await getRandomActivities(count);
			if (res.success && res.data && Array.isArray(res.data)) {
				return res.data;
			}
		} else if (type === 'prompt') {
			const res = await getRandomPrompts(count);
			if (res.success && res.data && Array.isArray(res.data)) {
				return res.data;
			}
		} else if (type === 'article') {
			if (useRecommended && user.value) {
				const res = await getRecommendedArticles(user.value, count);
				if (res.success && res.data && Array.isArray(res.data)) {
					return res.data;
				}
			}
			const res = await getRandomArticles(count);
			if (res.success && res.data && Array.isArray(res.data)) {
				return res.data;
			}
		}
	} catch (error) {
		console.error(`Error fetching ${type}:`, error);
	}
	return [];
}

async function generateFeedItem(): Promise<FeedItem | null> {
	const type = getNextContentType();
	const isGroup = shouldBeGroup();
	const count = isGroup ? GROUP_SIZES[type] : 1;

	// alternate between random and recommended content
	const useRecommended = Math.random() < 0.3 && user.value !== null;
	let feedItem: FeedItem | null = null;

	if (type === 'activity') {
		const data = await fetchContent(type, count, useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const activity of data) {
			preloadRouteComponents(`/tabs/activities/${activity.id}`);
		}
	} else if (type === 'prompt') {
		const data = await fetchContent(type, count, useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const prompt of data) {
			preloadRouteComponents(`/tabs/prompts/${prompt.id}`);
		}
	} else if (type === 'article') {
		const data = await fetchContent(type, count, useRecommended);
		if (data.length > 0) {
			feedItem = { type, isGroup, data };
		}

		// prerender routes
		for (const article of data) {
			preloadRouteComponents(`/tabs/articles/${article.id}`);
		}
	}

	return feedItem;
}

async function loadMoreItems(count: number = 3) {
	if (isLoadingMore.value) return;

	isLoadingMore.value = true;

	try {
		const promises = Array.from({ length: count }, () => generateFeedItem());
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
	await loadMoreItems(3);
	(event.target as any).complete();
}

async function handleRefresh(event: CustomEvent) {
	await refreshFeed();
	(event.target as any).complete();
}

async function refreshFeed() {
	if (isRefreshing.value) return;

	isRefreshing.value = true;
	feedItems.value = [];
	lastContentType.value = null;

	try {
		await loadMoreItems(5);

		const scrollElement = await contentRef.value?.$el.getScrollElement();
		if (scrollElement) {
			scrollElement.scrollTo({ top: 0, behavior: 'smooth' });
		}
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

// Provide refresh function globally for tabs.vue
provide('refreshDashboard', refreshFeed);

// Initialize feed
onMounted(async () => {
	await nextTick();
	await refreshFeed();
});
</script>
