<template>
	<div class="rounded-xl border border-primary/25 bg-primary/5 p-4">
		<div class="flex items-center gap-2">
			<UIcon
				:name="promptId ? 'mdi:comment-quote-outline' : 'mdi:message-plus-outline'"
				class="size-6 text-primary"
			/>
			<h3 class="text-base! font-semibold m-0!">
				{{ promptId ? 'Answer From Where You Are' : 'Leave a Note' }}
			</h3>
		</div>
		<p class="text-xs opacity-70 mt-1">
			{{
				promptId
					? "Answer today's prompt from outside. Your note is left at this spot and shared under the prompt. Notes are gently checked before they post."
					: 'Keep it short and kind. Notes are checked before the next visitor sees them.'
			}}
		</p>

		<IonTextarea
			v-model="note"
			class="mt-3"
			:rows="3"
			:maxlength="maxNote"
			auto-grow
			fill="outline"
			placeholder="Something to lift the next person who stops here..."
		/>
		<div class="text-[11px] opacity-50 text-right mt-1">{{ note.length }}/{{ maxNote }}</div>

		<IonInput
			v-model="place"
			class="mt-1"
			label="Name This Spot (Optional)"
			label-placement="stacked"
			:maxlength="80"
			fill="outline"
		/>

		<div class="flex items-center gap-2 mt-3 text-xs">
			<UIcon
				:name="ready ? 'mdi:crosshairs-gps' : 'mdi:crosshairs-question'"
				class="size-4"
				:class="ready ? 'text-success' : 'text-warning'"
			/>
			<span
				v-if="ready"
				class="text-success"
				>Location Ready</span
			>
			<span
				v-else-if="error"
				class="text-error"
				>{{ error }}</span
			>
			<span
				v-else
				class="opacity-70"
				>Detecting Your Location...</span
			>
			<IonButton
				fill="clear"
				size="small"
				class="ml-auto"
				@click="recheckLocation"
				>Use My Location</IonButton
			>
		</div>

		<IonButton
			class="mt-3"
			color="primary"
			expand="block"
			:disabled="!canPost"
			@click="post"
		>
			<IonSpinner
				v-if="busy"
				name="crescent"
				class="size-4 mr-2"
			/>
			<UIcon
				v-else
				name="mdi:send-variant-outline"
				class="size-5 mr-2"
			/>
			Post Note
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import { App, type AppState } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

const props = defineProps<{
	// when set, the note is also surfaced under this prompt as a 'from outside' answer
	promptId?: string;
}>();

const emit = defineEmits<{ created: [id: string] }>();

const { leaveNote, maxNote } = useTrailmarks();
const { lat, lng, error, ready, fetchLocation } = useMGeolocation();
const { notifySuccess, impactLight } = useAppHaptics();

const note = ref('');
const place = ref('');
const busy = ref(false);

const canPost = computed(() => !busy.value && !!note.value.trim() && ready.value);

async function post() {
	if (!canPost.value || lat.value === null || lng.value === null) return;
	busy.value = true;
	try {
		const placeLabel = place.value.trim();
		const res = await leaveNote({
			geo: { lat: lat.value, lng: lng.value, ...(placeLabel ? { place_label: placeLabel } : {}) },
			note: note.value.trim(),
			...(props.promptId ? { prompt_id: props.promptId } : {})
		});
		if (res.success && res.data) {
			void notifySuccess();
			void showInfoToast('Note posted. Thanks for leaving a good one.');
			note.value = '';
			place.value = '';
			emit('created', res.data.id);
		} else {
			void showErrorToast(res.error ?? 'Could not post your note.', {
				fallback: 'Could not post your note.'
			});
		}
	} finally {
		busy.value = false;
	}
}

// re-attempt a fix; ensureLocationGranted (inside fetchLocation) re-reads the native
// permission, so a grant made in Settings recovers here without an app restart
async function recheckLocation() {
	void impactLight();
	await fetchLocation();
}

// back from Settings (app resume) or tab re-shown: if we still have no fix, re-check
function onResume() {
	if (!ready.value) void fetchLocation();
}

function onVisibility() {
	if (typeof document !== 'undefined' && document.visibilityState === 'visible') onResume();
}

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
