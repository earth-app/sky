<template>
	<IonCard
		class="w-full max-w-md p-4"
		color="dark"
	>
		<div class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold">Email Verification</h2>
			<p
				v-if="user?.account.email"
				class="text-sm text-gray-500"
			>
				Enter the 8-digit code sent to {{ user.account.email }}.
			</p>
			<p
				v-else
				class="text-sm text-gray-500"
			>
				Add an email address to your account before verifying.
			</p>

			<IonItem
				v-if="user?.account.email"
				class="rounded-lg"
			>
				<IonInput
					v-model="codeInput"
					label="Verification Code"
					label-placement="stacked"
					placeholder="12345678"
					inputmode="numeric"
					autocomplete="one-time-code"
					:maxlength="8"
					:disabled="loading"
					@ionInput="handleCodeInput"
				/>
			</IonItem>

			<div class="flex gap-2">
				<IonButton
					v-if="user?.account.email"
					color="success"
					:disabled="loading || codeInput.length !== 8"
					@click="submitCode"
				>
					<UIcon
						name="mdi:email-check-outline"
						class="mr-2"
					/>
					Verify
				</IonButton>
				<IonButton
					color="secondary"
					fill="outline"
					:disabled="loading || !user?.account.email"
					@click="resendVerification"
				>
					<UIcon
						name="mdi:email-arrow-right-outline"
						class="mr-2"
					/>
					Resend Code
				</IonButton>
			</div>

			<IonText
				v-if="errorMessage"
				color="danger"
			>
				<p class="text-sm">{{ errorMessage }}</p>
			</IonText>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const { user, sendVerificationEmail, verifyEmail } = useAuth();
const { impactLight, notifySuccess, notifyWarning, notifyError } = useAppHaptics();

const codeInput = ref('');
const errorMessage = ref('');
const loading = ref(false);

const emit = defineEmits<{
	verified: [];
}>();

function handleCodeInput(event: Event | CustomEvent<{ value?: string | null }>) {
	const customEvent = event as CustomEvent<{ value?: string | null }>;
	const target = event.target as HTMLInputElement | null;
	const rawValue = customEvent.detail?.value ?? target?.value ?? '';
	codeInput.value = rawValue.replace(/\D/g, '').slice(0, 8);
}

async function resendVerification() {
	if (!user.value?.account.email || loading.value) return;

	loading.value = true;
	errorMessage.value = '';

	try {
		const res = await sendVerificationEmail();
		if (res.success) {
			await notifySuccess();
			await Toast.show({
				text: 'Verification email sent.',
				duration: 'short'
			});
		} else {
			errorMessage.value = res.message || 'Failed to resend verification email.';
			await notifyError();
			await Toast.show({
				text: errorMessage.value,
				duration: 'long'
			});
		}
	} catch (error: any) {
		errorMessage.value = error?.message || 'Failed to resend verification email.';
		await notifyError();
		await Toast.show({
			text: errorMessage.value,
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
}

async function submitCode() {
	if (!user.value?.account.email || loading.value) return;

	const code = codeInput.value.trim();
	if (!/^\d{8}$/.test(code)) {
		errorMessage.value = 'The verification code must be exactly 8 digits.';
		await notifyWarning();
		await Toast.show({
			text: errorMessage.value,
			duration: 'long'
		});
		return;
	}

	loading.value = true;
	errorMessage.value = '';

	try {
		await impactLight();
		const res = await verifyEmail(code);
		if (res.success) {
			codeInput.value = '';
			errorMessage.value = '';
			emit('verified');
			await notifySuccess();

			await Toast.show({
				text: 'Email verified successfully.',
				duration: 'short'
			});
		} else {
			errorMessage.value = res.message || 'The verification code is incorrect.';
			await notifyError();
			await Toast.show({
				text: errorMessage.value,
				duration: 'long'
			});
		}
	} catch (error: any) {
		errorMessage.value = error?.message || 'An unexpected error occurred while verifying email.';
		await notifyError();
		await Toast.show({
			text: errorMessage.value,
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
}
</script>
