<template>
	<div
		class="flex items-center justify-center rounded-full bg-gray-700 light:bg-gray-200 border-2 border-yellow-500 min-w-12 min-h-12 max-w-12 max-h-12"
	>
		<IonButton
			:router-link="`/tabs/activities/${activity.id}`"
			fill="clear"
			class="rounded-full w-8 h-8"
		>
			<UIcon
				:name="activity.fields['icon'] || 'mdi:earth'"
				class="min-h-6 min-w-6"
			/>
		</IonButton>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	activity: Activity;
}>();
</script>
