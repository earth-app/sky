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
					class="mr-2 gap-1"
				>
					<IonButton
						color="primary"
						router-link="/tabs/profile/editor"
						class="size-6"
					>
						<UIcon
							name="mdi:pencil-outline"
							class="min-h-6 min-w-6"
						/>
					</IonButton>

					<IonButton
						id="settings-link"
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
				v-if="user"
				:user="user"
			/>
			<div
				v-else-if="user === null"
				class="flex items-center justify-center h-screen"
			>
				<IonText>User not found: {{ route.params.id }}</IonText>
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
const { user: currentUser } = useAuth();

onMounted(() => {
	fetchUser();
});
</script>
