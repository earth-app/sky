<template>
	<IonPage>
		<IonContent
			v-if="activity"
			:scroll-y="true"
		>
			<Back />
			<ActivityMProfile :activity="activity" />
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
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const route = useRoute();
const { activity, fetch } = useActivity(route.params.id as string);
onMounted(() => {
	fetch();
});

// User Journey

const { user } = useAuth();
const { count: totalActivities, refresh: refreshCount } = useActivitiesCount();
watch(activity, (newActivity) => {
	if (newActivity) {
		refreshCount();
	}
});

onMounted(async () => {
	if (!route.params.id) return;

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
