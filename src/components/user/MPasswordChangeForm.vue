<template>
	<IonCard
		class="w-full max-w-md p-4"
		color="dark"
	>
		<div class="flex flex-col gap-3">
			<IonItem class="rounded-lg">
				<IonInput
					v-model="oldPassword"
					type="password"
					label="Current Password"
					label-placement="stacked"
					placeholder="Current Password"
					autocomplete="current-password"
					:disabled="loading"
				>
					<IonInputPasswordToggle slot="end" />
				</IonInput>
			</IonItem>

			<IonItem class="rounded-lg">
				<IonInput
					v-model="newPassword"
					type="password"
					label="New Password"
					label-placement="stacked"
					placeholder="New Password"
					autocomplete="new-password"
					:disabled="loading"
				>
					<IonInputPasswordToggle slot="end" />
				</IonInput>
			</IonItem>

			<IonItem class="rounded-lg">
				<IonInput
					v-model="confirmPassword"
					type="password"
					label="Confirm New Password"
					label-placement="stacked"
					placeholder="Confirm New Password"
					autocomplete="new-password"
					:disabled="loading"
				>
					<IonInputPasswordToggle slot="end" />
				</IonInput>
			</IonItem>

			<div class="flex gap-2">
				<IonButton
					color="warning"
					:disabled="loading"
					@click="handlePasswordChange"
				>
					<UIcon
						name="mdi:shield-lock"
						class="mr-2"
					/>
					Change Password
				</IonButton>
				<IonButton
					fill="outline"
					color="medium"
					:disabled="loading"
					@click="clearForm"
				>
					Clear
				</IonButton>
			</div>

			<IonText
				v-if="error"
				color="danger"
			>
				<p class="text-sm">{{ error }}</p>
			</IonText>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { passwordSchema } from 'schemas';

const { changePassword } = useAuth();
const { impactLight, notifySuccess, notifyWarning, notifyError } = useAppHaptics();

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');

const emit = defineEmits<{
	changed: [];
}>();

function clearForm() {
	oldPassword.value = '';
	newPassword.value = '';
	confirmPassword.value = '';
	error.value = '';
	void impactLight();
}

async function handlePasswordChange() {
	if (loading.value) return;

	error.value = '';

	if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
		error.value = 'Please fill out all password fields.';
		void notifyWarning();
		return;
	}

	if (newPassword.value !== confirmPassword.value) {
		error.value = 'New password and confirmation do not match.';
		void notifyWarning();
		return;
	}

	if (newPassword.value === oldPassword.value) {
		error.value = 'New password must be different from your current password.';
		void notifyWarning();
		return;
	}

	if (!passwordSchema.safeParse(newPassword.value).success) {
		error.value = 'Please enter a stronger password.';
		void notifyWarning();
		return;
	}

	loading.value = true;

	try {
		const res = await changePassword(oldPassword.value, newPassword.value);
		if (res.success) {
			clearForm();
			emit('changed');
			await notifySuccess();

			await Toast.show({
				text: res.data?.message || 'Password changed successfully.',
				duration: 'short'
			});
		} else {
			error.value = res.message || 'Failed to change password.';
			await notifyError();
			await Toast.show({
				text: error.value,
				duration: 'long'
			});
		}
	} catch (changeError: any) {
		error.value = changeError?.message || 'Failed to change password.';
		await notifyError();
		await Toast.show({
			text: error.value,
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
}
</script>
