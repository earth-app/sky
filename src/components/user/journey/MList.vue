<template>
	<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
		<UserJourneyMProgress
			v-if="!loading"
			icon="mdi:leaf"
			title="Activities"
			:count="state.activity.count"
			:total="totalActivities"
			help="Visit and read about activities to increase this number."
		/>
		<UserJourneyProgressSkeleton v-else />
		<UserJourneyMProgress
			v-if="!loading"
			icon="mdi:pencil"
			title="Prompts"
			:count="state.prompt.count"
			:rank="state.prompt.rank"
			help="Respond to prompts to increase this number."
			type="prompt"
		/>
		<UserJourneyProgressSkeleton v-else />
		<UserJourneyMProgress
			v-if="!loading"
			icon="mdi:newspaper"
			title="Articles"
			:count="state.article.count"
			:rank="state.article.rank"
			help="Read articles to increase this number."
			type="article"
		/>
		<UserJourneyProgressSkeleton v-else />
		<UserJourneyMProgress
			v-if="!loading"
			icon="mdi:calendar-star"
			title="Events"
			:count="state.event.count"
			:rank="state.event.rank"
			help="Attend events to increase this number."
			type="event"
		/>
		<UserJourneyProgressSkeleton v-else />
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import type { User } from 'types/user';

const props = defineProps<{
	user: User;
}>();

const { fetchCurrentJourney, fetchCurrentJourneyRank } = useAuth(makeMServerRequest);

const loading = ref(false);
const state = reactive({
	activity: { count: 0 },
	prompt: { rank: 0, count: 0 },
	article: { rank: 0, count: 0 },
	event: { rank: 0, count: 0 }
});
const { count: totalActivities } = useActivitiesCount();

onMounted(async () => {
	loading.value = true;

	// Retrieve journey values
	const journeyTypes = ['activity', 'event', 'prompt', 'article'] as const;

	await Promise.all(
		journeyTypes.map(async (type) => {
			// Fetch count
			const countRes = await fetchCurrentJourney(type, props.user.id);
			if (countRes.success && countRes.data) {
				if ('count' in countRes.data) {
					state[type].count = countRes.data.count;
				}
			} else {
				await Toast.show({
					text: countRes.message || 'Failed to fetch journey data.',
					duration: 'long'
				});
			}

			// fetch rank
			if (type !== 'activity') {
				const rankRes = await fetchCurrentJourneyRank(type, props.user.id);
				if (rankRes.success && rankRes.data && 'rank' in rankRes.data) {
					state[type].rank = rankRes.data.rank;
				}
			}
		})
	);

	loading.value = false;
});
</script>
