<template>
	<IonPage>
		<IonContent class="ion-padding">
			<div class="flex flex-col items-center justify-center h-full">
				<IonSpinner name="crescent" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const route = useRoute();

onMounted(async () => {
	const id = typeof route.params.id === 'string' ? route.params.id : '';
	if (!id) {
		await navigateTo('/tabs/dashboard', { replace: true });
		return;
	}

	await navigateTo(`/tabs/profile/${id}`, { replace: true });
});
</script>
