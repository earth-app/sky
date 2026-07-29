<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle id="profile-title"
					>Profile {{ user?.username ? `- @${user.username}` : '' }}</IonTitle
				>

				<IonButtons
					v-if="user?.id === currentUser?.id"
					slot="end"
					class="mr-2 gap-2"
				>
					<IonButton
						id="notifications"
						aria-label="Notifications"
						color="medium"
						router-link="/tabs/profile/notifications"
						class="size-8 flex items-center"
					>
						<UChip
							v-if="unreadCount > 0"
							:color="hasErrors ? 'error' : hasWarnings ? 'warning' : 'neutral'"
						>
							<UIcon
								name="mdi:bell"
								class="min-h-6 min-w-6"
							/>
						</UChip>
						<UIcon
							v-else
							name="mdi:bell"
							class="min-h-6 min-w-6"
						/>
					</IonButton>

					<IonButton
						id="settings-link"
						aria-label="Settings"
						color="tertiary"
						router-link="/tabs/settings"
						class="size-6"
					>
						<UIcon
							name="mdi:menu"
							class="min-h-6 min-w-6"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<UserMProfile
				v-if="profileUser"
				:user="profileUser"
			/>
			<div
				v-else-if="hasResolvedUser && !profileUser"
				class="flex h-screen flex-col items-center justify-center px-6"
			>
				<MInlineError
					title="Profile Not Found"
					description="This account doesn't exist, or it is no longer available."
					icon="mdi:account-off-outline"
					@retry="reload"
				/>
			</div>
			<div
				v-else
				class="flex items-center justify-center h-screen"
			>
				<IonSpinner name="crescent" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const route = useRoute();
const { user, fetchUser } = useUser(route.params.id as string);
const { hasErrors, hasWarnings, unreadCount, fetchNotifications } = useNotifications();
const { user: currentUser } = useAuth();
const hasResolvedUser = ref(false);
const profileUser = computed(() => {
	const currentUserValue = user.value;
	if (!currentUserValue) return null;
	if (!currentUserValue.account || !currentUserValue.username) return null;

	return currentUserValue;
});

function reload() {
	hasResolvedUser.value = false;
	fetchUser().finally(() => {
		hasResolvedUser.value = true;
	});
}

onMounted(() => {
	reload();
	fetchNotifications();
});
</script>
