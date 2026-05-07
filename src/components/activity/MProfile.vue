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
			size="6rem"
			class="mb-2 mt-8"
		/>
		<div class="flex flex-col items-center justify-center">
			<h1 class="text-4xl! font-bold">{{ activity.name }}</h1>

			<IonButton
				v-if="questState === 'not_started'"
				size="small"
				color="primary"
				class="mt-2"
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
				class="mt-2"
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
				class="mt-2"
				:router-link="`/quests/${questId}`"
			>
				<UIcon
					name="mdi:shield-crown"
					class="size-5 mr-1"
				/>
				View Completed Quest
			</IonButton>
		</div>
		<h3 class="text-md min-w-85 w-4/5 mt-8 font-normal!">{{ activity.description }}</h3>
		<div class="flex flex-col justify-center gap-4 px-4 w-full">
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
				<MInfoCard
					v-for="(card, index) in displayCards"
					class="z-20"
					:key="`card-${index}`"
					:icon="card.icon"
					:external="true"
					:title="card.title"
					:subtitle="card.description"
					:content="card.content"
					:link="card.link"
					:image="card.image"
					:youtube-id="card.youtubeId"
					:video="card.video"
					:footer="card.footer"
				/>
			</ClientOnly>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Activity } from 'types/activity';

type ActivityProfileCard = {
	title: string;
	icon: string;
	description?: string;
	content?: string;
	link?: string;
	image?: string;
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
const { cards, loadCardsForActivity } = useActivityCardsM();
const offlineMode = computed(() => Boolean(props.offlineMode));

const normalizedOfflineCards = computed<ActivityProfileCard[]>(() => {
	return (props.offlineCards || []).slice(0, 10).map((card) => ({
		...card,
		image: card.image_offline || card.image
	}));
});

const displayCards = computed<ActivityProfileCard[]>(() => {
	return cards.value.map((card) => ({
		...card,
		image: card.image_offline || card.image,
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
