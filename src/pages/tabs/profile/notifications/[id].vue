<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonTitle>Notification - {{ trimString(notification?.title, 32) }}</IonTitle>
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
						<div
							class="p-4 bg-gray-800 border-2 border-gray-200 light:border-gray-400 rounded-lg w-full max-w-3xl"
						>
							<p
								class="text-gray-300 text-sm md:text-md lg:text-lg mb-4"
								v-html="message"
							></p>

							<USeparator v-if="mobileLink" />
							<IonChip
								v-if="mobileLink"
								:router-link="mobileLink"
								color="primary"
								class="px-2"
								>Open Link</IonChip
							>

							<p class="text-gray-500 text-xs mt-2">
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
				<p class="text-gray-600">Notification doesn't exist. Maybe look at the URL again?</p>
			</div>
			<Loading v-else-if="user === undefined" />
			<!-- Only show "Please log in" when user is explicitly null (not loading) -->
			<div
				v-else-if="user === null"
				class="flex flex-col w-full h-full items-center justify-center"
			>
				<p class="text-center text-gray-600">Please log in to view your notifications.</p>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';

const { user } = useAuth();
const { markNotificationRead } = useNotifications();
const route = useRoute();
const { setTitleSuffix } = useTitleSuffix();

const { notification, fetch } = useNotification(route.params.id as string);

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

const i18n = useI18n();
const time = computed(() => {
	if (!notification.value) return '';
	const time = DateTime.fromMillis(notification.value.created_at * 1000).setLocale(
		i18n.locale.value
	);

	return time.toLocaleString(DateTime.DATETIME_FULL_WITH_SECONDS);
});

const relativeTime = computed(() => {
	if (!notification.value) return '';
	const time = DateTime.fromMillis(notification.value.created_at * 1000).setLocale(
		i18n.locale.value
	);

	return time.toRelative() || time.toLocaleString(DateTime.DATETIME_SHORT);
});

const mobileLink = computed(() => {
	const link = notification?.value?.link;
	if (!link) return null;

	if (link.startsWith('http')) return link;
	const normalized = link.startsWith('/') ? link.substring(1) : link;
	return `/tabs/${normalized}`;
});

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
			notification.value.read = true;
		} else {
			console.error('Failed to mark notification as read:', res.message);

			const toast = useToast();
			toast.add({
				title: 'Error',
				description: res.message || 'Failed to mark notification as read.',
				icon: 'mdi:alert-circle',
				color: 'error',
				duration: 5000
			});
		}
	}
}
</script>
