<template>
	<IonButton
		color="danger"
		:class="text ? 'my-4' : ''"
		:fill="text ? 'solid' : 'clear'"
		@click="router.back()"
	>
		<UIcon
			name="mdi:arrow-left"
			:class="text ? 'mr-2 size-5' : 'size-8'"
		/>
		<span v-if="text">Back</span>
	</IonButton>
</template>

<script setup lang="ts">
const router = useIonRouter();

defineProps<{
	text?: boolean;
}>();
</script>
