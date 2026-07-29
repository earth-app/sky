<template>
	<div
		class="relative overflow-hidden flex flex-col items-center text-center gap-5 py-8 px-4 max-w-xl mx-auto"
	>
		<MAmbient
			:seed="ambientSeed"
			:height="AMBIENT_BAND"
			class="absolute inset-x-0 top-0 opacity-40"
		/>
		<div
			class="pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-transparent to-(--ion-background-color)"
			:style="{ height: `${AMBIENT_BAND}px` }"
		/>
		<UiSparkleBurst
			:trigger="burst"
			:count="30"
			color="warning"
		/>
		<div
			class="relative size-16 rounded-full bg-warning/10 flex items-center justify-center text-warning transition-all duration-500 ease-out motion-reduce:transition-none"
			:class="shown ? 'scale-100 opacity-100' : 'scale-75 opacity-0'"
		>
			<UIcon
				name="mdi:white-balance-sunny"
				class="size-8"
			/>
		</div>

		<div class="relative flex flex-col gap-2">
			<h3 class="text-lg! font-semibold m-0!">A Small Wonder</h3>
			<p class="text-base opacity-90 wrap-break-word whitespace-pre-line">{{ reveal }}</p>
		</div>

		<div
			v-if="minutes > 0"
			class="relative flex items-center gap-2 text-sm text-success"
		>
			<UIcon
				name="mdi:leaf"
				class="size-4"
			/>
			<span>+{{ minutes }} Nature Minutes, just for being out there</span>
		</div>

		<div
			v-if="personalBest"
			class="relative flex items-center gap-2 text-sm m-text-brand"
		>
			<UIcon
				name="mdi:trophy-outline"
				class="size-4"
			/>
			<span>Your Longest Week Outside Yet</span>
		</div>

		<IonButton
			class="relative mt-1"
			color="success"
			expand="block"
			@click="emit('finish')"
		>
			<UIcon
				name="mdi:flag-checkered"
				class="size-5 mr-2"
			/>
			Finish
		</IonButton>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		reveal: string;
		minutes?: number;
		personalBest?: boolean;
		/** the trail this payoff belongs to; the reveal text stands in when it is not passed */
		seed?: string;
	}>(),
	{ minutes: 0, personalBest: false, seed: undefined }
);

const emit = defineEmits<{ finish: [] }>();

// the ambient band and its fade share one height, so the scene dissolves instead of cutting off
const AMBIENT_BAND = 300;

const ambientSeed = computed(() => props.seed || props.reveal);

const burst = ref(0);
const shown = ref(false);

onMounted(() => {
	burst.value++;
	requestAnimationFrame(() => {
		shown.value = true;
	});
});
</script>
