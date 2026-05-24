<template>
	<div class="min-w-90 w-full h-full overflow-y-auto p-4 border border-gray-700">
		<div
			v-if="notifications.length === 0"
			class="text-gray-400 light:text-gray-600"
		>
			No notifications
		</div>
		<div
			v-else
			class="flex flex-col"
		>
			<div class="flex items-center mb-2">
				<span class="text-sm! font-medium mr-2">
					{{ notifications.length }} Notification{{ notifications.length > 1 ? 's' : '' }}
				</span>
				<span
					v-if="unreadCount > 0"
					class="text-xs! text-blue-500 dark:text-white bg-blue-100 dark:bg-blue-600 rounded-full px-2 py-0.5 border-2 border-blue-400/10 dark:border-white/30"
				>
					{{ unreadCount }} Unread
				</span>
				<span
					v-else
					class="text-xs! text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 rounded-full px-2 py-0.5 border-2 border-gray-300/10 dark:border-gray-600/30"
				>
					All Read
				</span>
			</div>
			<div class="flex justify-start gap-2 my-2">
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
					@click="clearAll"
				>
					Clear All
				</IonButton>
			</div>
			<UserNotificationMCard
				v-for="notification in displayed"
				:key="notification.id"
				:notification="notification"
				:additional="additional"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	additional?: boolean;
}>();

const { notifications, unreadCount, markAllNotificationsRead, clearAllNotifications } =
	useNotifications();

async function markAllRead() {
	const res = await markAllNotificationsRead();
	if (!res.success) {
		await showErrorToast(res.message, {
			fallback: 'Failed to mark all notifications as read.'
		});
	}
}

const displayed = computed(() => {
	return props.additional ? notifications.value : notifications.value.slice(0, 4);
});

async function clearAll() {
	const res = await clearAllNotifications();
	if (!res.success) {
		await showErrorToast(res.message, {
			fallback: 'Failed to clear notifications.'
		});
	}
}
</script>
