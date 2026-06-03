<template>
	<IonPage>
		<IonContent :fullscreen="true">
			<div class="flex flex-col items-center mt-8">
				<div class="flex items-center gap-2 mb-4 mt-24 sm:mt-8">
					<h1
						id="signup"
						class="text-3xl font-semibold m-0"
					>
						Sign Up
					</h1>
					<IonButton
						fill="outline"
						size="small"
						color="secondary"
						aria-label="Help"
						@click="startTour('signup')"
					>
						<UIcon
							name="mdi:progress-question"
							class="size-5"
						/>
					</IonButton>
				</div>
				<div
					id="signup-oauth"
					class="flex flex-col w-full px-8 max-w-sm gap-2 mb-4"
				>
					<UserOAuthShield
						v-for="provider in OAUTH_PROVIDERS"
						:key="provider"
						:provider="provider"
						label="Continue with"
						context="signup"
					/>
				</div>
				<div
					id="signup-form"
					class="w-full flex justify-center"
				>
					<UserMSignupForm @signupSuccess="handleSignupSuccess" />
				</div>
				<p class="text-sm text-gray-500 mt-3">
					Already have an account?
					<button
						type="button"
						class="text-primary font-semibold"
						@click="goToLogin"
					>
						Login
					</button>
				</p>
				<Back text />
			</div>

			<ClientOnly>
				<MSiteTour
					:steps="signupTour"
					name="Sign Up Tour"
					tour-id="signup"
				/>
			</ClientOnly>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { OAUTH_PROVIDERS, type User } from 'types/user';
import slide from '~/animations/slide';

const { user, fetchUser } = useAuth();
const { notifyError } = useAppHaptics();
const ionRouter = useIonRouter();
const route = useRoute();
const redirectingAfterSubmit = ref(false);

const { error } = route.query;
if (typeof error === 'string') {
	showSignupError(error);
}

onMounted(() => {
	// kick off hydration, but don't await — the watcher below handles redirect.
	fetchUser();
});

// Watcher (instead of one-shot onMounted) so a late hydration (deep-link OAuth
// return, slow API) still redirects the user away from the signup form.
watch(
	() => user.value,
	async (currentUser) => {
		if (!currentUser || redirectingAfterSubmit.value) return;
		redirectingAfterSubmit.value = true;
		try {
			await Toast.show({ text: 'You are already logged in.', duration: 'short' });
		} catch (err) {
			console.warn('[signup] toast failed:', err);
		}
		await navigateTo('/tabs/dashboard', { replace: true });
	},
	{ immediate: true }
);

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

	try {
		await Toast.show({ text: description, duration: 'long' });
	} catch (err) {
		console.warn('[signup] toast failed:', err);
	}
	notifyError();
}

async function handleSignupSuccess(_: User, hasEmail: boolean) {
	redirectingAfterSubmit.value = true;

	if (hasEmail) {
		try {
			await Toast.show({
				text: 'Verification email sent. Please verify your account.',
				duration: 'long'
			});
		} catch (err) {
			console.warn('[signup] toast failed:', err);
		}
		await navigateTo('/verify-email', { replace: true });
	} else {
		await navigateTo('/tabs/dashboard', { replace: true });
	}

	refreshNuxtData();
}

function goToLogin() {
	ionRouter.push('/login', slide);
}

const { startTour } = useSiteTour();

const signupTour: SiteTourStep[] = [
	{
		id: 'signup',
		title: 'Welcome to Sign Up',
		description:
			"Create an account to unlock personalized recommendations, badges, quests, friends, and Impact Points. You'll be one of us in under a minute.",
		footer: "We'll walk through your options.",
		icon: 'mdi:account-plus-outline',
		placement: 'bottom'
	},
	{
		id: 'signup-oauth',
		title: 'Sign Up with a Provider',
		description:
			'The fastest path: sign in with Google, Microsoft, or GitHub. No password to remember, and you can link more providers later.',
		footer: 'We only request the bare minimum — your email and basic profile.',
		icon: 'mdi:link-variant',
		highlightPadding: 8
	},
	{
		id: 'signup-form',
		title: 'Or Use Email & Password',
		description:
			'Prefer the classic route? Use a username, email, and a strong password. You can always link an OAuth provider later from your profile.',
		footer:
			'A long, unique passphrase beats a complicated short one. A password manager makes it painless.',
		icon: 'mdi:form-textbox',
		highlightPadding: 8
	}
];
</script>
