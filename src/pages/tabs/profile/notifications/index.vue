<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonTitle id="notifications-title">Notifications</IonTitle>

				<IonButtons slot="end">
					<IonButton
						color="secondary"
						aria-label="Help"
						@click="startTour('notifications')"
					>
						<UIcon
							name="mdi:progress-question"
							class="size-5"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<UserNotificationMList :additional="true" />

			<ClientOnly>
				<MSiteTour
					:steps="notificationsTour"
					name="Notifications Tour"
					tour-id="notifications"
				/>
			</ClientOnly>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { unreadCount, fetch, fetchNotifications, markAllNotificationsRead } = useNotifications();
const { startTour, startTourIfNew } = useSiteTour();

onMounted(() => {
	fetchNotifications();
	// auto-show the first time a user lands on their notifications page
	startTourIfNew('notifications');
});

const notificationsTour = computed<SiteTourStep[]>(() => [
	{
		id: 'notifications-title',
		title: 'Your Notifications',
		description:
			'Everything that needs your attention lands here: friend requests, replies, quest progress, badge unlocks, event reminders, and important account messages.',
		footer: "You'll also see a count on the bell icon on your profile.",
		icon: 'mdi:bell-outline',
		onEnter: () => fetch()
	},
	{
		id: 'notifications-count',
		title: 'Unread Count',
		description:
			'This is your current unread count. Opening a notification or tapping it in the list marks it read automatically.',
		footer:
			unreadCount.value > 0
				? `You have ${unreadCount.value} unread. The bell on your profile mirrors this number.`
				: 'The bell icon on your profile mirrors this number.',
		icon: 'mdi:counter',
		cta:
			unreadCount.value > 0
				? {
						label: 'Mark All as Read',
						icon: 'mdi:email-open-multiple-outline',
						color: 'tertiary',
						advance: true,
						handler: async () => {
							const res = await markAllNotificationsRead();
							if (!res.success) {
								await showErrorToast(res.message, {
									fallback: 'Could not mark all notifications as read.'
								});
							}
						}
					}
				: undefined
	},
	{
		id: 'notifications-list',
		title: 'Notification Feed',
		description:
			'Each notification has an action: visit a profile, view a quest, open an event. Notifications older than a few weeks are archived automatically.',
		footer:
			"Manage which kinds of notifications you receive from your profile editor's Email Notifications switch.",
		icon: 'mdi:format-list-bulleted',
		highlightPadding: 8,
		waitFor: 'notifications-list'
	}
]);
</script>
