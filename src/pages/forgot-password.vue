<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/login" />
				</IonButtons>
				<IonTitle>Reset Password</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent class="ion-padding">
			<div class="flex flex-col items-center pt-6 gap-4 max-w-md mx-auto">
				<UIcon
					name="mdi:lock-reset"
					class="size-12 text-primary"
				/>
				<h1 class="text-xl font-semibold m-0!">Forgot your Password?</h1>
				<p class="text-sm text-center text-gray-600 dark:text-gray-300">
					Enter the email on your account and we'll send a reset link. The link works for one hour.
				</p>

				<UForm
					id="forgot-password"
					:state="{ email }"
					:schema="formSchema"
					class="w-full mt-2 flex flex-col gap-3"
					@submit="submit"
				>
					<UFormField
						label="Email"
						name="email"
						:required="true"
					>
						<IonInput
							v-model="email"
							placeholder="you@example.com"
							type="email"
							autocomplete="email"
							:disabled="loading"
						/>
					</UFormField>

					<IonButton
						type="submit"
						form="forgot-password"
						expand="block"
						color="success"
						:disabled="loading || !canSubmit"
					>
						<template v-if="loading">
							<IonSpinner
								name="crescent"
								class="mr-2"
							/>
							Sending...
						</template>
						<template v-else>
							<UIcon
								name="mdi:email-arrow-right-outline"
								class="mr-2 size-5"
							/>
							Send Reset Link
						</template>
					</IonButton>
				</UForm>

				<p class="text-xs text-gray-500 dark:text-gray-300 text-center mt-2">
					Don't see the email after a minute? Check spam, or wait two minutes before requesting
					another.
				</p>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { emailSchema } from 'schemas';
import z from 'zod';

const { sendResetPasswordEmail } = useAuth();
const ionRouter = useIonRouter();

const formSchema = z.object({ email: emailSchema });

const email = ref('');
const loading = ref(false);
const canSubmit = computed(() => email.value.trim().length > 4);

async function submit() {
	if (loading.value) return;
	loading.value = true;
	try {
		const res = await sendResetPasswordEmail(email.value.trim().toLowerCase());

		if (res.success || (res as { status?: number }).status === 204) {
			await Toast.show({
				text: `If an account exists for ${email.value.trim()}, a reset link is on its way.`,
				duration: 'long'
			});

			if (ionRouter.canGoBack()) {
				ionRouter.back();
			} else {
				ionRouter.navigate('/login', 'back', 'replace');
			}
			return;
		}

		const status = (res as { status?: number }).status;
		if (status === 429) {
			await showErrorToast(
				'Too many reset requests for this email. Wait a couple minutes and try again.'
			);
			return;
		}
		await showErrorToast(res.message, {
			fallback: 'Could not send the reset email. Please try again in a moment.'
		});
	} finally {
		loading.value = false;
	}
}
</script>
