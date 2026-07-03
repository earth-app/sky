<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/profile/editor" />
				</IonButtons>

				<IonButtons
					slot="end"
					class="gap-2 mx-2"
				>
					<ReportMButton
						v-if="event && user"
						content-type="event"
						:content-id="event.id"
					/>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div
				v-if="event"
				class="flex flex-col items-center w-full h-full"
			>
				<ContentTTLNotice
					v-if="eventExpiresAt"
					kind="event"
					variant="countdown"
					:expires-at="eventExpiresAt"
					class="w-full max-w-2xl px-4 mt-2 min-h-24"
				/>
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
						<LazyEventMCard
							v-else
							v-for="event in relatedEvents"
							:key="event.id"
							:event="event"
							hydrate-on-visible
						/>
					</MInfoCardGroup>
				</div>
				<!-- per-event mood bucket near the bottom of the page -->
				<div class="w-full max-w-2xl px-4 my-3">
					<LazyMWidgetSlot
						kind="MoodSpark"
						:topic="`event-${event.id}`"
						hydrate-on-visible
					/>
				</div>
			</div>
			<div
				v-else-if="unavailableOffline"
				class="h-screen flex flex-col"
			>
				<div class="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-2">
					<h2 class="text-xl font-semibold">Event unavailable offline</h2>
					<p class="text-gray-500 text-sm">Connect once to browse this event while online.</p>
				</div>
			</div>
			<div
				v-else
				class="h-screen"
			>
				<div class="flex items-center justify-center h-full pb-8">
					<IonSpinner name="crescent" />
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import type { Event } from 'types/event';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const { user } = useAuth();
const route = useRoute();

const relatedLoaded = ref(false);
const relatedEvents = ref<Event[]>([]);
const unavailableOffline = ref(false);

// event auto-deletion happens once the event has already ended
const eventExpiresAt = computed(() => {
	const e = event.value;
	if (!e?.end_date || !e.timing?.has_passed) return null;
	return computeContentExpiry('event', Math.floor(e.end_date / 1000));
});

const { event, fetch, fetchSimilar } = useEvent(route.params.id as string, makeMServerRequest);
const eventStore = useEventStore();
onMounted(async () => {
	if (isOffline.value) {
		unavailableOffline.value = true;
		return;
	}

	await eventStore.fetchEvent(route.params.id as string, true);
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
		await loadSimilar();
	}
});

async function loadSimilar() {
	if (!user.value) return;
	relatedLoaded.value = false;

	const res = await fetchSimilar();
	if (valid(res)) {
		relatedEvents.value = res.data;
	} else {
		console.warn('Failed to load similar events:', res.message);
		relatedEvents.value = [];
	}
	relatedLoaded.value = true;
}
</script>
