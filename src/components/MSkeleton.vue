<template>
	<div
		class="rounded-xl bg-gray-200 dark:bg-gray-700 m-skeleton overflow-hidden relative"
		:style="{ height: heightPx, width: widthPx }"
		role="presentation"
		aria-hidden="true"
	/>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		height?: string | number;
		width?: string | number;
	}>(),
	{ height: 80, width: '100%' }
);

const heightPx = computed(() =>
	typeof props.height === 'number' ? `${props.height}px` : props.height
);
const widthPx = computed(() =>
	typeof props.width === 'number' ? `${props.width}px` : props.width
);
</script>

<style scoped>
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
	animation: m-skeleton-shimmer 1.4s ease-in-out infinite;
	transform: translateX(-100%);
}

@keyframes m-skeleton-shimmer {
	100% {
		transform: translateX(100%);
	}
}
</style>
