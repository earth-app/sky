<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonTitle>Notifications</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<UserNotificationMList :additional="true" />
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { fetchNotifications } = useNotifications();

onMounted(() => {
	fetchNotifications();
});
</script>
