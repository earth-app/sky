<template>
	<IonPage>
		<IonContent :fullscreen="true">
			<div class="flex flex-col items-center mt-8">
				<h1 class="text-3xl font-semibold mb-4 mt-24 sm:mt-8">Login</h1>
				<div class="flex flex-col w-full px-8 max-w-sm gap-2 mb-4">
					<UserOAuthShield
						v-for="provider in OAUTH_PROVIDERS"
						:key="provider"
						:provider="provider"
						context="login"
					/>
				</div>
				<UserMLoginForm @loginSuccess="handleLoginSuccess" />
				<p class="text-sm text-gray-500 mt-3">
					Need an account?
					<button
						type="button"
						class="text-primary font-semibold"
						@click="goToSignup"
					>
						Sign Up
					</button>
				</p>
				<Back text />
			</div>
		</IonContent>
	</IonPage>
</template>
<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { OAUTH_PROVIDERS } from 'types/user';
import slide from '~/animations/slide';

const { user } = useAuth();
const { notifyError } = useAppHaptics();
const ionRouter = useIonRouter();
const route = useRoute();
const redirectingAfterSubmit = ref(false);

const redirectPath = computed(() => {
	const redirect = route.query.redirect;
	if (typeof redirect === 'string' && redirect.startsWith('/')) {
		return redirect;
	}

	return '/tabs/dashboard';
});

const { error } = route.query;
if (typeof error === 'string') {
	showLoginError(error);
}

watch(
	() => user.value,
	async (currentUser) => {
		if (currentUser && !redirectingAfterSubmit.value) {
			await navigateTo(redirectPath.value, { replace: true });
		}
	},
	{ immediate: true }
);

async function showLoginError(errorType: string) {
	let description = 'An unknown error occurred during login.';

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
		case 'not_authenticated':
			description = 'Please sign in before trying this action.';
			break;
	}

	await Toast.show({
		text: description,
		duration: 'long'
	});
	await notifyError();
}

function handleLoginSuccess() {
	redirectingAfterSubmit.value = true;
	navigateTo(redirectPath.value, { replace: true });
	refreshNuxtData();
}

function goToSignup() {
	ionRouter.push('/signup', slide);
}
</script>
