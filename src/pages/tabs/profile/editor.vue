<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Edit Profile</IonTitle>
				<IonButtons slot="start">
					<IonBackButton :default-href="profileRoute" />
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent>
			<div
				v-if="user"
				class="flex flex-col items-center size-full mt-4"
			>
				<UserMProfileEditor :user="user" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();
const route = useRoute();
const { notifyError } = useAppHaptics();

const profileRoute = computed(() =>
	user.value?.username ? `/tabs/profile/@${user.value.username}` : '/tabs/dashboard'
);

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
	provider_error: 'The sign-in provider returned an error while linking your account.',
	no_provider: 'No sign-in provider was specified.',
	no_code: 'The sign-in provider did not return an authorization code.',
	invalid_provider: 'That sign-in provider is not supported.',
	auth_failed: 'We could not link that account. Please try again.',
	not_authenticated: 'Please sign in again before linking another account.'
};

const errorParam = route.query.error;
if (typeof errorParam === 'string' && errorParam.length > 0) {
	const message = OAUTH_ERROR_MESSAGES[errorParam] || 'Linking your account failed.';
	void showErrorToast(message, { duration: 'long' });
	notifyError();
}
</script>
