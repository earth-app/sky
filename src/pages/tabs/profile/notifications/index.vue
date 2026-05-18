<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<div class="flex flex-col py-1">
					<IonTitle>Notifications - @{{ user?.username }}</IonTitle>
				</div>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<UserNotificationMList :additional="true" />
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();
const { fetchNotifications } = useNotifications();

onMounted(() => {
	fetchNotifications();
});
</script>
