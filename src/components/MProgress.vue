<template>
	<div
		v-if="variant === 'ring'"
		class="relative inline-flex shrink-0 items-center justify-center"
		:style="{ width: `${geometry.size}px`, height: `${geometry.size}px` }"
		role="img"
		:aria-label="ariaLabel"
	>
		<svg
			:width="geometry.size"
			:height="geometry.size"
			:viewBox="`0 0 ${geometry.size} ${geometry.size}`"
			class="block"
			aria-hidden="true"
			focusable="false"
		>
			<circle
				:cx="geometry.center"
				:cy="geometry.center"
				:r="geometry.radius"
				fill="none"
				stroke="currentColor"
				:stroke-width="geometry.strokeWidth"
				class="text-gray-200 dark:text-gray-700"
			/>
			<circle
				:cx="geometry.center"
				:cy="geometry.center"
				:r="geometry.radius"
				fill="none"
				:stroke="strokeColor"
				:stroke-width="geometry.strokeWidth"
				stroke-linecap="round"
				:stroke-dasharray="geometry.circumference"
				:stroke-dashoffset="geometry.dashOffset"
				:transform="`rotate(-90 ${geometry.center} ${geometry.center})`"
				:class="motionOk ? 'transition-[stroke-dashoffset] duration-700 ease-out' : ''"
			/>
		</svg>
		<div class="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
			<span
				class="font-bold leading-none tabular-nums"
				:style="{ fontSize: `${geometry.valueSize}px` }"
				>{{ centerValue }}</span
			>
			<span
				v-if="label"
				class="mt-1 truncate leading-none opacity-60"
				:style="{ fontSize: `${geometry.labelSize}px` }"
				>{{ label }}</span
			>
		</div>
	</div>
	<div
		v-else
		class="w-full"
	>
		<div
			v-if="label"
			class="mb-1 flex items-center justify-between gap-2"
			aria-hidden="true"
		>
			<span class="text-2xs opacity-70">{{ label }}</span>
			<span class="text-2xs tabular-nums opacity-70">{{ centerValue }}</span>
		</div>
		<IonProgressBar
			:value="geometry.fraction"
			:color="ionColor"
			:style="customStyle"
			class="w-full"
			:aria-label="ariaLabel"
		/>
	</div>
</template>

<script setup lang="ts">
import {
	DEFAULT_RING_SIZE,
	progressDone,
	progressLabel,
	progressPercent,
	ringGeometry
} from '~/utils/progress';

const ION_COLORS = [
	'primary',
	'secondary',
	'tertiary',
	'success',
	'warning',
	'danger',
	'medium',
	'light',
	'dark'
];

const props = withDefaults(
	defineProps<{
		value: number;
		variant?: 'bar' | 'ring';
		size?: number;
		label?: string;
		color?: string;
		/** step count; switches the readout from a percent to "3 of 5" */
		total?: number;
		strokeWidth?: number;
	}>(),
	{ variant: 'bar', size: DEFAULT_RING_SIZE, color: 'primary' }
);

const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const settings = useAppSettingsState();
const motionOk = computed(() => !prefersReducedMotion.value && settings.value.animations);

const geometry = computed(() => ringGeometry(props.value, props.size, props.strokeWidth));

const hasTotal = computed(
	() => typeof props.total === 'number' && Number.isFinite(props.total) && props.total > 0
);

const centerValue = computed(() =>
	hasTotal.value
		? `${progressDone(props.value, props.total as number)}/${Math.round(props.total as number)}`
		: `${progressPercent(props.value)}%`
);

const ariaLabel = computed(() => {
	const state = progressLabel(props.value, hasTotal.value ? props.total : undefined);
	return props.label ? `${props.label}: ${state}` : state;
});

// an ionic role name drives the built-in colour; anything else is treated as a raw css colour
const isIonColor = computed(() => ION_COLORS.includes(props.color));
const ionColor = computed(() => (isIonColor.value ? props.color : undefined));
const strokeColor = computed(() =>
	isIonColor.value ? `var(--ion-color-${props.color})` : props.color
);
const customStyle = computed<Record<string, string> | undefined>(() =>
	isIonColor.value ? undefined : { '--progress-background': props.color }
);
</script>
