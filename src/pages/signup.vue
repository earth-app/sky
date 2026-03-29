<template>
	<IonPage>
		<div class="flex flex-col items-center mt-8">
			<h1 class="text-3xl font-semibold mb-4 mt-24 sm:mt-8">Sign Up</h1>
			<div class="flex flex-col w-full px-8 max-w-sm gap-2 mb-4">
				<UserOAuthShield
					v-for="provider in OAUTH_PROVIDERS"
					:key="provider"
					:provider="provider"
					label="Continue with"
					context="signup"
				/>
			</div>
			<UserMSignupForm @signupSuccess="handleSignupSuccess" />
			<p class="text-sm text-gray-500 mt-3">
				Already have an account?
				<NuxtLink
					to="/login"
					class="text-primary font-semibold"
				>
					Login
				</NuxtLink>
			</p>
			<Back text />
		</div>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { OAUTH_PROVIDERS, type User } from 'types/user';

const { user, fetchUser } = useAuth();
const { notifyError } = useAppHaptics();
const route = useRoute();
const redirectingAfterSubmit = ref(false);

const { error } = route.query;
if (typeof error === 'string') {
	showSignupError(error);
}

onMounted(async () => {
	await fetchUser();

	if (user.value && !redirectingAfterSubmit.value) {
		redirectingAfterSubmit.value = true;
		await Toast.show({
			text: 'You are already logged in.',
			duration: 'short'
		});
		await navigateTo('/tabs/dashboard', { replace: true });
	}
});

async function showSignupError(errorType: string) {
	let description = 'An unknown error occurred during sign up.';

	switch (errorType) {
		case 'provider_error':
			description = 'An error occurred with the OAuth provider.';
			break;
		case 'no_provider':
			description = 'No OAuth provider was specified.';
			break;
		case 'no_code':
			description = 'No authorization code was received from the provider.';
			break;
		case 'invalid_provider':
			description = 'The selected OAuth provider is invalid.';
			break;
		case 'auth_failed':
			description = 'Authentication failed with the OAuth provider.';
			break;
	}

	await Toast.show({
		text: description,
		duration: 'long'
	});
	await notifyError();
}

async function handleSignupSuccess(_: User, hasEmail: boolean) {
	redirectingAfterSubmit.value = true;

	if (hasEmail) {
		await Toast.show({
			text: 'Verification email sent. Please verify your account.',
			duration: 'long'
		});
		await navigateTo('/verify-email', { replace: true });
	} else {
		await navigateTo('/tabs/dashboard', { replace: true });
	}

	refreshNuxtData();
}
</script>
