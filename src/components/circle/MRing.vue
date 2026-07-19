<template>
	<div class="flex flex-col items-center">
		<div
			class="relative"
			:style="{ width: `${size}px`, height: `${size}px` }"
		>
			<svg
				:width="size"
				:height="size"
				:viewBox="`0 0 ${size} ${size}`"
				class="-rotate-90"
				role="img"
				:aria-label="`${percentLabel} percent of the circle's shared goal`"
			>
				<circle
					:cx="center"
					:cy="center"
					:r="radius"
					fill="none"
					class="text-neutral-200 dark:text-neutral-700"
					stroke="currentColor"
					:stroke-width="strokeWidth"
				/>
				<circle
					v-for="seg in segments"
					:key="seg.uid"
					:cx="center"
					:cy="center"
					:r="radius"
					fill="none"
					:stroke="seg.color"
					:stroke-width="strokeWidth"
					stroke-linecap="round"
					:stroke-dasharray="`${seg.length} ${circumference}`"
					:stroke-dashoffset="-seg.offset"
					class="transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
				/>
			</svg>
			<div class="absolute inset-0 flex flex-col items-center justify-center text-center">
				<span class="text-3xl font-bold tabular-nums leading-none">{{ percentLabel }}%</span>
				<span class="text-[11px] opacity-60 mt-1">of {{ goalMeta.label }}</span>
			</div>
		</div>
		<p class="text-xs opacity-70 mt-2">{{ remaining }} {{ goalMeta.unit }} to Grow Together</p>
	</div>
</template>

<script setup lang="ts">
import type { Expedition } from 'types/circles';

const props = withDefaults(
	defineProps<{ expedition: Expedition; size?: number; strokeWidth?: number }>(),
	{
		size: 176,
		strokeWidth: 14
	}
);

const center = computed(() => props.size / 2);
const radius = computed(() => props.size / 2 - props.strokeWidth);
const circumference = computed(() => 2 * Math.PI * radius.value);

// reuse the inherited crust helpers (goal meta, percent, remaining, contributor color)
const goalMeta = computed(
	() => EXPEDITION_GOAL_META[props.expedition.goal] ?? EXPEDITION_GOAL_META.nature_minutes
);
const percent = computed(() => expeditionPercent(props.expedition));
const percentLabel = computed(() => Math.round(percent.value * 100));
const remaining = computed(() => expeditionRemaining(props.expedition));

// stack each contributor's arc proportional to their share, capped at the filled fraction so
// segments never overrun the ring; contribution is shown, member rank is never implied
const segments = computed(() => {
	const target = props.expedition.target || 1;
	const filled = percent.value * circumference.value;
	let offset = 0;
	const out: { uid: string; color: string; length: number; offset: number }[] = [];
	for (const c of props.expedition.contributors) {
		const raw = Math.min(1, c.contribution / target) * circumference.value;
		const length = Math.max(0, Math.min(raw, filled - offset));
		if (length <= 0) continue;
		out.push({ uid: c.uid, color: contributorColor(c.uid), length, offset });
		offset += length;
	}
	return out;
});
</script>
