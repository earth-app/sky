<template>
	<IonCard
		class="min-w-60 w-7/8 max-w-full p-4"
		:color="theme"
	>
		<UForm
			id="login"
			:state="{ userOrEmail, password }"
			@submit="handleLogin"
			class="space-x-6 *:mb-4"
			:schema="loginSchema"
		>
			<UFormField
				label="Username or Email"
				name="userOrEmail"
				:required="true"
			>
				<IonInput
					v-model="userOrEmail"
					:disabled="isSubmitting"
					placeholder="cooldude78 or you@example.com"
					class="min-w-60 w-2/5 max-w-120"
					counter
					:maxlength="100"
					autocapitalize="off"
					autocomplete="username"
				/>
			</UFormField>

			<UFormField
				label="Password"
				name="password"
				:required="true"
			>
				<IonInput
					v-model="password"
					:disabled="isSubmitting"
					placeholder="SuperSecretPassword_"
					type="password"
					class="min-w-60 w-2/5 max-w-120"
					counter
					:maxlength="100"
					autocomplete="current-password"
				>
					<IonInputPasswordToggle slot="end" />
				</IonInput>
			</UFormField>

			<div class="flex w-full justify-center">
				<IonButton
					type="submit"
					form="login"
					color="success"
					fill="solid"
					:disabled="isSubmitting || !canSubmit"
					:aria-busy="isSubmitting"
					class="w-3/5 max-w-60 self-center"
				>
					<template v-if="isSubmitting">
						<IonSpinner
							name="crescent"
							class="mr-2"
						/>
						Logging in...
					</template>
					<template v-else>
						<UIcon
							name="mdi:lock"
							class="mr-1"
						/>
						Login
					</template>
				</IonButton>
			</div>
		</UForm>

		<UAlert
			v-if="error"
			icon="mdi:alert-box-outline"
			:title="error"
			color="error"
			class="mt-6 w-full mx-2"
		/>

		<div class="flex justify-center mt-3">
			<IonButton
				fill="clear"
				size="small"
				color="secondary"
				@click="goToForgotPassword"
			>
				Forgot your Password?
			</IonButton>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { passwordSchema } from 'schemas';
import z from 'zod';
import slide from '~/animations/slide';
import { theme } from '~/composables/useSettings';

const userOrEmailSchema = z
	.string()
	.min(3, 'Must be at least 3 characters')
	.max(100, 'Must be at most 100 characters');

const loginSchema = z.object({ userOrEmail: userOrEmailSchema, password: passwordSchema });

const userOrEmail = ref('');
const password = ref('');
const isSubmitting = ref(false);
const canSubmit = computed(() => userOrEmail.value.trim().length > 0 && password.value.length > 0);
const error = ref('');

const login = useLogin();
const { fetchUser } = useAuth();
const authStore = useAuthStore();
const { notifyError } = useAppHaptics();
const ionRouter = useIonRouter();
const route = useRoute();
const pendingLogin = useState<{
	ticket: string;
	email: string;
	expiresAt: number;
	userOrEmail: string;
	password: string;
} | null>('pendingLogin2FA', () => null);

const emit = defineEmits<{
	loginSuccess: [];
}>();

function goToForgotPassword() {
	const redirect = route.query.redirect;
	const target =
		typeof redirect === 'string' && redirect.startsWith('/')
			? `/forgot-password?redirect=${encodeURIComponent(redirect)}`
			: '/forgot-password';
	ionRouter.push(target, slide);
}

async function safeToast(text: string, duration: 'short' | 'long' = 'long') {
	try {
		await Toast.show({ text, duration });
	} catch (err) {
		console.warn('[login] toast failed:', err);
	}
}

function setLoginError(message?: string) {
	// crust's useLogin prefixes the status code (e.g. "401: Invalid credentials").
	const statusMatch = message?.match(/^(\d{3})\s*[:\-]\s*/);
	const status = statusMatch ? Number(statusMatch[1]) : null;

	if (status === 401) {
		error.value = 'Invalid username or password.';
		return;
	}

	if (status === 403) {
		error.value = 'This account is disabled.';
		return;
	}

	if (status === 409 || status === 429) {
		error.value = 'You are signing in too often. Please wait a moment and try again.';
		return;
	}

	if (status === 400 && /oauth/i.test(message ?? '')) {
		error.value =
			'This account was created with an OAuth provider. Sign in with that provider, then set a password from your profile.';
		return;
	}

	if (status && status >= 500) {
		error.value = 'The server is having trouble right now. Please try again shortly.';
		return;
	}

	error.value = formatApiError(
		message,
		'Login failed. Please check your credentials and try again.'
	);
}

function normalizeIdentifier(raw: string): string {
	const trimmed = raw.trim();
	// Emails are case-insensitive in practice; usernames are stored lowercase
	// by mantle2. Lowercase both so the Basic auth header matches the stored
	// canonical form.
	return trimmed.toLowerCase();
}

async function handleLogin() {
	if (isSubmitting.value || !canSubmit.value) return;

	isSubmitting.value = true;
	error.value = '';

	const identifier = normalizeIdentifier(userOrEmail.value);
	if (identifier !== userOrEmail.value) {
		// reflect normalization back so a retry uses the same string.
		userOrEmail.value = identifier;
	}

	if (!userOrEmailSchema.safeParse(identifier).success) {
		error.value = 'Please enter a valid username or email.';
		notifyError();
		await safeToast(error.value, 'long');
		isSubmitting.value = false;
		return;
	}

	try {
		const result = await login(identifier, password.value);

		if (result.success && result.verified) {
			// Avoid force=true when a token already exists; forcing can clear a valid token on native.
			if (!authStore.currentUser && authStore.sessionToken) {
				await fetchUser();
			}

			if (!authStore.currentUser) {
				error.value = 'Unable to load account data. Please try again.';
				notifyError();
				await safeToast(error.value, 'long');
				return;
			}

			error.value = '';

			emit('loginSuccess');

			await safeToast(`Login Successful! Welcome back, ${identifier}!`, 'short');

			await refreshNuxtData();

			// honor ?redirect= so the user lands back where they were sent to login from
			const redirect = route.query.redirect;
			if (typeof redirect === 'string' && redirect.startsWith('/')) {
				ionRouter.replace(redirect, slide);
			}
			return;
		}

		if (result.success && !result.verified) {
			// guard against a partial 2FA payload — server should always return all three,
			// but if it doesn't we'd push the user into a broken verify screen
			if (!result.ticket || !result.email || typeof result.expiresIn !== 'number') {
				error.value = 'Login response was incomplete. Please try again or contact support.';
				notifyError();
				await safeToast(error.value, 'long');
				return;
			}

			pendingLogin.value = {
				ticket: result.ticket,
				email: result.email,
				expiresAt: Date.now() + result.expiresIn * 1000,
				userOrEmail: identifier,
				password: password.value
			};

			const redirect = route.query.redirect;
			const target =
				typeof redirect === 'string' && redirect.startsWith('/')
					? `/login/verify-new-ip?redirect=${encodeURIComponent(redirect)}`
					: '/login/verify-new-ip';
			ionRouter.push(target, slide);
			return;
		}

		setLoginError(result.message);
		notifyError();
		await safeToast(error.value, 'long');
	} catch (err) {
		console.error('[login] unexpected error:', err);
		error.value = formatApiError(err, 'Login failed. Please try again.');
		notifyError();
		await safeToast(error.value, 'long');
	} finally {
		isSubmitting.value = false;
	}
}
</script>
