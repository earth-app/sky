<template>
	<IonPage>
		<IonContent :fullscreen="true">
			<div class="flex flex-col items-center mt-8">
				<div class="flex items-center gap-2 mb-4 mt-24 sm:mt-8">
					<h1
						id="login"
						class="text-3xl font-semibold m-0"
					>
						Login
					</h1>
					<IonButton
						fill="outline"
						size="small"
						color="secondary"
						aria-label="Help"
						@click="startTour('login')"
					>
						<UIcon
							name="mdi:progress-question"
							class="size-5"
						/>
					</IonButton>
				</div>
				<div
					id="login-oauth"
					class="flex flex-col w-full px-8 max-w-sm gap-2 mb-4"
				>
					<UserOAuthShield
						v-for="provider in OAUTH_PROVIDERS"
						:key="provider"
						:provider="provider"
						context="login"
					/>
				</div>
				<div
					id="login-form"
					class="w-full flex justify-center"
				>
					<UserMLoginForm @loginSuccess="handleLoginSuccess" />
				</div>
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

			<ClientOnly>
				<MSiteTour
					:steps="loginTour"
					name="Login Tour"
					tour-id="login"
				/>
			</ClientOnly>
		</IonContent>
	</IonPage>
</template>
<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { OAUTH_PROVIDERS } from 'types/user';
import slide from '~/animations/slide';

const { user, fetchUser } = useAuth();
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

onMounted(() => {
	// hydrate from the stored session token on cold launch so an already-signed-in
	// user doesn't see the login form for a beat before the watcher fires.
	fetchUser();
});

watch(
	() => user.value,
	async (currentUser) => {
		if (currentUser && !redirectingAfterSubmit.value) {
			redirectingAfterSubmit.value = true;
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

	try {
		await Toast.show({ text: description, duration: 'long' });
	} catch (err) {
		console.warn('[login] toast failed:', err);
	}
	notifyError();
}

function handleLoginSuccess() {
	redirectingAfterSubmit.value = true;
	navigateTo(redirectPath.value, { replace: true });
	refreshNuxtData();
}

function goToSignup() {
	ionRouter.push('/signup', slide);
}

const { startTour } = useSiteTour();

const loginTour: SiteTourStep[] = [
	{
		id: 'login',
		title: 'Welcome Back',
		description:
			'Glad to have you again. You can sign in with the same method you used to sign up — OAuth provider, or username + password.',
		footer: 'Forgot your password? You can reset it from the form below.',
		icon: 'mdi:login-variant'
	},
	{
		id: 'login-oauth',
		title: 'OAuth Sign-In',
		description:
			'If you signed up using Google, Microsoft, or GitHub, tap the matching button. You only need to authorize once per device.',
		footer: 'Linked multiple providers? Any of them gets you in.',
		icon: 'mdi:link-variant'
	},
	{
		id: 'login-form',
		title: 'Username & Password',
		description:
			'Use the username or email you signed up with, plus your password. We never email your password — if asked to "confirm" it via email, that\'s a phishing attempt.',
		footer: 'Trouble logging in? Use the password reset link to get back in via email.',
		icon: 'mdi:form-textbox-password'
	}
];
</script>
