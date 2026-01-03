<template>
	<div class="flex flex-col w-full items-center justify-center mt-4">
		<IonRefresher
			slot="fixed"
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
				v-if="cards.length === 0"
				v-for="n in 6"
				:key="`skeleton-${n}`"
			/>

			<ClientOnly>
				<MInfoCard
					v-for="(card, index) in cards"
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
import type { Activity } from '@earth-app/crust/src/shared/types/activity';

const props = defineProps<{
	activity: Activity;
}>();

const { cards, loadCardsForActivity } = useActivityCardsM();

async function handleRefresh(event: CustomEvent) {
	cards.value = [];
	await loadCardsForActivity(props.activity);
	event.detail.complete();
}

// reload when the activity changes (name or aliases)
watch(
	() => [props.activity?.name, props.activity?.aliases?.join(',') || ''],
	() => {
		loadCardsForActivity(props.activity);
	},
	{ immediate: true }
);
</script>
