<template>
	<div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">
		<UserMJourneyProgress
			v-if="!loading"
			icon="mdi:leaf"
			title="Activities"
			:count="activity"
			:total="totalActivities"
			help="Visit and read about activities to increase this number."
		/>
		<UserJourneyProgressSkeleton v-else />
		<UserMJourneyProgress
			v-if="!loading"
			icon="mdi:pencil"
			title="Prompts"
			:count="prompt"
			help="Respond to prompts to increase this number."
		/>
		<UserJourneyProgressSkeleton v-else />
		<UserMJourneyProgress
			v-if="!loading"
			icon="mdi:newspaper"
			title="Articles"
			:count="article"
			help="Read articles to increase this number."
		/>
		<UserJourneyProgressSkeleton v-else />
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import type { User } from '@earth-app/crust/src/shared/types/user';

const props = defineProps<{
	user: User;
}>();

const loading = ref(false);
const activity = ref(0);
const prompt = ref(0);
const article = ref(0);
const { count: totalActivities } = useActivitiesCount();

onMounted(async () => {
	loading.value = true;

	// Retrieve journey values
	const values: [
		Ref<number>,
		() => Promise<{
			data?: { count: number } | { code: number; message: string };
			success: boolean;
			message?: string;
		}>
	][] = [
		[activity, async () => await getCurrentJourneyM('activity', props.user.id)],
		[prompt, async () => await getCurrentJourneyM('prompt', props.user.id)],
		[article, async () => await getCurrentJourneyM('article', props.user.id)]
	];

	Promise.all(
		values.map(async ([ref, fn]) => {
			const res = await fn();
			if (res.success && res.data) {
				if ('message' in res.data) {
					await Toast.show({
						text: res.data.message || 'Failed to fetch journey data.',
						duration: 'long'
					});
				} else {
					ref.value = res.data.count;
				}
			} else {
				await Toast.show({
					text: res.message || 'Failed to fetch journey data.',
					duration: 'long'
				});
			}
		})
	).finally(() => {
		loading.value = false;
	});
});
</script>
