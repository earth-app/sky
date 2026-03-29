<template>
	<IonPage>
		<IonContent class="ion-padding">
			<div class="flex flex-col items-center justify-center h-full">
				<IonSpinner name="crescent" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const route = useRoute();
const { user, fetchUser } = useAuth();
const { notifySuccess, notifyError } = useAppHaptics();
const redirected = ref(false);

onMounted(async () => {
	const forceRefresh =
		route.query.force_refresh !== undefined ||
		typeof route.query.success === 'string' ||
		typeof route.query.error === 'string';
	await fetchUser(forceRefresh);
	await showQueryToast();
});

watch(
	() => user.value,
	async (currentUser) => {
		if (redirected.value || currentUser === undefined) return;
		redirected.value = true;

		if (currentUser === null) {
			await navigateTo('/login', { replace: true });
			return;
		}

		const success = typeof route.query.success === 'string' ? route.query.success : '';
		if (success === 'oauth_signup') {
			await navigateTo('/tabs/dashboard', { replace: true });
			return;
		}

		await navigateTo('/tabs/profile/editor', { replace: true });
	},
	{ immediate: true }
);

async function showQueryToast() {
	const success = typeof route.query.success === 'string' ? route.query.success : '';
	const error = typeof route.query.error === 'string' ? route.query.error : '';

	if (success) {
		switch (success) {
			case 'oauth_signup':
				await notifySuccess();
				await Toast.show({
					text: 'Welcome! Your account was created via OAuth.',
					duration: 'long'
				});
				return;
			case 'oauth_linked':
				await notifySuccess();
				await Toast.show({ text: 'OAuth provider connected successfully.', duration: 'short' });
				return;
			case 'oauth_unlinked':
				await notifySuccess();
				await Toast.show({ text: 'OAuth provider disconnected successfully.', duration: 'short' });
				return;
		}
	}

	if (error) {
		await notifyError();
		switch (error) {
			case 'provider_error':
				await Toast.show({
					text: 'The OAuth provider returned an error. Please try again.',
					duration: 'long'
				});
				return;
			case 'auth_failed':
				await Toast.show({ text: 'Authentication failed. Please try again.', duration: 'long' });
				return;
			case 'oauth_already_linked':
				await Toast.show({
					text: 'This OAuth provider is already linked to another account.',
					duration: 'long'
				});
				return;
			case 'oauth_unlink_failed':
				await Toast.show({
					text: 'Failed to unlink OAuth provider. Please try again later.',
					duration: 'long'
				});
				return;
			case 'cannot_unlink_only_method':
				await Toast.show({
					text: 'You cannot unlink your only authentication method.',
					duration: 'long'
				});
				return;
			case 'no_provider':
				await Toast.show({ text: 'No OAuth provider specified.', duration: 'long' });
				return;
			case 'no_code':
				await Toast.show({
					text: 'No authorization code was received from provider.',
					duration: 'long'
				});
				return;
			case 'invalid_provider':
				await Toast.show({ text: 'Invalid OAuth provider.', duration: 'long' });
				return;
		}
	}
}
</script>
