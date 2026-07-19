<template>
	<div
		v-if="visible"
		class="w-full max-w-2xl mx-auto px-4 mb-4"
	>
		<IonCard :color="theme">
			<div class="flex items-center gap-4 p-4">
				<TrailMNatureRing
					v-if="natureMinutes"
					:minutes="natureMinutes.minutes"
					:target="natureMinutes.target"
					:best="natureMinutes.best"
					:size="84"
				/>
				<div class="flex flex-col gap-1 min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<UIcon
							name="mdi:leaf"
							class="size-5 text-success"
						/>
						<h3 class="text-sm font-semibold m-0! tracking-wide opacity-80">Nature Minutes</h3>
					</div>
					<p class="text-xs opacity-60">
						{{ remainingLabel }}
					</p>
					<div class="flex flex-wrap items-center gap-2 mt-1">
						<IonButton
							size="small"
							color="primary"
							@click="goToTrails"
						>
							<UIcon
								name="mdi:map-marker-path"
								class="size-4 mr-1"
							/>
							Browse Trails
						</IonButton>
						<IonButton
							v-if="healthKitSupported"
							size="small"
							fill="outline"
							color="success"
							:disabled="syncing"
							@click="onSync"
						>
							<IonSpinner
								v-if="syncing"
								name="crescent"
								class="size-4 mr-1"
							/>
							<UIcon
								v-else
								name="mdi:heart-pulse"
								class="size-4 mr-1"
							/>
							Sync Apple Health
						</IonButton>
					</div>
				</div>
			</div>
		</IonCard>
	</div>
</template>

<script setup lang="ts">
import { theme } from '~/composables/useSettings';

const { user } = useAuth();
const { natureMinutes, syncing, healthKitSupported, fetchNatureMinutes, syncFromHealthKit } =
	useNatureMinutes();

const hasLoaded = ref(false);
// only show once a fetch returns so the ring doesn't flash zeros on first paint
const visible = computed(() => !!user.value && hasLoaded.value);

const remainingLabel = computed(() => {
	const nm = natureMinutes.value;
	if (!nm) return 'Track your outdoor time toward a calmer week.';
	const left = Math.max(0, nm.target - Math.round(nm.minutes));
	if (left <= 0) return "You've reached your weekly nature goal. Personal best territory.";
	return `${left} min from your weekly goal of ${nm.target}. Every walk counts.`;
});

async function onSync() {
	const res = await syncFromHealthKit();
	if (res.success && res.data) {
		void showInfoToast('Synced your outdoor time from Apple Health.');
	} else {
		void showInfoToast(res.error ?? 'No new outdoor time to credit yet.');
	}
}

function goToTrails() {
	void navigateTo('/tabs/trails');
}

onMounted(async () => {
	if (!user.value?.id) return;
	await fetchNatureMinutes();
	hasLoaded.value = true;
});

watch(
	() => user.value?.id,
	async (id) => {
		if (!id) return;
		await fetchNatureMinutes();
		hasLoaded.value = true;
	}
);
</script>
