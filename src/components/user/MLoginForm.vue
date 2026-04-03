<template>
	<IonCard
		class="min-w-60 w-7/8 max-w-full p-4"
		color="medium"
	>
		<UForm
			id="login"
			:state="{ username, password }"
			@submit="handleLogin"
			class="space-x-6 *:mb-4"
			:schema="z.object({ username: usernameSchema, password: passwordSchema })"
		>
			<UFormField
				label="Username"
				name="username"
				:required="true"
			>
				<IonInput
					v-model="username"
					:disabled="isSubmitting"
					placeholder="cooldude78"
					class="min-w-60 w-2/5 max-w-120"
					counter
					:maxlength="20"
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
					mode="md"
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
						<UIcon name="mdi:lock" />
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
import { passwordSchema, usernameSchema } from 'schemas';
import z from 'zod';

const username = ref('');
const password = ref('');
const isSubmitting = ref(false);
const canSubmit = computed(() => username.value.trim().length > 0 && password.value.length > 0);
const error = ref('');

const login = useLogin();
const { fetchUser } = useAuth();
const authStore = useAuthStore();

const emit = defineEmits<{
	loginSuccess: [];
}>();

function setLoginError(message?: string) {
	if (message?.includes('401')) {
		error.value = 'Invalid username/password.';
		return;
	}

	if (message?.includes('409')) {
		error.value = 'Rate limited, try again later.';
		return;
	}

	if (message?.includes('403')) {
		error.value = 'Account disabled.';
		return;
	}

	error.value = message || 'An error occurred during login. Please try again.';
}

async function handleLogin() {
	if (isSubmitting.value || !canSubmit.value) return;

	isSubmitting.value = true;
	error.value = '';

	try {
		const result = await login(username.value, password.value);

		if (result.success) {
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
				text: `Login Successful! Welcome back, ${username.value}!`,
				duration: 'short'
			});

			await refreshNuxtData();
			return;
		}

		setLoginError(result.message);
	} finally {
		isSubmitting.value = false;
	}
}
</script>
