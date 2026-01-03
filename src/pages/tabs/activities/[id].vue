<template>
	<IonPage>
		<IonContent
			v-if="currentActivity"
			:scroll-y="true"
		>
			<Back />
			<ActivityMProfile :activity="currentActivity" />
		</IonContent>
		<div
			v-else
			class="h-screen"
		>
			<Back class="self-start" />
			<div class="flex items-center justify-center h-full pb-8">
				<IonSpinner name="crescent" />
			</div>
		</div>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { type Activity } from '@earth-app/crust/src/shared/types/activity';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const route = useRoute();
const currentActivity = ref<Activity | null>(null);

async function loadActivity(id?: string) {
	if (!id) return;
	const res = await getActivity(id);

	if (res.success && res.data) {
		if ('message' in res.data) {
			await Toast.show({
				text: res.data.message || 'An unknown error occurred.',
				duration: 'long'
			});

			currentActivity.value = null;
		} else {
			currentActivity.value = res.data;
		}
	} else {
		currentActivity.value = null;
	}
}

// User Journey

const { user } = useAuth();
const { count: totalActivities, refresh: refreshCount } = useActivitiesCount();

onMounted(async () => {
	if (!route.params.id) return;
	await loadActivity(route.params.id as string);

	if (!user.value) return;
	if (totalActivities.value === null) {
		await refreshCount();
	}

	const count = await getCurrentJourneyM('activity', user.value.id);
	if (!count.success || !count.data) return; // silently ignore errors
	if ('message' in count.data) return;

	const res = await tapCurrentJourneyM('activity', route.params.id as string);
	if (!res.success || !res.data) return; // silently ignore errors
	if ('message' in res.data) return;

	if (count.data.count === res.data.count) return; // no change

	await Toast.show({
		text: `You have now found ${res.data.count}/${totalActivities.value} activities on your journey. Keep going!`,
		duration: 'long'
	});
});
</script>
