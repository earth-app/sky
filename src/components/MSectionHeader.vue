<template>
	<div class="m-section-head">
		<div class="flex min-w-0 flex-col gap-0.5">
			<p
				v-if="eyebrow"
				class="m-eyebrow"
			>
				{{ eyebrow }}
			</p>
			<h2 class="m-0! truncate text-base! font-semibold">
				{{ title }}
				<span
					v-if="hasCount"
					class="ml-1 font-normal tabular-nums text-muted"
					>{{ count }}</span
				>
			</h2>
		</div>
		<div
			v-if="$slots.actions"
			class="flex shrink-0 items-center gap-1"
		>
			<slot name="actions" />
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	title: string;
	eyebrow?: string;
	count?: number;
}>();

// 0 is a real count worth showing, so test for presence rather than truthiness
const hasCount = computed(() => typeof props.count === 'number' && Number.isFinite(props.count));
</script>
