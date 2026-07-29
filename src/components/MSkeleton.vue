<template>
	<div
		v-if="grouped"
		class="flex w-full min-w-0 flex-col gap-2"
		:role="label ? 'status' : 'presentation'"
		:aria-label="label || undefined"
	>
		<template v-if="variant === 'text'">
			<div
				v-for="n in lines"
				:key="`m-sk-line-${n}`"
				class="m-skeleton h-3 rounded-full"
				:class="n === lines ? 'w-3/5' : 'w-full'"
				aria-hidden="true"
			/>
		</template>

		<template v-else-if="variant === 'row'">
			<div
				v-for="n in count"
				:key="`m-sk-row-${n}`"
				class="flex w-full min-w-0 items-center gap-3 py-1"
			>
				<div
					class="m-skeleton size-9 shrink-0 rounded-full"
					aria-hidden="true"
				/>
				<div class="flex min-w-0 flex-1 flex-col gap-1.5">
					<div
						class="m-skeleton h-3 w-2/5 rounded-full"
						aria-hidden="true"
					/>
					<div
						class="m-skeleton h-2.5 w-1/4 rounded-full"
						aria-hidden="true"
					/>
				</div>
			</div>
		</template>

		<template v-else-if="variant === 'card'">
			<div
				v-for="n in count"
				:key="`m-sk-card-${n}`"
				class="m-card gap-3"
			>
				<div class="flex w-full min-w-0 items-center gap-3">
					<div
						class="m-skeleton size-11 shrink-0 rounded-lg"
						aria-hidden="true"
					/>
					<div class="flex min-w-0 flex-1 flex-col gap-1.5">
						<div
							class="m-skeleton h-3.5 w-1/2 rounded-full"
							aria-hidden="true"
						/>
						<div
							class="m-skeleton h-2.5 w-1/4 rounded-full"
							aria-hidden="true"
						/>
					</div>
				</div>
				<div
					class="m-skeleton h-2.5 w-full rounded-full"
					aria-hidden="true"
				/>
				<div
					class="m-skeleton h-2.5 w-11/12 rounded-full"
					aria-hidden="true"
				/>
				<div
					class="m-skeleton h-2.5 w-3/5 rounded-full"
					aria-hidden="true"
				/>
			</div>
		</template>

		<template v-else>
			<div
				v-for="n in count"
				:key="`m-sk-box-${n}`"
				class="m-skeleton"
				:class="shapeClass"
				:style="boxStyle"
				aria-hidden="true"
			/>
		</template>
	</div>

	<div
		v-else
		class="m-skeleton"
		:class="shapeClass"
		:style="boxStyle"
		role="presentation"
		aria-hidden="true"
	/>
</template>

<script setup lang="ts">
type Variant = 'block' | 'text' | 'pill' | 'circle' | 'card' | 'row';

const props = withDefaults(
	defineProps<{
		/** shaped preset; `block` is a plain box sized by height/width */
		variant?: Variant;
		height?: string | number;
		width?: string | number;
		/** circle diameter, ignored by every other variant */
		size?: string | number;
		/** repeats for block/card/row */
		count?: number;
		/** bar count for `text` */
		lines?: number;
		/** names the loading region; without it the whole thing stays decorative */
		label?: string;
	}>(),
	{ variant: 'block', count: 1, lines: 3, size: 40 }
);

const COMPOSITE: Variant[] = ['text', 'card', 'row'];

const grouped = computed(
	() => COMPOSITE.includes(props.variant) || props.count > 1 || Boolean(props.label)
);

const shapeClass = computed(() => {
	if (props.variant === 'circle') return 'shrink-0 rounded-full';
	if (props.variant === 'pill') return 'shrink-0 rounded-full';
	return 'rounded-xl';
});

function toCss(value: string | number): string {
	return typeof value === 'number' ? `${value}px` : value;
}

const boxStyle = computed(() => {
	if (props.variant === 'circle') {
		const size = toCss(props.size);
		return { height: size, width: size };
	}
	if (props.variant === 'pill') {
		return { height: toCss(props.height ?? 12), width: toCss(props.width ?? 40) };
	}
	return { height: toCss(props.height ?? 80), width: toCss(props.width ?? '100%') };
});
</script>

<style scoped>
.m-skeleton {
	position: relative;
	overflow: hidden;
	background-color: var(--ui-bg-elevated);
}

/* 3 passes = 4.2s, under the WCAG 2.2 SC 2.2.2 five-second ceiling for auto-starting motion */
.m-skeleton::after {
	content: '';
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(
		90deg,
		transparent 0%,
		rgba(255, 255, 255, 0.18) 50%,
		transparent 100%
	);
	animation: m-skeleton-shimmer 1.4s ease-in-out 3;
	transform: translateX(-100%);
}

@keyframes m-skeleton-shimmer {
	100% {
		transform: translateX(100%);
	}
}

/* the global killswitch only crushes the duration, so stop the sweep outright here */
:global(html.animations-disabled) .m-skeleton::after {
	animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
	.m-skeleton::after {
		animation: none !important;
	}
}
</style>
