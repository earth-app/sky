<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonTitle>{{ trimString(notification?.title, 32) }}</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent>
			<div
				v-if="user && notification"
				class="w-full px-4 py-8 mt-16 sm:mt-0"
			>
				<div class="flex flex-col items-center">
					<h2 class="text-lg font-semibold">{{ notification.title }}</h2>
					<UChip
						:color="notification.type"
						:ui="{ base: 'size-4 lg:size-6' }"
						:title="capitalizeFully(notification.type)"
					>
						<div class="p-4 bg-elevated border-2 border-default rounded-lg w-full max-w-3xl">
							<p
								class="text-gray-800 dark:text-gray-200 text-sm md:text-base lg:text-lg mb-4"
								v-html="message"
							></p>

							<USeparator v-if="mobileLink" />
							<IonChip
								v-if="mobileLink"
								:router-link="mobileLink"
								color="primary"
								role="link"
								tabindex="0"
								aria-label="Open the Linked Page"
								class="px-2 min-h-11"
								@keydown.enter.prevent="activateSelf"
								@keydown.space.prevent="activateSelf"
								>Open Link</IonChip
							>

							<p class="text-muted text-xs mt-2">
								From: {{ notification.source }} | Type: {{ capitalizeFully(notification.type) }} |
								ID:
								{{ notification.id }}
							</p>
						</div>
					</UChip>

					<UserMCard
						v-if="userSource"
						:user="userSource"
						class="mt-4"
					/>
				</div>
			</div>
			<Loading v-else-if="user && notification === undefined" />
			<div
				v-else-if="user && notification === null"
				class="flex flex-col items-center justify-center h-screen"
			>
				<p class="text-muted">Notification doesn't exist. Maybe look at the URL again?</p>
			</div>
			<Loading v-else-if="user === undefined" />
			<!-- Only show "Please log in" when user is explicitly null (not loading) -->
			<div
				v-else-if="user === null"
				class="flex flex-col w-full h-full items-center justify-center"
			>
				<p class="text-center text-muted">Please log in to view your notifications.</p>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const { user } = useAuth();
const { markNotificationRead } = useNotifications();
const route = useRoute();
const { setTitleSuffix } = useTitleSuffix();

const { notification, fetch } = useNotification(route.params.id as string);
const { notifyError, selection } = useAppHaptics();

// ion-chip has no keyboard activation of its own; a synthetic click drives its routerLink
function activateSelf(event: KeyboardEvent) {
	(event.currentTarget as HTMLElement | null)?.click();
}

// Fetch notification data on mount
onMounted(() => {
	fetch();
});

watch(
	() => notification.value,
	(notification) => {
		if (notification && !notification.read) {
			markAsRead();
		}

		setTitleSuffix(notification ? notification.title : 'Notification');
	}
);

const mobileLink = computed(() => notificationRoute(notification?.value?.link));

const message = computed(() => {
	if (!notification.value) return;

	return notification.value.message.replace(/\n/g, '<br />').replace(/\t/g, '');
});

const userSource = computed(() => {
	if (!notification.value) return;
	if (!notification.value.source || !notification.value.source.startsWith('@')) return;

	const { user, fetchUser, fetchAvatar } = useUser(notification.value.source);
	fetchUser();
	fetchAvatar();

	return user.value;
});

async function markAsRead() {
	if (notification.value && !notification.value.read) {
		const res = await markNotificationRead(notification.value.id);
		if (res.success) {
			selection();
			notification.value.read = true;
		} else {
			notifyError();
			console.error('Failed to mark notification as read:', res.message);

			await Toast.show({
				text: res.message || 'Failed to mark notification as read.',
				duration: 'short'
			});
		}
	}
}
</script>
