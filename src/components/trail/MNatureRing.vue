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
				:aria-label="`${roundedMinutes} Nature Minutes this week`"
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
			</svg>
			<div class="absolute inset-0 flex flex-col items-center justify-center">
				<UiCountUp
					:value="roundedMinutes"
					:class="compact ? 'text-sm font-semibold' : 'text-2xl font-bold'"
					class="tabular-nums leading-none m-text-brand"
				/>
				<span
					v-if="!compact"
					class="text-3xs opacity-60"
					>min</span
				>
			</div>
		</div>
		<div :class="compact ? 'min-w-0' : 'flex flex-col items-center'">
			<span class="text-xs font-semibold opacity-80">{{ label }}</span>
			<span
				v-if="best > 0"
				class="text-2xs opacity-60"
				>Personal Best: {{ best }} min</span
			>
			<span
				v-else-if="!compact"
				class="text-2xs opacity-60"
				>Personal, Never Compared</span
			>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		minutes: number;
		best?: number;
		label?: string;
		size?: number;
		compact?: boolean;
	}>(),
	{ best: 0, label: 'Nature Minutes', size: 88, compact: false }
);

// arbitrary ring scale for a first week with no record yet, deliberately local: the server's
// `target` is 120 min/week, and a figure a user could read as advice does not belong in a
// component the user looks at
const FIRST_WEEK_SCALE = 60;

const radius = 42;
const stroke = 8;
const circumference = 2 * Math.PI * radius;

const roundedMinutes = computed(() => Math.max(0, Math.round(props.minutes)));

// the ring fills against your own best week; nothing else scales it
const scale = computed(() => (props.best > 0 ? props.best : FIRST_WEEK_SCALE));
const pct = computed(() => Math.min(1, Math.max(0, roundedMinutes.value / scale.value)));
const dashOffset = computed(() => circumference * (1 - pct.value));
</script>
