<template>
	<div class="min-w-90 w-full h-full overflow-y-auto p-4 border border-gray-700">
		<MEmptyState
			v-if="notifications.length === 0"
			icon="mdi:bell-check-outline"
			title="You're all caught up"
			description="No new notifications. We'll ping you when something needs your attention."
			variant="success"
			dense
		/>
		<div
			v-else
			class="flex flex-col"
		>
			<div
				:id="additional ? 'notifications-count' : undefined"
				class="flex items-center mb-2"
			>
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
					:disabled="isBusy"
					@click="markAllRead"
				>
					<template v-if="isMarkingAll">
						<IonSpinner
							name="crescent"
							class="mr-2 size-4!"
						/>
						Marking...
					</template>
					<template v-else> Mark All as Read </template>
				</IonButton>
				<IonButton
					class="text-xs!"
					size="small"
					fill="outline"
					color="tertiary"
					:disabled="isBusy"
					@click="clearAll"
				>
					<template v-if="isClearing">
						<IonSpinner
							name="crescent"
							class="mr-2 size-4!"
						/>
						Clearing...
					</template>
					<template v-else> Clear All </template>
				</IonButton>
			</div>
			<div :id="additional ? 'notifications-list' : undefined">
				<UserNotificationMCard
					v-for="(notification, idx) in displayed"
					:key="notification.id"
					:notification="notification"
					:additional="additional"
					:index="idx"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
const props = defineProps<{
	additional?: boolean;
}>();

const { notifications, unreadCount, markAllNotificationsRead, clearAllNotifications } =
	useNotifications();

// these bulk calls can be slow; surface a spinner and block re-entry while running
const isMarkingAll = ref(false);
const isClearing = ref(false);
const isBusy = computed(() => isMarkingAll.value || isClearing.value);

async function markAllRead() {
	if (isBusy.value) return;
	isMarkingAll.value = true;
	try {
		const res = await markAllNotificationsRead();
		if (!res.success) {
			await showErrorToast(res.message, {
				fallback: 'Failed to mark all notifications as read.'
			});
		}
	} finally {
		isMarkingAll.value = false;
	}
}

const displayed = computed(() => {
	return props.additional ? notifications.value : notifications.value.slice(0, 4);
});

async function clearAll() {
	if (isBusy.value) return;
	const { value } = await Dialog.confirm({
		title: 'Clear All Notifications?',
		message: 'This permanently removes every notification on this account. You cannot undo this.',
		okButtonTitle: 'Clear All',
		cancelButtonTitle: 'Cancel'
	});
	if (!value) return;

	isClearing.value = true;
	try {
		const res = await clearAllNotifications();
		if (!res.success) {
			await showErrorToast(res.message, {
				fallback: 'Failed to clear notifications.'
			});
		}
	} finally {
		isClearing.value = false;
	}
}
</script>
