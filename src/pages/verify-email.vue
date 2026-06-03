<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/profile/editor" />
				</IonButtons>
				<IonTitle>Verify Email</IonTitle>

				<IonButtons slot="end">
					<IonButton
						v-if="user && !user.account.email_verified"
						fill="clear"
						color="secondary"
						aria-label="Help"
						@click="startTour('verify-email')"
					>
						<UIcon
							name="mdi:progress-question"
							class="size-5"
						/>
					</IonButton>
				</IonButtons>
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

			<ClientOnly>
				<MSiteTour
					:steps="verifyEmailTour"
					name="Verify Email Tour"
					tour-id="verify-email"
				/>
			</ClientOnly>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const { user, fetchUser, sendVerificationEmail } = useAuth();
const { notifySuccess } = useAppHaptics();
const { startTour, startTourIfNew } = useSiteTour();

onMounted(async () => {
	await fetchUser();
	if (user.value && !user.value.account.email_verified) {
		startTourIfNew('verify-email');
	}
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
	await fetchUser(true).catch(() => {});

	notifySuccess();
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

async function resendVerificationFromTour() {
	const res = await sendVerificationEmail();
	if (res.success) {
		await Toast.show({
			text: res.data?.message || 'A fresh verification email is on its way.',
			duration: 'short'
		});
	} else {
		await showErrorToast(res.message, {
			fallback: 'Wait a moment, then try again.'
		});
	}
}

const verifyEmailTour: SiteTourStep[] = [
	{
		id: 'verification-title',
		title: 'Verify Your Email',
		description:
			"We've sent a verification email to the address on your account. Enter the 8-digit code below — or tap the link inside the email — to confirm it's yours.",
		footer: "Can't see it? Check your spam folder — it sometimes lands there on first sign-up.",
		icon: 'mdi:email-check-outline',
		placement: 'bottom',
		dim: true,
		waitFor: 'verification-title'
	},
	{
		id: 'verification-help',
		title: "Didn't Get the Email?",
		description:
			"Request a fresh one with the button below. There's a small cooldown to keep things safe — wait a moment if the resend button isn't responding.",
		footer:
			'Verification codes expire after 24 hours. Use the latest code; older ones stop working.',
		icon: 'mdi:email-sync-outline',
		cta: {
			label: 'Resend Email Now',
			icon: 'mdi:email-arrow-right-outline',
			color: 'tertiary',
			advance: true,
			handler: resendVerificationFromTour
		}
	},
	{
		title: 'What You Unlock',
		description:
			'A verified email lets you reset your password if you ever get locked out, receive important account alerts, and post in some community spaces. We never share your address.',
		footer: "Go check your inbox — we'll see you back here once you enter the code.",
		icon: 'mdi:shield-check-outline',
		placement: 'center'
	}
];
</script>
