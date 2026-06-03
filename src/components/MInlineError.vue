<template>
	<div
		class="flex items-start gap-3 p-3 rounded-lg border w-full"
		:class="severityClass"
		role="alert"
	>
		<UIcon
			:name="icon || 'mdi:alert-circle-outline'"
			class="size-5 shrink-0 mt-0.5"
		/>
		<div class="flex-1 min-w-0">
			<p class="text-sm font-medium m-0!">{{ title }}</p>
			<p
				v-if="description"
				class="text-xs opacity-80 mt-1 m-0!"
			>
				{{ description }}
			</p>
		</div>
		<IonButton
			v-if="retryLabel !== false"
			size="small"
			fill="solid"
			color="primary"
			:disabled="retrying"
			@click="onRetry"
		>
			<UIcon
				v-if="retrying"
				name="mdi:loading"
				class="size-4 mr-1 animate-spin"
			/>
			{{ retryLabel || 'Retry' }}
		</IonButton>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		title: string;
		description?: string;
		icon?: string;
		retryLabel?: string | false;
		severity?: 'error' | 'warning';
	}>(),
	{ severity: 'error' }
);

const emit = defineEmits<{
	retry: [];
}>();

const retrying = ref(false);

const severityClass = computed(() =>
	props.severity === 'warning'
		? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
		: 'bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-200'
);

async function onRetry() {
	if (retrying.value) return;
	retrying.value = true;
	try {
		// callers can listen and await their async work; we just toggle the spinner
		emit('retry');
		// release the spinner shortly so it doesn't stick if the consumer is sync
		setTimeout(() => (retrying.value = false), 1200);
	} catch {
		retrying.value = false;
	}
}
</script>
