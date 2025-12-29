<template>
	<div class="flex flex-col justify-center">
		<IonButton
			class="font-semibold text-center"
			@click="regenerateProfilePhoto"
		>
			<UIcon
				name="mdi:refresh"
				class="size-5 mr-2"
				:class="{ 'animate-spin': avatarLoading }"
			/>
			Regenerate Avatar
		</IonButton>
		<IonButton
			class="font-semibold text-center mt-2"
			color="medium"
			href="/profile/editor"
		>
			<UIcon
				name="mdi:menu"
				class="size-5 mr-2"
			/>
			Edit Profile
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import type { User } from '@earth-app/crust/src/shared/types/user';

const props = defineProps<{
	user: User;
}>();

const { user: currentUser } = useAuth();
const { avatar: oldAvatar, fetchUser } = useUser(props.user.id);

// Profile Photo

const avatarLoading = ref(false);
const avatarOverride = ref<string | null>(null);

const avatar = computed(() => avatarOverride.value || oldAvatar.value || undefined);

onBeforeUnmount(() => {
	if (avatarOverride.value && avatarOverride.value.startsWith('blob:')) {
		URL.revokeObjectURL(avatarOverride.value);
	}
});

async function regenerateProfilePhoto() {
	if (!(await Dialog.confirm({ message: 'Are you sure? You cannot revert this action.' }))) return;

	avatarLoading.value = true;

	const res = await regenerateAvatar();
	if (res.success && res.data && res.data instanceof Blob) {
		if (avatarOverride.value && avatarOverride.value.startsWith('blob:')) {
			URL.revokeObjectURL(avatarOverride.value);
		}

		avatarOverride.value = URL.createObjectURL(res.data);
		fetchUser();

		avatarLoading.value = false;
		await Toast.show({
			text: 'Your profile photo has been successfully regenerated.',
			duration: 'long'
		});
	} else {
		avatarLoading.value = false;
		console.error(res.message || 'Failed to regenerate profile photo.');

		await Toast.show({
			text: res.message || 'Failed to regenerate profile photo.',
			duration: 'long'
		});
	}
}
</script>
