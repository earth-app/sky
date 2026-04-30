<template>
	<div class="min-w-90 w-full h-full overflow-y-auto p-4 border border-gray-700">
		<div
			v-if="notifications.length === 0"
			class="text-gray-400 light:text-gray-600"
		>
			No notifications
		</div>
		<div v-else>
			<div class="flex justify-between mb-2">
				<IonButton
					class="text-xs!"
					size="small"
					fill="outline"
					@click="markAllRead"
				>
					Mark All as Read
				</IonButton>
				<IonButton
					class="text-xs!"
					size="small"
					fill="outline"
					color="tertiary"
					@click="notifications.splice(0, notifications.length)"
				>
					Clear All
				</IonButton>
			</div>
			<UserNotificationMCard
				v-for="notification in displayed"
				:key="notification.id"
				:notification="notification"
				:additional="additional"
				@deleted="handleDelete"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	additional?: boolean;
}>();

const { notifications, markAllNotificationsRead } = useNotifications();

async function markAllRead() {
	await markAllNotificationsRead();
}

const displayed = computed(() => {
	return props.additional ? notifications.value : notifications.value.slice(0, 4);
});

function handleDelete(notification: UserNotification) {
	const index = notifications.value.findIndex((n) => n.id === notification.id);
	if (index !== -1) {
		notifications.value.splice(index, 1);
	}
}
</script>
