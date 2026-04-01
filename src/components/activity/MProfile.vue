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
</script>
