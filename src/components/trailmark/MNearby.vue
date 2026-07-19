<template>
	<div class="flex flex-col gap-4 w-full max-w-3xl mx-auto px-4 pb-8">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 class="text-xl! font-bold m-0!">Trailmarks Nearby</h2>
				<p class="text-xs opacity-70 mt-1">
					Notes left at real places by people who passed through.
				</p>
			</div>
			<IonSelect
				v-model="radius"
				interface="popover"
				label="Within"
				label-placement="stacked"
				class="w-28 shrink-0"
			>
				<IonSelectOption
					v-for="opt in radiusOptions"
					:key="opt.value"
					:value="opt.value"
					>{{ opt.label }}</IonSelectOption
				>
			</IonSelect>
		</div>

		<TrailmarkMComposer @created="onCreated" />

		<div
			v-if="!ready && !error"
			class="flex flex-col items-center text-center py-10 opacity-70"
		>
			<UIcon
				name="mdi:crosshairs-gps"
				class="size-9 mb-2 motion-safe:animate-pulse"
			/>
			<p class="text-sm">Finding notes around you...</p>
			<IonButton
				fill="clear"
				size="small"
				color="medium"
				class="mt-1"
				@click="recheckLocation"
			>
				<UIcon
					name="mdi:refresh"
					class="size-4 mr-1"
				/>
				Re-check Location
			</IonButton>
		</div>
		<UAlert
			v-else-if="error"
			color="warning"
			variant="subtle"
			icon="mdi:map-marker-alert-outline"
			title="Location Needed"
			:description="error"
			:actions="[
				{
					label: 'Re-check Location',
					color: 'warning',
					variant: 'soft',
					icon: 'mdi:refresh',
					onClick: recheckLocation
				}
			]"
		/>
		<div
			v-else-if="loading && !nearby.length"
			class="flex flex-col gap-3"
		>
			<MSkeleton
				v-for="n in 3"
				:key="n"
				:height="112"
				width="100%"
			/>
		</div>
		<div
			v-else-if="nearby.length"
			class="flex flex-col gap-3"
		>
			<TrailmarkMCard
				v-for="mark in nearby"
				:key="mark.id"
				:mark="mark"
				:distance-meters="distanceOf(mark)"
			/>
		</div>
		<div
			v-else
			class="flex flex-col items-center text-center py-10 opacity-70"
		>
			<UIcon
				name="mdi:map-marker-off-outline"
				class="size-9 mb-2"
			/>
			<p class="text-sm">Be the First to Leave One.</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { App, type AppState } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import type { Trailmark } from 'types/trailmarks';

const { nearby, loading, fetchNearby } = useTrailmarks();
const { lat, lng, error, ready, fetchLocation } = useMGeolocation();
const { impactLight } = useAppHaptics();

const radiusOptions = [
	{ label: '250 m', value: 250 },
	{ label: '500 m', value: 500 },
	{ label: '1 km', value: 1000 },
	{ label: '2 km', value: 2000 }
] as const;
const radius = ref(500);

function distanceOf(mark: Trailmark): number | undefined {
	if (lat.value === null || lng.value === null) return undefined;
	return trailmarkDistanceMeters({ lat: lat.value, lng: lng.value }, mark.geo);
}

async function load(force = false) {
	if (lat.value === null || lng.value === null) return;
	await fetchNearby({ lat: lat.value, lng: lng.value, radius: radius.value }, force);
}

// re-attempt a fix; ensureLocationGranted (inside fetchLocation) re-reads the native
// permission, so a grant made in Settings recovers here without an app restart
async function recheckLocation() {
	void impactLight();
	await fetchLocation();
}

// back from Settings (app resume) or tab re-shown: if we still have no fix, re-check so
// a just-granted permission takes effect (native has no live Permissions-API signal)
function onResume() {
	if (!ready.value) void fetchLocation();
}

function onVisibility() {
	if (typeof document !== 'undefined' && document.visibilityState === 'visible') onResume();
}

function onCreated() {
	void load(true);
}

watch([lat, lng], () => void load());
watch(radius, () => void load(true));

let appStateListener: PluginListenerHandle | null = null;

onMounted(async () => {
	await fetchLocation();
	appStateListener = await App.addListener('appStateChange', (state: AppState) => {
		if (state.isActive) onResume();
	});
	if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
});

onBeforeUnmount(() => {
	appStateListener?.remove();
	appStateListener = null;
	if (typeof document !== 'undefined')
		document.removeEventListener('visibilitychange', onVisibility);
});
</script>
