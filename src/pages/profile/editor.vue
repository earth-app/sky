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
onMounted(async () => {
	await navigateTo('/tabs/profile/editor', { replace: true });
});
</script>
