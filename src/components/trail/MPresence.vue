<template>
	<div class="flex flex-col items-center text-center gap-6 py-6 px-4 max-w-xl mx-auto">
		<div class="flex flex-col items-center gap-2">
			<span class="text-xs font-semibold uppercase tracking-wide opacity-60">Be Present</span>
			<div
				class="size-16 rounded-full bg-primary/10 flex items-center justify-center"
				:class="running && !reduced ? 'motion-safe:animate-pulse' : ''"
			>
				<UIcon
					:name="meta.icon"
					class="size-8 text-primary"
				/>
			</div>
			<h3 class="text-lg! font-semibold m-0!">{{ meta.label }}</h3>
			<p class="text-base opacity-90 wrap-break-word">{{ meta.cue }}</p>
		</div>

		<div class="flex flex-col items-center gap-1">
			<span class="text-5xl font-semibold tabular-nums tracking-tight">{{ clock }}</span>
			<span class="text-xs opacity-60"
				>Suggested {{ targetMinutes }} min - go at your own pace</span
			>
		</div>

		<p class="text-sm opacity-60 max-w-md">
			The app doesn't need to stay open. Put it away, be where you are, then come back and log your
			time.
		</p>

		<div
			v-if="meta.photos"
			class="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2"
		>
			<span class="text-sm opacity-80">Photos Taken</span>
			<IonButton
				fill="clear"
				color="medium"
				size="small"
				aria-label="One fewer photo"
				:disabled="photoCount <= 0"
				@click="photoCount = Math.max(0, photoCount - 1)"
			>
				<UIcon
					name="mdi:minus"
					class="size-5"
				/>
			</IonButton>
			<span class="text-sm font-semibold tabular-nums w-5">{{ photoCount }}</span>
			<IonButton
				fill="clear"
				color="primary"
				size="small"
				aria-label="One more photo"
				@click="photoCount++"
			>
				<UIcon
					name="mdi:plus"
					class="size-5"
				/>
			</IonButton>
		</div>

		<div class="flex flex-col gap-2 w-full">
			<IonButton
				:color="running ? 'medium' : 'primary'"
				:fill="running ? 'outline' : 'solid'"
				expand="block"
				@click="toggle"
			>
				<UIcon
					:name="running ? 'mdi:pause' : 'mdi:play'"
					class="size-5 mr-2"
				/>
				{{ running ? 'Pause Timer' : elapsed > 0 ? 'Resume Timer' : 'Start Timer' }}
			</IonButton>
			<IonButton
				color="success"
				expand="block"
				@click="finish"
			>
				<UIcon
					name="mdi:check"
					class="size-5 mr-2"
				/>
				Log {{ loggedMinutes }} Nature Minutes
			</IonButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TrailPractice } from 'types/trails';

const props = defineProps<{
	practice: TrailPractice;
	targetMinutes: number;
}>();

const emit = defineEmits<{
	finish: [payload: { minutes: number; photoCount: number }];
}>();

const meta = computed(() => trailPracticeMeta(props.practice));

const reduced = ref(false);
const elapsed = ref(0); // seconds
const running = ref(false);
const photoCount = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

// logged minutes track the live timer once started, else fall back to the suggestion
const loggedMinutes = computed(() =>
	elapsed.value > 0 ? Math.max(1, Math.round(elapsed.value / 60)) : props.targetMinutes
);

const clock = computed(() => {
	const m = Math.floor(elapsed.value / 60);
	const s = elapsed.value % 60;
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});

function toggle() {
	running.value = !running.value;
}

function tick() {
	if (running.value) elapsed.value++;
}

function finish() {
	running.value = false;
	emit('finish', { minutes: loggedMinutes.value, photoCount: photoCount.value });
}

onMounted(() => {
	if (!import.meta.client) return;
	reduced.value = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
	timer = setInterval(tick, 1000);
});

onBeforeUnmount(() => {
	if (timer) clearInterval(timer);
});
</script>
