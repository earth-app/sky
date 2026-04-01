<template>
	<IonPage>
		<IonContent :scroll-y="true">
			<div
				v-if="event"
				class="flex flex-col items-center w-full h-full pt-12 sm:pt-0"
			>
				<Back class="self-start" />
				<EventMPage :event="event" />
				<div class="flex items-center w-screen">
					<MInfoCardGroup
						title="Related Events"
						description="Events similar to this one"
						icon="mdi:calendar-multiple"
						show-dots
					>
						<InfoCardSkeleton
							v-if="!relatedLoaded"
							v-for="n in 3"
							:key="n"
						/>
						<EventMCard
							v-else
							v-for="event in relatedEvents"
							:key="event.id"
							:event="event"
						/>
					</MInfoCardGroup>
				</div>
			</div>
			<div
				v-else-if="unavailableOffline"
				class="h-screen flex flex-col"
			>
				<Back class="self-start" />
				<div class="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-2">
					<h2 class="text-xl font-semibold">Event unavailable offline</h2>
					<p class="text-gray-500 text-sm">Connect once to browse this event while online.</p>
				</div>
			</div>
			<div
				v-else
				class="h-screen"
			>
				<Back class="self-start" />
				<div class="flex items-center justify-center h-full pb-8">
					<IonSpinner name="crescent" />
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import type { Event } from 'types/event';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const { user } = useAuth();
const route = useRoute();

const relatedLoaded = ref(false);
const relatedEvents = ref<Event[]>([]);
const unavailableOffline = ref(false);

const { event, fetch } = useEvent(route.params.id as string);
onMounted(() => {
	if (isOffline.value) {
		unavailableOffline.value = true;
		return;
	}

	fetch();
});

watch(isOffline, (offline) => {
	if (offline) {
		unavailableOffline.value = true;
		return;
	}

	unavailableOffline.value = false;
	fetch();
});

watch(event, async (newEvent) => {
	if (newEvent) {
		await loadSimilar(newEvent);
	}
});

async function loadSimilar(event?: Event) {
	if (!event) return;
	if (!user.value) return;
	relatedLoaded.value = false;

	const res = await getSimilarEventsM(event);
	if (res.success && res.data) {
		relatedEvents.value = res.data;
		relatedLoaded.value = true;
	} else {
		console.error('Failed to load similar events:', res.message);
		relatedLoaded.value = true;

		await Toast.show({
			text: res.message || 'Failed to load similar events.',
			duration: 'long'
		});
	}
}
</script>
