<template>
	<IonCard
		class="min-w-60 w-7/8 max-w-full p-4"
		:color="theme"
	>
		<UForm
			id="signup"
			:state="formState"
			:schema="signupSchema"
			@submit="handleSignup"
			@error="handleFormError"
			class="space-x-6 *:mb-4"
		>
			<UFormField
				label="Email (optional)"
				name="email"
			>
				<IonInput
					v-model="email"
					:disabled="loading"
					placeholder="me@example.com"
					type="email"
					class="min-w-60 w-2/5 max-w-120"
					autocapitalize="off"
					autocomplete="email"
					inputmode="email"
				/>
			</UFormField>

			<UFormField
				label="Name (optional)"
				name="fullName"
			>
				<IonInput
					v-model="fullName"
					:disabled="loading"
					placeholder="John Doe"
					class="min-w-60 w-2/5 max-w-120"
					autocapitalize="words"
					autocomplete="name"
				/>
			</UFormField>

			<UFormField
				label="Username"
				name="username"
				:required="true"
			>
				<IonInput
					v-model="username"
					:disabled="loading"
					placeholder="cooldude78"
					class="min-w-60 w-2/5 max-w-120"
					counter
					:maxlength="30"
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
					:disabled="loading"
					placeholder="SuperSecretPassword_"
					type="password"
					class="min-w-60 w-2/5 max-w-120"
					counter
					:maxlength="100"
					autocomplete="new-password"
				>
					<IonInputPasswordToggle slot="end" />
				</IonInput>
			</UFormField>

			<p class="text-xs opacity-80 text-center mb-3 px-4">
				By signing up, you agree to our
				<button
					type="button"
					class="text-primary! font-semibold! underline!"
					@click="openTos"
				>
					Terms of Service
				</button>
				and
				<button
					type="button"
					class="text-primary! font-semibold! underline!"
					@click="openPrivacy"
				>
					Privacy Policy</button
				>.
			</p>

			<div class="flex w-full justify-center">
				<IonButton
					type="submit"
					color="success"
					fill="solid"
					class="w-3/5 max-w-60 self-center"
					:disabled="loading || !canSubmit"
					:aria-busy="loading"
				>
					<template v-if="loading">
						<IonSpinner
							name="crescent"
							class="mr-2"
						/>
						Signing up...
					</template>
					<template v-else>
						<UIcon
							name="mdi:account-plus"
							class="mr-2"
						/>
						Sign Up
					</template>
				</IonButton>
			</div>

			<UAlert
				v-if="error"
				icon="mdi:alert-box-outline"
				:title="error"
				color="error"
				class="mt-6 w-full mx-2"
			/>
		</UForm>
	</IonCard>
</template>

<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { Toast } from '@capacitor/toast';
import { emailSchema, fullNameSchema, passwordSchema, usernameSchema } from 'schemas';
import type { User } from 'types/user';
import z from 'zod';
import { theme } from '~/composables/useSettings';

const fullName = ref('');
const email = ref('');
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

const signup = useSignup();
const { notifyError } = useAppHaptics();

// links must leave the app on native
async function openTos() {
	await Browser.open({ url: 'https://earth-app.com/tos' });
}
async function openPrivacy() {
	await Browser.open({ url: 'https://earth-app.com/privacy-policy' });
}

const emit = defineEmits<{
	signupSuccess: [user: User, hasEmail: boolean];
}>();

const signupSchema = z.object({
	email: z
		.string()
		.transform((v) => v.trim())
		.refine((v) => v.length === 0 || emailSchema.safeParse(v).success, {
			message: 'Please enter a valid email address.'
		})
		.optional(),
	fullName: z
		.string()
		.transform((v) => v.trim())
		.refine((v) => v.length === 0 || fullNameSchema.safeParse(v).success, {
			message: 'Please enter a valid full name.'
		})
		.optional(),
	username: usernameSchema,
	password: passwordSchema
});

const formState = computed(() => ({
	email: email.value,
	fullName: fullName.value,
	username: username.value,
	password: password.value
}));

const canSubmit = computed(() => username.value.trim().length > 0 && password.value.length > 0);

async function safeToast(text: string, duration: 'short' | 'long' = 'long') {
	// Capacitor's Toast.show can reject if the bridge isn't ready (e.g. during a
	// hot route transition). Never let toast failure freeze the submit flow.
	try {
		await Toast.show({ text, duration });
	} catch (err) {
		console.warn('[signup] toast failed:', err);
	}
}

async function handleFormError(event: any) {
	const firstMessage =
		event?.errors?.[0]?.message ??
		event?.children?.[0]?.message ??
		'Please fix the highlighted fields and try again.';
	error.value = firstMessage;
	notifyError();
	await safeToast(firstMessage, 'long');
}

async function handleSignup() {
	if (loading.value) return;

	useLogger().info('user.action', 'signup.submit');

	error.value = '';
	const normalizedEmail = email.value.trim();
	const normalizedName = fullName.value.trim();
	// mantle2 lowercases on save; mirror that here so the user sees the same
	// username everywhere (and we don't double-submit a uniqueness conflict
	// against a case-only collision).
	const normalizedUsername = username.value.trim().toLowerCase();

	if (normalizedEmail.length > 0 && !emailSchema.safeParse(normalizedEmail).success) {
		await reportValidationError('Please enter a valid email address.');
		return;
	}

	if (normalizedName.length > 0 && !fullNameSchema.safeParse(normalizedName).success) {
		await reportValidationError('Please enter a valid full name.');
		return;
	}

	if (!usernameSchema.safeParse(normalizedUsername).success) {
		await reportValidationError(
			'Username must be 3-30 characters and only contain letters, numbers, underscores, dashes, or periods.'
		);
		return;
	}

	if (!passwordSchema.safeParse(password.value).success) {
		await reportValidationError(
			'Password must be 8-100 characters and only contain letters, numbers, or common symbols.'
		);
		return;
	}

	// reflect the normalized username back into the input so the user sees what
	// will actually be created.
	if (username.value !== normalizedUsername) {
		username.value = normalizedUsername;
	}

	let firstName: string | undefined;
	let lastName: string | undefined;
	if (normalizedName.length > 0) {
		const nameParts = normalizedName.split(/\s+/).filter(Boolean);
		firstName = nameParts[0] || undefined;
		lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
	}

	loading.value = true;

	try {
		const result = await signup(
			normalizedUsername,
			password.value,
			normalizedEmail.length > 0 ? normalizedEmail : undefined,
			firstName,
			lastName
		);

		if (result.success && result.user) {
			error.value = '';
			await safeToast('Sign up successful. Welcome to The Earth App.', 'short');
			emit('signupSuccess', result.user, normalizedEmail.length > 0);
			return;
		}

		const statusMatch = result.message?.match(/^(\d{3})\s*[:\-]\s*/);
		const status = statusMatch ? Number(statusMatch[1]) : null;

		if (status === 409) {
			error.value = 'That username is already taken. Please choose another.';
		} else if (status === 400 || status === 422) {
			error.value = 'Some of the sign up details look invalid. Please review them and try again.';
		} else if (status === 429) {
			error.value = 'Too many sign up attempts. Please wait a moment and try again.';
		} else if (status && status >= 500) {
			error.value = 'The server is having trouble right now. Please try again shortly.';
		} else {
			error.value = formatApiError(result.message, 'Sign up failed. Please try again.');
		}

		await safeToast(error.value, 'long');
		notifyError();
	} catch (err) {
		// network blip / unexpected throw — never leak it as raw JS to the user.
		console.error('[signup] unexpected error:', err);
		error.value = formatApiError(err, 'Sign up failed. Please try again.');
		await safeToast(error.value, 'long');
		notifyError();
	} finally {
		loading.value = false;
	}
}

async function reportValidationError(message: string) {
	error.value = message;
	notifyError();
	await safeToast(message, 'long');
}
</script>
