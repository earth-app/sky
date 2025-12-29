<template>
	<div
		class="flex items-center w-32 mr-2"
		@click="
			open = !open;
			event = $event;
		"
	>
		<UIcon
			:name="icon"
			class="size-6 mr-2"
		/>

		<div class="flex flex-col items-start justify-center">
			<span
				v-if="total"
				class="text-sm font-medium text-gray-900 dark:text-gray-100"
			>
				{{ count }} / {{ total }}
			</span>
			<span
				v-else
				class="text-sm font-semibold text-yellow-500 light:text-yellow-600"
			>
				{{ count }}
			</span>
			<IonProgressBar
				v-if="total"
				:value="count / total"
				class="w-24 mt-1"
				color="secondary"
			/>
		</div>
	</div>
	<IonPopover
		:is-open="open"
		:event="event"
		@did-dismiss="open = false"
	>
		<div class="max-w-xs p-4">
			<p
				v-if="title"
				class="font-medium text-gray-900 dark:text-gray-100 mb-2"
			>
				{{ title }}
			</p>
			<p
				v-if="total"
				class="text-sm text-gray-700 dark:text-gray-300"
			>
				{{ count }} out of {{ total }} activities have been found on this journey.
			</p>
			<p
				v-else
				class="text-sm text-gray-700 dark:text-gray-300"
			>
				{{ count }} {{ title?.toLowerCase() || 'items' }} so far. Streaks only last every 48 hours,
				so keep going!
			</p>
			<p
				v-if="help"
				class="mt-2 text-xs text-gray-500 dark:text-gray-400"
			>
				{{ help }}
			</p>
		</div>
	</IonPopover>
</template>

<script setup lang="ts">
defineProps<{
	icon: string;
	title?: string;
	help?: string;
	count: number;
	total?: number;
}>();

const open = ref(false);
const event = ref<PointerEvent | null>(null);
</script>
