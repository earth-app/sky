<template>
	<IonCard
		:color="theme"
		class="p-2 mb-4"
	>
		<IonCardHeader>
			<div class="flex justify-between items-start mb-2">
				<IonCardTitle :router-link="routerLink">{{ notification.title }}</IonCardTitle>
				<div class="flex items-center">
					<UIcon
						v-if="notification.type === 'error'"
						name="mdi:alert-circle-outline"
						class="text-red-400 size-5"
						title="Error Notification"
					/>
					<UIcon
						v-else-if="notification.type === 'warning'"
						name="mdi:alert-outline"
						class="text-yellow-400 size-5"
						size="20"
						title="Warning Notification"
					/>
					<UIcon
						v-else-if="notification.type === 'success' && additional"
						name="mdi:check-circle-outline"
						class="text-green-400 size-5"
						title="Success Notification"
						size="20"
					/>
					<div
						v-if="!notification.read"
						class="mx-2"
					>
						<span
							class="inline-block size-3 bg-blue-500 rounded-full"
							title="Mark as Read"
							@click="markAsRead"
						></span>
					</div>
					<UIcon
						v-if="additional"
						name="mdi:delete-outline"
						class="size-5 text-gray-500"
						title="Delete Notification"
						@click="removeNotification"
					/>
				</div>
			</div>
			<IonCardSubtitle :router-link="routerLink">{{
				trimString(notification.message, 50)
			}}</IonCardSubtitle>
		</IonCardHeader>

		<IonCardContent
			:router-link="routerLink"
			class="p-0!"
		>
			<div class="flex flex-col mt-2">
				<p class="text-xs! md:text-sm text-gray-400 light:text-gray-800">
					{{ timestamp }} • {{ fullTimestamp }}
				</p>
				<p class="text-xs! md:text-sm text-gray-600 light:text-gray-300">
					{{ notification.source }} | ID: {{ notification.id }}
				</p>
			</div>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { DateTime } from 'luxon';
import { trimString } from 'utils';

const props = defineProps<{
	notification: UserNotification;
	additional?: boolean;
}>();

const emit = defineEmits<{
	(event: 'deleted', notification: UserNotification): void;
}>();
const { markNotificationRead } = useNotifications();

const timestamp = computed(() => {
	const time = DateTime.fromMillis(props.notification.created_at * 1000);
	return time.toRelative() || time.toLocaleString(DateTime.DATETIME_SHORT);
});

const fullTimestamp = computed(() => {
	const time = DateTime.fromMillis(props.notification.created_at * 1000);
	return time.toLocaleString(DateTime.DATETIME_FULL);
});

const routerLink = computed(() => `/tabs/profile/notifications/${props.notification.id}`);

async function markAsRead() {
	if (!props.notification.read) {
		const res = await markNotificationRead(props.notification.id);
		if (!res.success) {
			console.error('Failed to mark notification as read:', res.message);

			const toast = useToast();
			toast.add({
				title: 'Error',
				description: res.message || 'Failed to mark notification as read.',
				icon: 'mdi:alert-circle',
				color: 'error'
			});
		}
	}
}

async function removeNotification() {
	const res = await deleteNotification(props.notification.id);

	if (res.success) {
		emit('deleted', props.notification);

		await Toast.show({
			text: 'Notification deleted successfully.',
			duration: 'short'
		});
	} else {
		console.error('Failed to delete notification:', res.message);

		await Toast.show({
			text: res.message || 'Failed to delete notification.',
			duration: 'short'
		});
	}
}
</script>
