<template>
	<div class="m-stat">
		<span class="m-stat-value flex items-center gap-1">
			<UIcon
				v-if="icon"
				:name="icon"
				class="size-4 shrink-0 opacity-70"
				aria-hidden="true"
			/>
			{{ value }}
		</span>
		<span class="m-stat-label">{{ label }}</span>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	value: string | number;
	label: string;
	icon?: string;
}>();
</script>
