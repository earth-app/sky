<template>
	<IonCard
		class="min-w-60 w-7/8 max-w-full p-4"
		color="dark"
	>
		<UForm
			id="signup"
			:state="{ fullName, email, username, password }"
			@submit="handleSignup"
			class="space-x-6 *:mb-4"
		>
			<UFormField
				label="Email (optional)"
				name="email"
			>
				<IonInput
					v-model="email"
					placeholder="me@example.com"
					type="email"
					class="min-w-60 w-2/5 max-w-120"
					autocapitalize="off"
					autocomplete="email"
				/>
			</UFormField>

			<UFormField
				label="Name (optional)"
				name="fullName"
			>
				<IonInput
					v-model="fullName"
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
					placeholder="cooldude78"
					class="min-w-60 w-2/5 max-w-120"
					counter
					:maxlength="20"
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

			<div class="flex w-full justify-center">
				<IonButton
					type="submit"
					form="signup"
					color="success"
					fill="solid"
					class="w-3/5 max-w-60 self-center"
					:disabled="loading"
				>
					<UIcon
						name="mdi:account-plus"
						class="mr-2"
					/>
					Sign Up
				</IonButton>
			</div>

			<IonText
				v-if="error"
				color="danger"
			>
				<p class="text-sm text-center mt-2">{{ error }}</p>
			</IonText>
		</UForm>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { emailSchema, fullNameSchema, passwordSchema, usernameSchema } from 'schemas';
import type { User } from 'types/user';

const fullName = ref('');
const email = ref('');
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

const signup = useSignup();
const { fetchUser } = useAuth();

const emit = defineEmits<{
	signupSuccess: [user: User, hasEmail: boolean];
}>();

async function handleSignup() {
	if (loading.value) return;

	error.value = '';
	const normalizedEmail = email.value.trim();
	const normalizedName = fullName.value.trim();
	const normalizedUsername = username.value.trim();

	if (normalizedEmail.length > 0 && !emailSchema.safeParse(normalizedEmail).success) {
		error.value = 'Please enter a valid email address.';
		return;
	}

	if (normalizedName.length > 0 && !fullNameSchema.safeParse(normalizedName).success) {
		error.value = 'Please enter a valid full name.';
		return;
	}

	if (!usernameSchema.safeParse(normalizedUsername).success) {
		error.value = 'Please enter a valid username.';
		return;
	}

	if (!passwordSchema.safeParse(password.value).success) {
		error.value = 'Please enter a valid password.';
		return;
	}

	let firstName: string | undefined;
	let lastName: string | undefined;
	if (normalizedName.length > 0) {
		const nameParts = normalizedName.split(/\s+/).filter(Boolean);
		firstName = nameParts[0] || undefined;
		lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
	}

	loading.value = true;

	const result = await signup(
		normalizedUsername,
		password.value,
		normalizedEmail.length > 0 ? normalizedEmail : undefined,
		firstName,
		lastName
	);

	if (result.success && result.user) {
		await fetchUser(true);

		await Toast.show({
			text: 'Sign up successful. Welcome to The Earth App.',
			duration: 'short'
		});

		loading.value = false;

		emit('signupSuccess', result.user, normalizedEmail.length > 0);
		return;
	}

	if (result.message.includes('409')) {
		error.value = 'Username already exists. Please choose another.';
	} else if (result.message.includes('400')) {
		error.value = 'Invalid sign up data. Please check your inputs.';
	} else if (result.message.includes('429')) {
		error.value = 'Too many sign up attempts. Please try again later.';
	} else if (result.message.includes('500')) {
		error.value = 'Server error. Please try again later.';
	} else {
		error.value = result.message || 'Sign up failed. Please try again.';
	}

	await Toast.show({
		text: error.value,
		duration: 'long'
	});

	loading.value = false;
}
</script>
