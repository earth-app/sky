<template>
	<button
		type="button"
		:disabled="disabled"
		class="px-6! min-h-11! rounded-xl! text-white! text-sm! font-medium! tracking-wide"
		:class="[
			variant === 'outline' ? 'py-2! border border-neutral-700' : 'py-2.5! bg-neutral-800!',
			disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
		]"
	>
		<slot />
	</button>
</template>

<script setup lang="ts">
withDefaults(
	defineProps<{
		variant?: 'solid' | 'outline';
		disabled?: boolean;
	}>(),
	{ variant: 'solid', disabled: false }
);
</script>
