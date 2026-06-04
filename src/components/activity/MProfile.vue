<template>
	<div class="flex flex-col w-full items-center justify-center mt-4">
		<IonRefresher
			slot="fixed"
			:disabled="offlineMode"
			@ionRefresh="handleRefresh"
		>
			<IonRefresherContent />
		</IonRefresher>
		<UIcon
			v-if="activity.fields['icon']"
			:name="activity.fields['icon']"
			id="activity-icon"
			size="6rem"
			class="mb-2 mt-8"
		/>
		<div class="flex flex-col items-center justify-center">
			<h1 class="text-4xl! font-bold">{{ activity.name }}</h1>

			<div class="flex items-center justify-center gap-4 mt-2">
				<IonButton
					v-if="questState === 'not_started'"
					size="small"
					color="primary"
					:router-link="`/tabs/quests/${questId}`"
				>
					<UIcon
						name="mdi:sword"
						class="size-5 mr-1"
					/>
					View Quest
				</IonButton>

				<IonButton
					v-else-if="questState === 'in_progress'"
					size="small"
					color="warning"
					:router-link="`/quests/${questId}`"
				>
					<UIcon
						name="mdi:shield-sword"
						class="size-5 mr-1"
					/>
					Continue Quest
				</IonButton>

				<IonButton
					v-else-if="questState === 'completed'"
					size="small"
					color="success"
					:router-link="`/quests/${questId}`"
				>
					<UIcon
						name="mdi:shield-crown"
						class="size-5 mr-1"
					/>
					View Completed Quest
				</IonButton>

				<IonButton
					fill="outline"
					size="small"
					color="secondary"
					@click="startTour('activities')"
				>
					<UIcon
						name="mdi:progress-question"
						class="size-5"
					/>
				</IonButton>
			</div>
		</div>
		<h3
			class="text-md min-w-85 w-4/5 mt-8 font-normal!"
			id="activity-description"
		>
			{{ activity.description }}
		</h3>
		<IonCard
			v-if="showNoveltyHint"
			id="activity-novelty-hint"
			color="tertiary"
			class="min-w-85 w-4/5 mt-4 mb-2 p-3 flex items-start gap-2 border border-tertiary/40"
		>
			<UIcon
				name="mdi:lightbulb-on-outline"
				class="size-5 shrink-0 mt-0.5"
			/>
			<div class="flex flex-col gap-1 flex-1 min-w-0">
				<p class="text-sm font-medium m-0!">A note on what you'll see here</p>
				<p class="text-xs leading-snug m-0! opacity-90">
					Some cards may drift away from
					<span class="font-medium">{{ activity.name }}</span>
					and that's intentional. The Earth App is built around novelty; those tangents are how you
					bump into something new.
				</p>
			</div>
			<IonButton
				fill="clear"
				size="small"
				color="light"
				aria-label="Dismiss hint"
				class="m-0! shrink-0"
				@click="dismissNoveltyHint"
			>
				<UIcon
					name="mdi:close"
					class="size-4"
				/>
			</IonButton>
		</IonCard>
		<div
			id="activity-cards"
			class="flex flex-col justify-center gap-4 px-4 w-full"
		>
			<!-- Skeleton Loading Cards -->
			<InfoCardSkeleton
				v-if="cards.length === 0 && !offlineMode"
				v-for="n in 6"
				:key="`skeleton-${n}`"
			/>

			<p
				v-if="cards.length === 0 && offlineMode"
				class="text-center text-gray-500 text-sm mt-2"
			>
				Reference cards are unavailable for this download.
			</p>

			<ClientOnly>
				<template
					v-for="(card, index) in displayCards"
					:key="`card-${index}`"
				>
					<MInfoCard
						class="z-20"
						:id="`card-${index}`"
						:icon="card.icon"
						:external="true"
						:title="card.title"
						:subtitle="card.description"
						:subtitle-link="card.descriptionLink"
						:content="card.content"
						:link="card.link"
						:image="card.image"
						:image-link="card.imageLink"
						:object="{ url: card.object, type: card.objectType }"
						:youtube-id="card.youtubeId"
						:video="card.video"
						:footer="card.footer"
						in-browser
					/>
					<!-- interleave a widget after every 6 cards; activity-aware so prompts get tuned questions -->
					<LazyMWidgetSlot
						v-if="cardWidgetKind(index)"
						:kind="cardWidgetKind(index)!"
						:activity="{ id: activity.id, name: activity.name }"
						hydrate-on-visible
					/>
				</template>
			</ClientOnly>
		</div>

		<ClientOnly>
			<MSiteTour
				:steps="activityTour"
				name="Activity Tour"
				tour-id="activities"
				:pulse="true"
			/>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';
import type { Activity } from 'types/activity';

const NOVELTY_HINT_KEY = 'sky:activity-novelty-hint-dismissed';

type ActivityProfileCard = {
	title: string;
	icon: string;
	description?: string;
	descriptionLink?: string;
	content?: string;
	object?: string;
	objectType?: string;
	link?: string;
	image?: string;
	imageLink?: string;
	image_offline?: string;
	video?: string;
	youtubeId?: string;
	footer?: string;
};

const props = defineProps<{
	activity: Activity;
	offlineMode?: boolean;
	offlineCards?: ActivityProfileCard[];
}>();

const { user } = useAuth();
const { cards, loadCardsForActivity } = useActivityCards(makeMServerRequest);
const { widgetForIndex } = useFeedWidgets();
const offlineMode = computed(() => Boolean(props.offlineMode));

const noveltyHintDismissed = ref(true); // default hidden until we read Preferences to avoid a flash
const showNoveltyHint = computed(() => !noveltyHintDismissed.value && !offlineMode.value);

onMounted(async () => {
	try {
		const { value } = await Preferences.get({ key: NOVELTY_HINT_KEY });
		noveltyHintDismissed.value = value === '1';
	} catch {
		noveltyHintDismissed.value = false;
	}
});

async function dismissNoveltyHint() {
	noveltyHintDismissed.value = true;
	try {
		await Preferences.set({ key: NOVELTY_HINT_KEY, value: '1' });
	} catch {
		// best-effort; the in-memory flag still hides it for this session
	}
}

// shift the rotation index by an activity-id hash so different activities don't all show
// the same widget kind at the same card position
const activityIdHash = computed(() =>
	(props.activity?.id ?? '').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
);
function cardWidgetKind(index: number): FeedWidgetKind | null {
	// widget every 6th card (index 5, 11, 17, ...) matches crust Profile.vue cadence
	if ((index + 1) % 6 !== 0) return null;
	const shifted = 7 + (Math.floor((index + 1) / 6) - 1 + (activityIdHash.value % 8)) * 8;
	return widgetForIndex(shifted);
}

const normalizedOfflineCards = computed<ActivityProfileCard[]>(() => {
	return (props.offlineCards || []).slice(0, 10).map((card) => ({
		...card,
		image: card.image_offline || card.image
	}));
});

const displayCards = computed<ActivityProfileCard[]>(() => {
	return cards.value.map((card) => ({
		...card,
		image: card.image,
		link: offlineMode.value ? undefined : card.link,
		video: offlineMode.value ? undefined : card.video,
		youtubeId: offlineMode.value ? undefined : card.youtubeId
	}));
});

async function loadProfileCards() {
	if (offlineMode.value) {
		cards.value = [...normalizedOfflineCards.value];
		return;
	}

	await loadCardsForActivity(props.activity);
}

async function handleRefresh(event: CustomEvent) {
	if (offlineMode.value) {
		event.detail.complete();
		return;
	}

	cards.value = [];
	await loadCardsForActivity(props.activity);
	event.detail.complete();
}

// reload when the activity changes (name or aliases)
watch(
	() => [
		props.activity?.name,
		props.activity?.aliases?.join(',') || '',
		offlineMode.value,
		props.offlineCards?.length || 0
	],
	() => {
		void loadProfileCards();
	},
	{ immediate: true }
);

// activity tour

const { startTour } = useSiteTour();

const activityTour: SiteTourStep[] = [
	{
		id: 'activity-icon',
		title: `Welcome to ${props.activity.name}`,
		description:
			"Activities are hobbies, sports, and interests you can explore on the Earth App. Each one has its own page with curated guides, resources, and — if you're up for it — a quest.",
		footer: 'Even if this one is new to you, give it a few cards and see if it sticks.',
		icon: 'mdi:run-fast',
		placement: 'bottom'
	},
	{
		id: 'activity-description',
		title: 'What This Activity Is',
		description: `A short overview of ${props.activity.name}. Scan this first to get the gist before diving into the cards below.`,
		footer: 'Admins can edit this description as the activity evolves.',
		icon: 'mdi:information-outline'
	},
	{
		id: 'activity-cards',
		title: 'Resources & Guides',
		waitFor: 'card-0',
		waitTimeout: 4000,
		description:
			'Each card is a curated resource — a guide, a video, an article, a useful link, or a quick how-to. Tap a card to open it.',
		footer: 'Cards load progressively. Pull to refresh for a fresh shuffle.',
		icon: 'mdi:cards-outline',
		highlightPadding: 12
	}
];

// activity quest

const { fetchQuest } = useQuests();
const quest = ref<Quest | null>(null);
const questId = `activity_quest_${props.activity.id}`;
const questState = ref<'not_started' | 'completed' | 'in_progress' | null>(null);
const inProgressQuestProgress = ref<UserQuestProgress | null>(null);
const completedQuestProgress = ref<QuestHistoryEntry | null>(null);

async function loadQuest() {
	if (!quest.value) {
		quest.value = await fetchQuest(questId);
		if (!quest.value) {
			// no quest for this activity
			questState.value = null;
			console.warn(`No quest found for activity "${props.activity.id}"`);
			return;
		}
	}

	if (!user.value) return;

	// load user's progress on this quest
	const {
		quest: currentQuest,
		fetchUserQuest,
		questHistory,
		fetchQuestHistory
	} = useUser(user.value?.id);
	const currentProgress = currentQuest.value || (await fetchUserQuest());

	if (quest.value.id === currentProgress?.questId) {
		if (currentProgress.completed) {
			questState.value = 'completed';
			completedQuestProgress.value = questHistory.value?.get(questId) || null;
		} else {
			questState.value = 'in_progress';
			inProgressQuestProgress.value = currentProgress;
		}
	} else {
		const history = questHistory.value || (await fetchQuestHistory());
		const completedEntry = history.get(questId);
		questState.value = completedEntry ? 'completed' : 'not_started';

		if (completedEntry) {
			completedQuestProgress.value = completedEntry;
		}
	}
}

onMounted(() => {
	loadQuest();
});
</script>
