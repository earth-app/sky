<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/profile/editor" />
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
					class="w-full max-w-2xl px-4 mt-2"
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
import { Toast } from '@capacitor/toast';
import type { Event } from 'types/event';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const { user } = useAuth();
const route = useRoute();

const relatedLoaded = ref(false);
const relatedEvents = ref<Event[]>([]);
const unavailableOffline = ref(false);

// event auto-deletion happens once the event has already ended — only show the
// countdown after end_date has passed so we don't confuse "the event is over"
// with "the event is starting soon."
const eventExpiresAt = computed(() => {
	const e = event.value;
	if (!e?.end_date || !e.timing?.has_passed) return null;
	return computeContentExpiry('event', Math.floor(e.end_date / 1000));
});

const { event, fetch, fetchSimilar } = useEvent(route.params.id as string, makeMServerRequest);
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
		await loadSimilar();
	}
});

async function loadSimilar() {
	if (!user.value) return;
	relatedLoaded.value = false;

	const res = await fetchSimilar();
	if (valid(res)) {
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
