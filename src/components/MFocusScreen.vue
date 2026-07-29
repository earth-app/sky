<template>
	<div class="mx-auto flex max-w-md flex-col items-center gap-4 pt-6">
		<UIcon
			:name="icon"
			class="size-12"
			:class="toneClass"
			aria-hidden="true"
		/>
		<h1 class="m-0! text-xl font-semibold">{{ title }}</h1>
		<p
			v-if="description"
			class="text-center text-sm text-muted"
		>
			{{ description }}
		</p>

		<slot />

		<div
			v-if="$slots.actions"
			class="flex w-full flex-col items-center gap-2"
		>
			<slot name="actions" />
		</div>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		icon: string;
		title: string;
		description?: string;
		tone?: 'primary' | 'warning' | 'danger' | 'success';
	}>(),
	{ tone: 'primary' }
);

const toneClass = computed(() => {
	switch (props.tone) {
		case 'warning':
			return 'text-warning';
		case 'danger':
			return 'text-red-500';
		case 'success':
			return 'text-success';
		case 'primary':
		default:
			return 'm-text-brand';
	}
});
</script>
