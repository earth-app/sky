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
				<template v-if="!hasValidLink">
					<UIcon
						name="mdi:link-variant-off"
						class="size-12 text-red-500"
					/>
					<h1 class="text-xl font-semibold m-0!">Reset Link Invalid</h1>
					<p class="text-sm text-center text-gray-600 dark:text-gray-300">
						This reset link is missing required information. Request a new one from the login
						screen.
					</p>
					<IonButton
						expand="block"
						color="tertiary"
						@click="goToForgotPassword"
					>
						Request a New Link
					</IonButton>
				</template>
				<template v-else-if="tokenDead">
					<UIcon
						name="mdi:link-variant-off"
						class="size-12 text-red-500"
					/>
					<h1 class="text-xl font-semibold m-0!">Reset Link Expired</h1>
					<p class="text-sm text-center text-gray-600 dark:text-gray-300">
						This link is no longer valid. Reset links work for one hour — request a fresh one.
					</p>
					<IonButton
						expand="block"
						color="tertiary"
						@click="goToForgotPassword"
					>
						Request a New Link
					</IonButton>
				</template>
				<template v-else>
					<UIcon
						name="mdi:lock-reset"
						class="size-12 text-primary"
					/>
					<h1 class="text-xl font-semibold m-0!">Choose a New Password</h1>
					<p class="text-sm text-center text-gray-600 dark:text-gray-300">
						Enter a new password for your account. You'll need to log in with it afterwards.
					</p>

					<UForm
						id="reset-password"
						:state="{ password, confirm }"
						:schema="formSchema"
						class="w-full mt-2 flex flex-col gap-3"
						@submit="submit"
					>
						<UFormField
							label="New Password"
							name="password"
							:required="true"
						>
							<IonInput
								v-model="password"
								type="password"
								autocomplete="new-password"
								:disabled="loading"
							>
								<IonInputPasswordToggle slot="end" />
							</IonInput>
						</UFormField>
						<UFormField
							label="Confirm Password"
							name="confirm"
							:required="true"
						>
							<IonInput
								v-model="confirm"
								type="password"
								autocomplete="new-password"
								:disabled="loading"
							>
								<IonInputPasswordToggle slot="end" />
							</IonInput>
						</UFormField>

						<IonButton
							type="submit"
							form="reset-password"
							expand="block"
							color="success"
							:disabled="loading || !canSubmit"
						>
							<template v-if="loading">
								<IonSpinner
									name="crescent"
									class="mr-2"
								/>
								Saving…
							</template>
							<template v-else>
								<UIcon
									name="mdi:lock-check"
									class="mr-2 size-5"
								/>
								Reset Password
							</template>
						</IonButton>
					</UForm>
				</template>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { passwordSchema } from 'schemas';
import z from 'zod';
import slide from '~/animations/slide';

const route = useRoute();
const ionRouter = useIonRouter();
const { resetPassword } = useAuth();

const uid = computed(() => (typeof route.query.uid === 'string' ? route.query.uid : ''));
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const hasValidLink = computed(() => uid.value.length > 0 && token.value.length > 0);

const formSchema = z
	.object({ password: passwordSchema, confirm: passwordSchema })
	.refine((d) => d.password === d.confirm, {
		message: 'Passwords do not match',
		path: ['confirm']
	});

const password = ref('');
const confirm = ref('');
const loading = ref(false);
const tokenDead = ref(false);
const canSubmit = computed(() => password.value.length >= 8 && password.value === confirm.value);

async function submit() {
	if (loading.value) return;
	loading.value = true;
	try {
		const res = await resetPassword(uid.value, token.value, password.value);
		if (res.success) {
			await Toast.show({
				text: 'Password reset. Please log in with your new password.',
				duration: 'long'
			});
			password.value = '';
			confirm.value = '';
			ionRouter.replace('/login', slide);
			return;
		}

		const msg = (res.message || '').toLowerCase();
		if (res.status === 400 && /invalid|expired/.test(msg)) {
			tokenDead.value = true;
			return;
		}
		await showErrorToast(res.message, {
			fallback: 'Could not reset your password. Try again or request a new link.'
		});
	} finally {
		loading.value = false;
	}
}

function goToForgotPassword() {
	ionRouter.replace('/forgot-password', slide);
}
</script>
