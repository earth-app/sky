<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/profile/editor" />
				</IonButtons>
				<IonTitle>Verify Email</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent class="ion-padding">
			<div
				v-if="user && !user.account.email_verified"
				class="flex flex-col items-center"
			>
				<UserMEmailVerification @verified="onEmailVerified" />
			</div>
			<div
				v-else-if="user && user.account.email_verified"
				class="flex flex-col items-center justify-center h-full gap-3"
			>
				<UIcon
					name="mdi:email-check-outline"
					class="size-12 text-green-500"
				/>
				<p class="text-center">Your email is already verified.</p>
				<IonButton
					color="success"
					@click="goToProfileEditor"
				>
					Back to Profile
				</IonButton>
			</div>
			<div
				v-else-if="user === null"
				class="flex flex-col items-center justify-center h-full gap-3"
			>
				<p class="text-center text-gray-500">Please log in to verify your email.</p>
				<IonButton
					color="tertiary"
					@click="goToLogin"
				>
					Go to Login
				</IonButton>
			</div>
			<div
				v-else
				class="flex flex-col items-center justify-center h-full"
			>
				<IonSpinner name="crescent" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const { user, fetchUser } = useAuth();

onMounted(() => {
	fetchUser();
});

watch(
	() => user.value,
	async (currentUser) => {
		if (currentUser === null) {
			await Toast.show({
				text: 'You must be logged in to verify your email.',
				duration: 'long'
			});
		}
	},
	{ immediate: true }
);

async function onEmailVerified() {
	if (user.value) {
		user.value.account.email_verified = true;
	}

	await Toast.show({
		text: 'Your email has been successfully verified.',
		duration: 'short'
	});

	await navigateTo('/tabs/profile/editor', { replace: true });
}

function goToProfileEditor() {
	navigateTo('/tabs/profile/editor', { replace: true });
}

function goToLogin() {
	navigateTo('/login', { replace: true });
}
</script>
