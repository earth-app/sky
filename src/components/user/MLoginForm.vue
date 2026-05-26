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
			:schema="z.object({ userOrEmail: userOrEmailSchema, password: passwordSchema })"
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
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { passwordSchema } from 'schemas';
import z from 'zod';
import slide from '~/animations/slide';

const userOrEmailSchema = z
	.string()
	.min(3, 'Must be at least 3 characters')
	.max(100, 'Must be at most 100 characters');

const userOrEmail = ref('');
const password = ref('');
const isSubmitting = ref(false);
const canSubmit = computed(() => userOrEmail.value.trim().length > 0 && password.value.length > 0);
const error = ref('');

const login = useLogin();
const { fetchUser } = useAuth();
const authStore = useAuthStore();
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

	error.value = formatApiError(
		message,
		'Login failed. Please check your credentials and try again.'
	);
}

async function handleLogin() {
	if (isSubmitting.value || !canSubmit.value) return;

	isSubmitting.value = true;
	error.value = '';

	try {
		const result = await login(userOrEmail.value, password.value);

		if (result.success && result.verified) {
			// Avoid force=true when a token already exists; forcing can clear a valid token on native.
			if (!authStore.currentUser && authStore.sessionToken) {
				await fetchUser();
			}

			if (!authStore.currentUser) {
				error.value = 'Unable to load account data. Please try again.';
				return;
			}

			error.value = '';

			emit('loginSuccess');

			await Toast.show({
				text: `Login Successful! Welcome back, ${userOrEmail.value}!`,
				duration: 'short'
			});

			await refreshNuxtData();
			return;
		}

		if (result.success && !result.verified) {
			pendingLogin.value = {
				ticket: result.ticket,
				email: result.email,
				expiresAt: Date.now() + result.expiresIn * 1000,
				userOrEmail: userOrEmail.value,
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
	} finally {
		isSubmitting.value = false;
	}
}
</script>
