<template>
	<IonCard
		class="min-w-120 p-4"
		color="dark"
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
					class="w-3/5 max-w-60 self-center"
				>
					<UIcon name="mdi:lock" />
					Login
				</IonButton>
			</div>
		</UForm>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { passwordSchema, usernameSchema } from '@earth-app/crust/src/shared/schemas';
import z from 'zod';

const username = ref('');
const password = ref('');

const login = useLogin();
const { fetchUser } = useAuth();

const emit = defineEmits<{
	loginSuccess: [];
}>();

async function handleLogin() {
	const result = await login(username.value, password.value);

	if (result.success) {
		// Fetch user data to update the auth state
		fetchUser(true).then(() => {
			emit('loginSuccess');
		});

		Toast.show({
			text: `Login Successful! Welcome back, ${username.value}!`,
			duration: 'short'
		});

		refreshNuxtData(); // Refresh user data
	} else {
		Toast.show({
			text: `Login Failed: ${result.message || 'An unknown error occurred during login.'}`,
			duration: 'long'
		});
	}
}
</script>
