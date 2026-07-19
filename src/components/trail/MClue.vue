<template>
	<div class="flex flex-col items-center text-center gap-5 py-8 px-4 max-w-xl mx-auto">
		<span class="text-xs font-semibold uppercase tracking-wide opacity-60"
			>A Curious Invitation</span
		>

		<div
			class="size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary motion-safe:animate-pulse"
		>
			<UIcon
				name="mdi:compass-outline"
				class="size-8"
			/>
		</div>

		<p class="text-lg opacity-90 wrap-break-word whitespace-pre-line">{{ curiosity }}</p>

		<div class="flex flex-wrap items-center justify-center gap-3 text-sm opacity-70">
			<span class="flex items-center gap-1">
				<UIcon
					:name="meta.icon"
					class="size-4"
				/>
				{{ meta.label }}
			</span>
			<span class="flex items-center gap-1">
				<UIcon
					name="mdi:timer-sand"
					class="size-4"
				/>
				~{{ targetMinutes }} min
			</span>
		</div>

		<p class="text-sm opacity-60 max-w-md">{{ meta.cue }}</p>

		<IonButton
			class="mt-1"
			color="primary"
			expand="block"
			@click="emit('continue')"
		>
			<UIcon
				:name="preview ? 'mdi:map-marker-path' : 'mdi:hand-heart-outline'"
				class="size-5 mr-2"
			/>
			{{ preview ? 'Begin This Trail' : 'Make My Pledge' }}
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import type { TrailPractice } from 'types/trails';

const props = withDefaults(
	defineProps<{
		curiosity: string;
		practice: TrailPractice;
		targetMinutes: number;
		preview?: boolean;
	}>(),
	{ preview: false }
);

const emit = defineEmits<{ continue: [] }>();

const meta = computed(() => trailPracticeMeta(props.practice));
</script>
