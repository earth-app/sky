<template>
	<div :class="['flex items-center gap-3', compact ? 'flex-row' : 'flex-col text-center']">
		<div
			class="relative shrink-0"
			:style="{ width: `${size}px`, height: `${size}px` }"
		>
			<svg
				viewBox="0 0 100 100"
				class="w-full h-full"
				role="img"
				:aria-label="`${roundedMinutes} of ${target} Nature Minutes this week`"
			>
				<circle
					cx="50"
					cy="50"
					:r="radius"
					fill="none"
					class="text-neutral-200 dark:text-neutral-700"
					stroke="currentColor"
					:stroke-width="stroke"
				/>
				<circle
					cx="50"
					cy="50"
					:r="radius"
					fill="none"
					class="text-primary transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
					stroke="currentColor"
					:stroke-width="stroke"
					stroke-linecap="round"
					:stroke-dasharray="circumference"
					:stroke-dashoffset="dashOffset"
					transform="rotate(-90 50 50)"
				/>
				<circle
					v-if="showBestMarker"
					:cx="bestMarker.x"
					:cy="bestMarker.y"
					r="3.5"
					class="text-warning"
					fill="currentColor"
				/>
			</svg>
			<div class="absolute inset-0 flex flex-col items-center justify-center">
				<UiCountUp
					:value="roundedMinutes"
					:class="compact ? 'text-sm font-semibold' : 'text-2xl font-bold'"
					class="tabular-nums leading-none text-primary"
				/>
				<span
					v-if="!compact"
					class="text-[10px] opacity-60"
					>of {{ target }}</span
				>
			</div>
		</div>
		<div :class="compact ? 'min-w-0' : 'flex flex-col items-center'">
			<span class="text-xs font-semibold opacity-80">{{ label }}</span>
			<span
				v-if="best > 0"
				class="text-[11px] opacity-60"
				>Personal Best: {{ best }} min</span
			>
			<span
				v-else-if="!compact"
				class="text-[11px] opacity-60"
				>Personal, Never Compared</span
			>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		minutes: number;
		target?: number;
		best?: number;
		label?: string;
		size?: number;
		compact?: boolean;
	}>(),
	{ target: 120, best: 0, label: 'Nature Minutes', size: 88, compact: false }
);

const radius = 42;
const stroke = 8;
const circumference = 2 * Math.PI * radius;

const roundedMinutes = computed(() => Math.max(0, Math.round(props.minutes)));
const pct = computed(() =>
	Math.min(1, Math.max(0, roundedMinutes.value / Math.max(1, props.target)))
);
const dashOffset = computed(() => circumference * (1 - pct.value));

const showBestMarker = computed(
	() => props.best > 0 && props.best > roundedMinutes.value && props.best <= props.target
);
const bestMarker = computed(() => {
	const fraction = Math.min(1, props.best / Math.max(1, props.target));
	const angle = (-90 + 360 * fraction) * (Math.PI / 180);
	return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
});
</script>
