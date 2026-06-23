<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/login" />
				</IonButtons>
				<IonTitle>Verify Sign-in</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent class="ion-padding">
			<div
				v-if="pendingLogin && !completing"
				class="flex flex-col items-center w-full max-w-md mx-auto gap-3"
			>
				<UIcon
					name="mdi:shield-key-outline"
					class="size-12 text-primary mt-2"
				/>
				<h2 class="text-xl font-semibold text-center">Verify it's You</h2>
				<p class="text-sm text-center text-gray-500">
					We sent an 8-digit code to
					<span class="font-medium">{{ pendingLogin.email }}</span
					>. Enter it below to finish signing in.
				</p>

				<IonItem class="rounded-lg w-full">
					<IonInput
						v-model="codeInput"
						label="Verification Code"
						label-placement="stacked"
						placeholder="12345678"
						inputmode="numeric"
						autocomplete="one-time-code"
						:maxlength="8"
						:disabled="loading || expired"
						@ionInput="handleCodeInput"
					/>
				</IonItem>

				<p
					class="text-xs text-gray-500 self-start"
					aria-live="polite"
				>
					<template v-if="secondsRemaining > 0">
						Code expires in {{ formattedRemaining }}.
					</template>
					<template v-else> Code expired. Request a new one to continue. </template>
				</p>

				<div class="flex flex-row items-center gap-2 w-full justify-center flex-wrap">
					<IonButton
						color="success"
						:disabled="loading || expired || codeInput.length !== 8"
						@click="submitCode"
					>
						<UIcon
							name="mdi:login"
							class="mr-2"
						/>
						<template v-if="loading">
							<IonSpinner
								name="crescent"
								class="mr-2"
							/>
							Verifying...
						</template>
						<template v-else> Verify </template>
					</IonButton>
					<IonButton
						color="secondary"
						fill="outline"
						:disabled="loading || resendCooldown > 0 || !pendingLogin.password"
						@click="resend"
					>
						<UIcon
							name="mdi:email-arrow-right-outline"
							class="mr-2"
						/>
						<template v-if="resendCooldown > 0"> Resend in {{ resendCooldown }}s </template>
						<template v-else> Resend code </template>
					</IonButton>
				</div>

				<IonButton
					color="medium"
					fill="clear"
					size="small"
					:disabled="loading"
					@click="backToLogin"
				>
					Back to login
				</IonButton>

				<IonText
					v-if="errorMessage"
					color="danger"
					class="w-full"
				>
					<p class="text-sm text-center">{{ errorMessage }}</p>
				</IonText>
			</div>
			<div
				v-else-if="completing"
				class="flex flex-col items-center justify-center h-full gap-3"
			>
				<IonSpinner
					name="crescent"
					class="size-10"
				/>
				<p class="text-center text-gray-500">Signing you in...</p>
			</div>
			<div
				v-else
				class="flex flex-col items-center justify-center h-full gap-3"
			>
				<UIcon
					name="mdi:login-variant"
					class="size-12 text-gray-600 dark:text-gray-300"
				/>
				<p class="text-center text-gray-700 dark:text-gray-200">No pending login verification.</p>
				<IonButton
					color="tertiary"
					@click="backToLogin"
				>
					Go to Login
				</IonButton>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const router = useIonRouter();
const route = useRoute();
const verifyNewIPLogin = useVerifyNewIPLogin();
const login = useLogin();
const { fetchUser } = useAuth();
const { notifySuccess, notifyError, notifyWarning } = useAppHaptics();

const pendingLogin = useState<{
	ticket: string;
	email: string;
	expiresAt: number;
	userOrEmail: string;
	password: string;
} | null>('pendingLogin2FA', () => null);

const codeInput = ref('');
const errorMessage = ref('');
const loading = ref(false);
const completing = ref(false);
const now = ref(Date.now());
const resendCooldown = ref(0);

let tickHandle: ReturnType<typeof setInterval> | null = null;
let cooldownHandle: ReturnType<typeof setInterval> | null = null;

const secondsRemaining = computed(() => {
	if (!pendingLogin.value) return 0;
	return Math.max(0, Math.floor((pendingLogin.value.expiresAt - now.value) / 1000));
});

const expired = computed(() => secondsRemaining.value <= 0);

const formattedRemaining = computed(() => {
	const total = secondsRemaining.value;
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
});

function startCountdown() {
	if (tickHandle) clearInterval(tickHandle);
	tickHandle = setInterval(() => {
		now.value = Date.now();
	}, 1000);
}

function stopCountdown() {
	if (tickHandle) {
		clearInterval(tickHandle);
		tickHandle = null;
	}
}

// Ionic keeps pages alive in the navigation stack, so we (re)start the countdown
// every time this page becomes visible, e.g. after backgrounding the app and
// returning, or after backing into the page from another route.
onIonViewWillEnter(() => {
	now.value = Date.now();
	if (pendingLogin.value) startCountdown();
});

onIonViewDidLeave(() => {
	stopCountdown();
});

onBeforeUnmount(() => {
	stopCountdown();
	if (cooldownHandle) clearInterval(cooldownHandle);
});

function handleCodeInput(event: Event | CustomEvent<{ value?: string | null }>) {
	const customEvent = event as CustomEvent<{ value?: string | null }>;
	const target = event.target as HTMLInputElement | null;
	const rawValue = customEvent.detail?.value ?? target?.value ?? '';
	codeInput.value = rawValue.replace(/\D/g, '').slice(0, 8);

	if (codeInput.value.length === 8 && !loading.value && !expired.value) {
		submitCode();
	}
}

function clearPending() {
	pendingLogin.value = null;
}

function backToLogin() {
	clearPending();
	codeInput.value = '';
	router.replace('/login');
}

function startResendCooldown(seconds: number) {
	resendCooldown.value = Math.max(0, Math.floor(seconds));
	if (cooldownHandle) clearInterval(cooldownHandle);
	cooldownHandle = setInterval(() => {
		resendCooldown.value -= 1;
		if (resendCooldown.value <= 0 && cooldownHandle) {
			clearInterval(cooldownHandle);
			cooldownHandle = null;
		}
	}, 1000);
}

async function submitCode() {
	if (!pendingLogin.value || loading.value) return;

	errorMessage.value = '';

	const code = codeInput.value.trim();
	if (!/^\d{8}$/.test(code)) {
		errorMessage.value = 'The verification code must be exactly 8 digits.';
		notifyWarning();
		return;
	}

	loading.value = true;
	try {
		const res = await verifyNewIPLogin(pendingLogin.value.ticket, code);

		if (res.success) {
			// Flip into the "completing" branch synchronously so clearing pendingLogin
			// below doesn't briefly render the empty "No pending verification" state
			// while we await fetchUser/Toast/navigateTo.
			completing.value = true;
			clearPending();
			notifySuccess();

			// Composable already populated the auth store, but ensure the user object is
			// hydrated for downstream UI (bell badge, profile, etc.) before navigating.
			await fetchUser();

			await Toast.show({
				text: 'Sign-in successful.',
				duration: 'short'
			});

			const redirect = route.query.redirect;
			const target =
				typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/tabs/dashboard';
			// Ionic router (root replace) so the outlet swaps into /tabs; navigateTo can't.
			router.navigate(target, 'root', 'replace');
			await refreshNuxtData();
			return;
		}

		errorMessage.value = res.message;
		codeInput.value = '';
		notifyError();
		await Toast.show({
			text: res.message,
			duration: 'long'
		});

		if (!res.retryAllowed) {
			// Ticket is dead (expired, exhausted, or invalid). Send the user back to login.
			clearPending();
			setTimeout(() => router.replace('/login'), 1500);
		}
	} finally {
		loading.value = false;
	}
}

async function resend() {
	if (!pendingLogin.value || !pendingLogin.value.password || loading.value) return;
	loading.value = true;
	errorMessage.value = '';

	try {
		const result = await login(pendingLogin.value.userOrEmail, pendingLogin.value.password);

		if (result.success && !result.verified) {
			pendingLogin.value = {
				...pendingLogin.value,
				ticket: result.ticket,
				email: result.email,
				expiresAt: Date.now() + result.expiresIn * 1000
			};
			codeInput.value = '';
			now.value = Date.now();
			startCountdown();
			notifySuccess();
			await Toast.show({
				text: 'A new code has been emailed to you.',
				duration: 'short'
			});
		} else if (result.success && result.verified) {
			// IP became known between attempts; user is logged in already.
			clearPending();
			await fetchUser();
			router.navigate('/tabs/dashboard', 'root', 'replace');
		} else {
			// 429 with retry_after: start the cooldown so the resend button stays disabled.
			if (result.retryAfter && result.retryAfter > 0) {
				startResendCooldown(result.retryAfter);
			}
			errorMessage.value = result.message;
			notifyError();
			await Toast.show({
				text: result.message,
				duration: 'long'
			});
		}
	} finally {
		loading.value = false;
	}
}
</script>
