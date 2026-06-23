<template>
	<IonCard
		class="w-full max-w-md p-4"
		color="dark"
	>
		<div class="flex flex-col gap-3">
			<h2
				id="verification-title"
				class="text-xl font-semibold"
			>
				Email Verification
			</h2>
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
					id="verification-help"
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

			<p
				v-if="user?.account.email && codeCountdownLabel"
				class="text-xs text-gray-600 dark:text-gray-300"
				:class="codeExpired ? 'text-red-500 dark:text-red-400 font-medium' : ''"
				aria-live="polite"
			>
				{{ codeCountdownLabel }}
			</p>

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

// server TTL is 15min; we only show the countdown after a successful resend,
// since we don't know the original send time on first mount
const CODE_TTL_MS = 15 * 60 * 1000;
const codeExpiresAt = ref<number | null>(null);
const now = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;

const codeExpired = computed(
	() => codeExpiresAt.value !== null && now.value >= codeExpiresAt.value
);
const codeCountdownLabel = computed(() => {
	if (codeExpiresAt.value === null) return '';
	const remainingMs = codeExpiresAt.value - now.value;
	if (remainingMs <= 0) return 'This code expired; request a new one.';
	const total = Math.floor(remainingMs / 1000);
	const m = Math.floor(total / 60)
		.toString()
		.padStart(1, '0');
	const s = (total % 60).toString().padStart(2, '0');
	return `Code expires in ${m}:${s}`;
});

onMounted(() => {
	tickHandle = setInterval(() => {
		now.value = Date.now();
	}, 1000);
});

onBeforeUnmount(() => {
	if (tickHandle) clearInterval(tickHandle);
	tickHandle = null;
});

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
			codeExpiresAt.value = Date.now() + CODE_TTL_MS;
			now.value = Date.now();
			notifySuccess();
			await Toast.show({
				text: 'Verification email sent.',
				duration: 'short'
			});
		} else {
			errorMessage.value = res.message || 'Failed to resend verification email.';
			notifyError();
			await Toast.show({
				text: errorMessage.value,
				duration: 'long'
			});
		}
	} catch (error: any) {
		errorMessage.value = extractServerMessage(error, 'Failed to resend verification email.');
		notifyError();
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
		notifyWarning();
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
			notifySuccess();

			await Toast.show({
				text: 'Email verified successfully.',
				duration: 'short'
			});
		} else {
			errorMessage.value = res.message || 'The verification code is incorrect.';
			notifyError();
			await Toast.show({
				text: errorMessage.value,
				duration: 'long'
			});
		}
	} catch (error: any) {
		errorMessage.value = extractServerMessage(
			error,
			'An unexpected error occurred while verifying email.'
		);
		notifyError();
		await Toast.show({
			text: errorMessage.value,
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
}
</script>
