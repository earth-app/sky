<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<div class="flex flex-col py-1">
					<IonTitle>Notifications - @{{ user?.username }}</IonTitle>
					<span class="text-xs! opacity-90"
						>{{ notifications.length }} Notifications • {{ unreadCount }} Unread</span
					>
				</div>
			</IonToolbar>
		</IonHeader>
		<IonContent>
			<UserNotificationMList :additional="true" />
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();
const { notifications, unreadCount, fetchNotifications } = useNotifications();

onMounted(() => {
	fetchNotifications();
});
</script>
