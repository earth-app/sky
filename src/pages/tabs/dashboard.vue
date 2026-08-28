<template>
	<IonPage>
		<IonHeader class="m-glass">
			<IonToolbar class="[--background:transparent]">
				<div class="flex min-h-11 w-full flex-wrap items-center gap-2 px-4">
					<h1
						id="title"
						class="sr-only"
					>
						The Earth App
					</h1>
					<NuxtLink
						:to="profileHref"
						class="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-inherit! no-underline!"
						aria-label="Open Your Profile"
					>
						<UAvatar
							:src="avatar128"
							icon="mdi:account-circle"
							size="sm"
							class="shrink-0"
						/>
						<h2 class="m-0! truncate text-sm! font-semibold">{{ greeting }}</h2>
					</NuxtLink>
					<div
						class="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1"
						role="img"
						:aria-label="`Current Streak: ${journeyStreak}`"
					>
						<UIcon
							name="mdi:fire"
							class="size-4 m-text-warning"
							aria-hidden="true"
						/>
						<span class="text-2xs font-semibold tabular-nums">{{ journeyStreak }}</span>
					</div>
					<IonButton
						fill="clear"
						size="small"
						class="shrink-0"
						aria-label="Replay Welcome Tour"
						@click="startWelcomeTour"
					>
						<UIcon
							name="mdi:account-arrow-right"
							class="size-5"
						/>
					</IonButton>
					<IonButton
						v-if="showReopenOnboarding"
						fill="clear"
						size="small"
						class="shrink-0"
						aria-label="Reopen Getting Started"
						@click="onboardingOpen = true"
					>
						<UIcon
							name="mdi:restart"
							class="size-5"
						/>
					</IonButton>
					<IonButton
						fill="clear"
						size="small"
						class="shrink-0"
						:aria-label="notificationsLabel"
						@click="openNotifications"
					>
						<UIcon
							name="mdi:bell-outline"
							class="size-5"
						/>
						<span
							v-if="unreadCount > 0"
							class="absolute top-0 right-0 size-2 rounded-full bg-danger-700"
							aria-hidden="true"
						/>
					</IonButton>
				</div>
			</IonToolbar>
		</IonHeader>
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
				<ClientOnly>
					<section class="w-full px-4 pt-4 pb-4">
						<MSurface class="relative isolate gap-1 overflow-hidden">
							<div class="pointer-events-none absolute inset-0 -z-10">
								<MAmbient
									:seed="ambientSeed"
									:height="TODAY_AMBIENT_HEIGHT"
								/>
								<div
									class="absolute inset-0 bg-linear-to-b from-(--ui-bg)/70 via-(--ui-bg)/85 to-(--ui-bg)/97"
								></div>
							</div>
							<p class="m-eyebrow">Today</p>
							<h2 class="m-0! text-lg! font-semibold">{{ todayHeadline }}</h2>
							<p class="m-0! text-xs text-muted">{{ todaySubline }}</p>
							<div class="mt-3 grid grid-cols-3 gap-2">
								<MStat
									:value="questStat"
									label="Quest"
									icon="mdi:compass-rose"
								/>
								<MStat
									:value="natureStat"
									label="Time Outside"
									icon="mdi:leaf"
								/>
								<MStat
									:value="journeyStreak"
									label="Streak"
									icon="mdi:fire"
								/>
							</div>
							<IonButton
								class="mt-3 self-start"
								size="small"
								color="primary"
								:aria-label="todayCtaLabel"
								@click="openTodayCta"
							>
								{{ todayCtaLabel }}
								<UIcon
									name="mdi:arrow-right"
									class="ml-1 size-4"
								/>
							</IonButton>
						</MSurface>
					</section>
					<div
						v-if="user && resumeStep && !hasCompleted('welcome')"
						class="w-full px-4 pb-3"
					>
						<MSurface class="flex-row items-center justify-between gap-2 p-3">
							<div class="flex items-center gap-2 min-w-0">
								<UIcon
									name="mdi:compass-outline"
									class="size-5 m-text-brand shrink-0"
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
						</MSurface>
					</div>
					<OnboardingMGettingStarted v-if="user" />

					<div
						v-if="motd && motd.motd"
						id="motd"
						class="w-full px-4 pb-4"
					>
						<MSurface :class="['gap-2 border', motdTint]">
							<div class="flex items-center gap-2">
								<UIcon
									v-if="motd.icon"
									:name="motd.icon"
									class="size-6 shrink-0"
									aria-hidden="true"
								/>
								<p class="m-0! text-sm font-medium">{{ motd.motd }}</p>
							</div>

							<IonButton
								v-if="motd.link"
								class="self-start"
								size="small"
								fill="outline"
								color="primary"
								@click="handleMotdLinkClick(motd.link)"
							>
								Learn More
								<UIcon
									name="mdi:arrow-right"
									class="ml-1 size-4"
								/>
							</IonButton>
						</MSurface>
					</div>

					<MExploreStrip v-if="user" />

					<UserMemoryMCard v-if="user" />

					<MModuleRail
						v-if="user"
						eyebrow="Your Progress"
						label="Your Progress Modules"
						class="pb-4"
					>
						<UserMJourneyHero />
						<TrailMNatureCard />
						<UserMBadgeShowcase />
						<div
							v-if="user?.activities && user.activities.length > 0"
							class="w-full"
						>
							<MSurface class="gap-3">
								<MSectionHeader
									title="Your Activities"
									:count="user.activities.length"
								/>
								<div class="flex flex-wrap items-center gap-2">
									<LazyActivityCircle
										v-for="activity in user.activities"
										:key="activity.id"
										:activity="activity"
									/>
								</div>
							</MSurface>
						</div>
						<WidgetsMSavedWordsBlock />
					</MModuleRail>

					<div
						v-if="user && (onboarding.state.value || onboarding.error.value)"
						class="w-full px-3"
					>
						<OnboardingMWelcomeChecklist @open-persona="personaOpen = true" />
						<OnboardingMPersonaPicker v-model="personaOpen" />
					</div>

					<MSectionHeader
						title="Your Feed"
						class="w-full px-4 pt-2"
					/>

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
							:key="`${item.type}-${isGrouped(item) ? 'group' : 'single'}-${index}`"
						>
							<MInfoCardGroup
								v-if="item.type === 'activity' && isGrouped(item)"
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
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'activity' && item.data[0]"
								class="w-11/12"
							>
								<LazyActivityMCard
									:activity="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'prompt' && isGrouped(item)"
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
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'prompt' && item.data[0]"
								class="w-11/12"
							>
								<LazyPromptMCard
									:prompt="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'article' && isGrouped(item)"
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
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'article' && item.data[0]"
								class="w-11/12"
							>
								<LazyArticleMCard
									:article="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'event' && isGrouped(item)"
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
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'event' && item.data[0]"
								class="w-11/12"
							>
								<LazyEventMCard
									:event="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<MInfoCardGroup
								v-else-if="item.type === 'user' && isGrouped(item)"
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
								/>
							</MInfoCardGroup>
							<div
								v-else-if="item.type === 'user' && item.data[0]"
								class="w-11/12"
							>
								<LazyUserMCard
									:user="item.data[0]"
									hydrate-on-visible
								/>
							</div>
							<div
								v-if="widgetForIndex(index)"
								class="w-11/12"
							>
								<LazyMWidgetSlot
									:kind="widgetForIndex(index)!"
									topic="daily"
									hydrate-on-visible
								/>
							</div>
						</template>
						<MEmptyState
							v-if="renderableFeedItems.length === 0"
							icon="mdi:rss"
							title="Your Feed is Empty"
							description="Pick a few activities you care about and fresh content will start showing up here."
							cta-label="Explore Activities"
							cta-icon="mdi:compass-outline"
							cta-to="/tabs/discover"
						/>
						<FeedMCaughtUp
							v-if="feedCapReached && renderableFeedItems.length > 0"
							class="w-11/12"
							:reason="feedCapReason"
							@keep-browsing="handleKeepBrowsing"
						/>
						<IonInfiniteScroll
							:disabled="feedCapReached"
							@ionInfinite="onInfinite"
							threshold="40%"
						>
							<IonInfiniteScrollContent />
						</IonInfiniteScroll>
					</div>

					<OnboardingMUsernamePrompt
						ref="usernamePromptRef"
						@closed="handleUsernamePromptClosed"
					/>
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
import { MIN_GROUP_ITEMS, shouldGroup } from '~/utils/feed';

// run non-critical work after first paint; idle callback when available, microtask-ish fallback otherwise
function whenIdle(cb: () => void) {
	const ric = (globalThis as any).requestIdleCallback as
		((c: () => void, opts?: { timeout?: number }) => number) | undefined;
	if (typeof ric === 'function') {
		ric(cb, { timeout: 2000 });
	} else {
		setTimeout(cb, 1);
	}
}

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
	| { type: 'user'; isGroup: boolean; data: User[] };

type ContentType = FeedItem['type'];

const { user, avatar128, fetchUser, fetchRecommendedActivities } = useAuth();
const { widgetForIndex } = useFeedWidgets();
const { motd, fetchMotd } = useMotd();
const { settings: appSettings, init: initSettings } = useAppSettings();
const { startTour, startTourIfNew, hasCompleted } = useSiteTour();
const { unreadCount, fetchNotifications } = useNotifications();
const ionRouter = useIonRouter();

const MOTD_TINTS: Record<string, string> = {
	info: 'border-info/30! bg-info/10',
	warning: 'border-warning/30! bg-warning/10',
	error: 'border-error/30! bg-error/10'
};

const motdTint = computed(
	() => MOTD_TINTS[motd.value?.type ?? ''] ?? 'border-primary/30! bg-primary/10'
);

// #region identity strip + today band

const userId = computed(() => user.value?.id);
// both read shared stores the rail's modules already fetch, so neither adds a request
const { quest: currentQuest } = useUser(userId);
const { quest: dailyQuest } = useDailyQuest();
const { natureMinutes } = useTrails();
// written by MJourneyHero, which owns the journey fetch
const journeyStreak = useState<number>('dashboard-journey-streak', () => 0);

const TODAY_AMBIENT_HEIGHT = 190;
// account data, never a device value: the same account always paints the same scene
const ambientSeed = computed(() => user.value?.id ?? 'earth');

const greeting = computed(() => (user.value?.username ? `@${user.value.username}` : 'Welcome!'));
const profileHref = computed(() =>
	user.value?.username ? `/tabs/profile/@${user.value.username}` : '/tabs/profile/editor'
);
// presence, not a tally: a number on a persistent badge is a count to clear, and the inbox itself
// is where the count belongs
const notificationsLabel = computed(() =>
	unreadCount.value > 0 ? 'Notifications, Unread' : 'Notifications'
);
const showReopenOnboarding = computed(() => Boolean(user.value) && !onboarding.isComplete.value);

const questSteps = computed(() => currentQuest.value?.quest?.steps?.length ?? 0);
const questStat = computed(() => {
	if (!currentQuest.value || questSteps.value === 0) return '-';
	return `${Math.min(currentQuest.value.currentStepIndex, questSteps.value)}/${questSteps.value}`;
});
const natureStat = computed(() => `${Math.round(natureMinutes.value?.minutes ?? 0)}m`);

const todayHeadline = computed(() => {
	if (currentQuest.value) return currentQuest.value.quest.title;
	if (dailyQuest.value) return dailyQuest.value.title;
	return 'Find Your First Quest';
});

const todaySubline = computed(() => {
	if (currentQuest.value) return 'Your quest is waiting where you left it.';
	if (dailyQuest.value) return "Today's quest is ready when you are.";
	return 'Pick an activity you already enjoy and the app builds around it.';
});

const todayCtaLabel = computed(() => {
	if (currentQuest.value) return 'Continue Quest';
	if (dailyQuest.value) return "Start Today's Quest";
	return 'Browse Quests';
});

function openTodayCta() {
	if (currentQuest.value) {
		ionRouter.navigate(`/tabs/quests/${currentQuest.value.questId}`, 'forward', 'push');
		return;
	}
	if (dailyQuest.value) {
		ionRouter.navigate(`/tabs/quests/${dailyQuest.value.id}`, 'forward', 'push');
		return;
	}
	ionRouter.navigate('/tabs/quests', 'forward', 'push');
}

function openNotifications() {
	ionRouter.navigate('/tabs/profile/notifications', 'forward', 'push');
}

// #endregion

const contentRef = ref<any>(null);
const scrollContainerEl = ref<HTMLElement | null>(null);
const textSizePromptRef = ref<{ maybeOpen: () => void } | null>(null);
const usernamePromptRef = ref<{ maybeOpen: () => void } | null>(null);
const feedItems = ref<FeedItem[]>([]);
const renderableFeedItems = computed(() =>
	feedItems.value.filter((i) => Array.isArray(i.data) && i.data.length > 0)
);

function isGrouped(item: FeedItem): boolean {
	return shouldGroup(item.data as any[], item.isGroup);
}

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

// finite-session ceiling; past the soft cap the feed stops auto-loading and shows a calm exit cue
const feedCap = useFeedSessionCap();
const { capReached: feedCapReached, capReason: feedCapReason } = feedCap;

// soft-cap escape hatch; user chose to keep scrolling, so extend the session and load a little more
async function handleKeepBrowsing() {
	feedCap.keepBrowsing();
	await loadMoreItems(isDataConstrained.value ? 2 : 3);
}

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

// the oauth username step opens first (when pending); on close it hands off to the
// text-size prompt so the two onboarding sheets never stack
let textSizeTriggeredFromUsername = false;
function handleUsernamePromptClosed() {
	if (textSizeTriggeredFromUsername) return;
	textSizeTriggeredFromUsername = true;
	if (!user.value) return;
	if (hasCompleted('welcome')) return; // text-size + tour only run for pre-welcome users
	textSizePromptRef.value?.maybeOpen();
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

// 8s of budget, matching the prompt's own user wait; the old 2s silently skipped the step on a
// starved runner
const PROMPT_REF_POLL_TRIES = 80;
const PROMPT_REF_POLL_MS = 100;

let onboardingChainStarted = false;
async function startOnboardingChain() {
	if (onboardingChainStarted || !user.value) return;
	onboardingChainStarted = true;
	if (!hasCompleted('welcome')) await loadResumeStep();
	// the prompt lives in a <ClientOnly> that can mount late on native/webkit, so poll
	// for the ref instead of a fixed delay; a null ref at a fixed timeout silently skips it
	await nextTick();
	for (let i = 0; i < PROMPT_REF_POLL_TRIES && !usernamePromptRef.value; i++) {
		await new Promise((resolve) => setTimeout(resolve, PROMPT_REF_POLL_MS));
	}
	if (!usernamePromptRef.value) {
		// release the latch: bailing while holding it dropped the whole chain permanently, and a
		// starved runner really does take longer than the old 2s budget to mount the prompt
		onboardingChainStarted = false;
		return;
	}
	// no user check here on purpose; maybeOpen waits out the transient null currentUser that
	// follows an oauth hydrate, and re-checking it here is what dropped the step
	usernamePromptRef.value.maybeOpen();
}

watch(
	() => !!user.value,
	(present) => {
		if (present) void startOnboardingChain();
	}
);

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
			feedItem = { type, isGroup: shouldGroup(data, isGroup), data };
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
			feedItem = { type, isGroup: shouldGroup(data, isGroup), data };
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
			feedItem = { type, isGroup: shouldGroup(data, isGroup), data };
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
			feedItem = { type, isGroup: shouldGroup(data, isGroup), data };
		}

		// prerender routes
		for (const event of data) {
			if (shouldPreloadRoutes.value) {
				preloadRouteComponents(`/tabs/events/${event.id}`);
			}
		}
	} else if (type === 'user') {
		// users always aim for a group; a single card is the fallback when only one survives dedupe
		const raw = await fetchContent(type, Math.max(2, requestCount), useRecommended);
		const data = dedupeData(type, raw).slice(0, Math.max(MIN_GROUP_ITEMS, count));
		if (data.length > 0) {
			recordShownIds(type, data);
			feedItem = { type, isGroup: shouldGroup(data), data };
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

		const before = feedItems.value.length;
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
		// count what actually rendered toward the finite-session ceiling
		const added = feedItems.value.length - before;
		if (added > 0) void feedCap.note(added);
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
	// past the soft cap the caught-up cue takes over; don't keep pulling content
	if (feedCap.capReached.value) {
		(event.target as any).complete();
		return;
	}
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
	// pull-to-refresh is an explicit fresh start, so re-arm the finite-session ceiling
	feedCap.resetSession();
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

	if (user.value) void onboarding.fetchState();

	// hydrate the daily ceiling before the first batch so notes aren't clobbered by a late load
	await feedCap.load();

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

	void startOnboardingChain();

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

		// critical: active quest (primes the quests tab via the shared store) + points feed the
		// above-the-fold hero; everything else is below-the-fold and can wait for idle time
		fetchUserQuest();
		fetchPoints();

		// deferred: cosmetics/badges/mastery/events render lower in the page, so don't compete
		// with first paint or the feed; run them once the main thread is idle
		whenIdle(() => {
			fetchQuestHistory();
			fetchCosmetics();
			fetchBadges();
			fetchMasteryList();
			fetchAttendingEvents();
			fetchEventSubmissions();
		});
	}
});
</script>
