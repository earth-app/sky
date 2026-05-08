<template>
	<Ranks :highlighted="props.highlighted">
		<template #button="{ button }">
			<IonButton
				:disabled="button?.disabled"
				:color="button?.color === 'error' ? 'danger' : button?.color"
				>{{ button?.label }}</IonButton
			>
		</template>
	</Ranks>
</template>

<script setup lang="ts">
const props = defineProps<{
	highlighted?: 'FREE' | 'PRO' | 'WRITER' | 'ORGANIZER';
}>();
</script>
