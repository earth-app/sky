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
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import { onIonViewWillEnter } from '@ionic/vue';
import { OAUTH_PROVIDERS, type User } from 'types/user';
import slide from '~/animations/slide';

const { user, fetchUser } = useAuth();
const { notifyError } = useAppHaptics();
const ionRouter = useIonRouter();
const route = useRoute();
const redirectingAfterSubmit = ref(false);
const wasAuthenticatedAtMount = Boolean(user.value);

const { error } = route.query;
if (typeof error === 'string') {
	showSignupError(error);
}

async function bridgeReferralCode() {
	try {
		const fromQuery = typeof route.query.ref === 'string' ? route.query.ref : '';
		const code = fromQuery || (await Preferences.get({ key: 'referral_code' })).value || '';
		if (code && /^[0-9A-HJKMNP-TV-Z]{6}$/.test(code)) {
			useCookie<string | null>('referral_code').value = code;
		}
	} catch (err) {
		console.warn('[signup] failed to bridge referral code:', err);
	}
}

onMounted(() => {
	void bridgeReferralCode();
	// kick off hydration, but don't await — the watcher below handles redirect.
	fetchUser();
});

watch(
	() => user.value,
	async (currentUser) => {
		if (!currentUser) {
			redirectingAfterSubmit.value = false;
			return;
		}
		if (redirectingAfterSubmit.value) return;
		redirectingAfterSubmit.value = true;

		let message = 'You are already logged in.';
		if (!wasAuthenticatedAtMount) {
			const createdMs = currentUser.created_at ? new Date(currentUser.created_at).getTime() : 0;
			const isNewAccount = createdMs > 0 && Date.now() - createdMs <= 60 * 1000;
			message = isNewAccount ? 'Welcome to The Earth App!' : 'Welcome back!';
		}
		try {
			await Toast.show({ text: message, duration: 'short' });
		} catch (err) {
			console.warn('[signup] toast failed:', err);
		}
		await navigateTo('/tabs/dashboard', { replace: true });
	},
	{ immediate: true }
);

// page kept alive in the outlet; re-arm on re-entry
onIonViewWillEnter(() => {
	if (!user.value) redirectingAfterSubmit.value = false;
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
	},
	{
		id: 'signup',
		title: "Know Someone Who'd Love This?",
		description:
			'Exploring is more fun together! Invite a friend to sign up too. They can join in seconds, and once you have an account you can earn rewards for everyone you bring along.',
		footer: 'Tap Invite to share The Earth App with a friend.',
		icon: 'mdi:account-multiple-plus-outline',
		placement: 'bottom',
		cta: {
			label: 'Invite a Friend',
			icon: 'mdi:share-variant',
			color: 'tertiary',
			advance: false,
			handler: async () => {
				// pre-account: a primitive share with no referral code (there's no account yet)
				try {
					await Share.share({
						title: 'Join me on The Earth App',
						text: 'I just found The Earth App; discover hobbies, quests, and more. Come join me!',
						url: 'https://app.earth-app.com',
						dialogTitle: 'Invite a Friend'
					});
				} catch {
					// user dismissed the share sheet or it's unavailable — stay quiet
				}
			}
		}
	}
];
</script>
