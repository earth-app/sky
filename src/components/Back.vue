<template>
	<IonButton
		color="danger"
		class="my-4"
		@click="router.back()"
	>
		<UIcon
			name="mdi:arrow-left"
			class="mr-2 size-5"
		/>
		Back
	</IonButton>
</template>

<script setup lang="ts">
const router = useIonRouter();

useBackButton(10, () => {
	router.back();
});
</script>
