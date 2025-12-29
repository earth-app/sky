<template>
	<div
		id="friends-buttons"
		class="flex flex-col items-center p-4 min-w-full space-y-2"
	>
		<IonButton
			v-if="!user.is_friend && !isThisUser"
			color="success"
			fill="solid"
			size="small"
			:disabled="circleLoading"
			class="w-full"
			@click="addCurrentFriend"
		>
			<UIcon
				name="mdi:plus"
				class="size-5 mr-2"
			/>
			Add Friend
		</IonButton>
		<IonButton
			v-if="user.is_friend && !user.is_in_my_circle && !isThisUser"
			color="primary"
			fill="solid"
			size="small"
			:disabled="friendsLoading"
			class="w-full"
			@click="addCurrentToCircle"
		>
			<UIcon
				name="mdi:account-plus"
				class="size-5 mr-2"
			/>
			Add to Circle
		</IonButton>

		<IonButton
			v-if="user.is_in_my_circle && !isThisUser"
			color="warning"
			fill="solid"
			size="small"
			:disabled="friendsLoading"
			class="w-full"
			@click="removeCurrentFromCircle"
		>
			<UIcon
				name="mdi:account-remove"
				class="size-5 mr-2"
			/>
			Remove from Circle
		</IonButton>
		<IonButton
			v-if="user.is_friend && !isThisUser"
			color="danger"
			fill="solid"
			size="small"
			:disabled="circleLoading"
			class="w-full"
			@click="removeCurrentFriend"
		>
			<UIcon
				name="mdi:minus"
				class="size-5 mr-2"
			/>
			Remove Friend
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import type { User } from '@earth-app/crust/src/shared/types/user';

const props = defineProps<{
	user: User;
}>();

const { user } = useAuth();
const { addFriend, removeFriend, addToCircle, removeFromCircle } = useFriends();

const friendsLoading = ref(false);
const circleLoading = ref(false);
const isThisUser = computed(() => {
	return user.value?.id === props.user.id;
});
const atMaxCircle = computed(() => {
	const count = user.value?.circle_count || 0;
	const max = user.value?.max_circle_count || 0;

	return count >= max;
});

async function addCurrentFriend() {
	if (isThisUser.value) return;

	if (props.user.is_friend) {
		await Toast.show({
			text: `You are already friends with ${props.user.username}.`,
			duration: 'long'
		});
		return;
	}

	friendsLoading.value = true;
	const res = await addFriend(props.user.id);
	if (res.success && res.data) {
		if ('message' in res.data) {
			await Toast.show({
				text: res.data.message || 'An error occurred while adding friend.',
				duration: 'long'
			});

			friendsLoading.value = false;
			return;
		}

		props.user.is_friend = true;
		props.user.added_count = (props.user.added_count || 0) + 1;

		// increment mutual count  if applicable
		if (props.user.is_my_friend) props.user.mutual_count = (props.user.mutual_count || 0) + 1;
		await Toast.show({
			text: `You have added @${props.user.username} as a friend. Tell them to add you back!`,
			duration: 'long'
		});
	}

	friendsLoading.value = false;
}

async function removeCurrentFriend() {
	if (isThisUser.value) return;

	if (!props.user.is_friend) {
		await Toast.show({
			text: `You are not friends with @${props.user.username}.`,
			duration: 'long'
		});
		return;
	}

	friendsLoading.value = true;
	const res = await removeFriend(props.user.id);
	if (res.success && res.data) {
		if ('message' in res.data) {
			await Toast.show({
				text: res.data.message || 'An error occurred while removing friend.',
				duration: 'long'
			});

			friendsLoading.value = false;
			return;
		}

		props.user.is_friend = false;
		props.user.added_count = Math.max((props.user.added_count || 1) - 1, 0);

		// remove from circle if present
		if (props.user.is_in_my_circle) {
			props.user.is_in_my_circle = false;
			props.user.circle_count = Math.max((props.user.circle_count || 1) - 1, 0);
		}

		// decrement mutual count if applicable
		if (props.user.is_my_friend)
			props.user.mutual_count = Math.max((props.user.mutual_count || 1) - 1, 0);

		await Toast.show({
			text: `You have removed @${props.user.username} from your friends.`,
			duration: 'long'
		});
	}

	friendsLoading.value = false;
}

async function addCurrentToCircle() {
	if (isThisUser.value) return;

	if (atMaxCircle) {
		await Toast.show({
			text: `You have reached the maximum circle size of ${user.value?.max_circle_count}. Remove someone from your circle to add a new friend.`,
			duration: 'long'
		});
		return;
	}

	if (!props.user.is_friend) {
		await Toast.show({
			text: `You must be add @${props.user.username} as a friend to add them to your circle.`,
			duration: 'long'
		});
		return;
	}

	if (props.user.is_in_my_circle) {
		await Toast.show({
			text: `@${props.user.username} is already in your circle.`,
			duration: 'long'
		});
		return;
	}

	circleLoading.value = true;
	const res = await addToCircle(props.user.id);
	if (res.success && res.data) {
		if ('message' in res.data) {
			await Toast.show({
				text: res.data.message || 'An error occurred while adding friend.',
				duration: 'long'
			});
			circleLoading.value = false;
			return;
		}

		props.user.is_in_my_circle = true;
		props.user.circle_count = (props.user.circle_count || 0) + 1;

		await Toast.show({
			text: `You have added ${props.user.username} to your private circle.`,
			duration: 'long'
		});
	}

	circleLoading.value = false;
}

async function removeCurrentFromCircle() {
	if (isThisUser.value) return;

	if (!props.user.is_in_my_circle) {
		await Toast.show({
			text: `${props.user.username} is not in your circle.`,
			duration: 'long'
		});
		return;
	}

	circleLoading.value = true;
	const res = await removeFromCircle(props.user.id);
	if (res.success && res.data) {
		if ('message' in res.data) {
			await Toast.show({
				text: res.data.message || 'An error occurred while removing friend.',
				duration: 'long'
			});

			circleLoading.value = false;
			return;
		}

		props.user.is_in_my_circle = false;
		props.user.circle_count = Math.max((props.user.circle_count || 1) - 1, 0);

		await Toast.show({
			text: `You have removed ${props.user.username} from your private circle. You need to remove them as a friend to fully disconnect.`,
			duration: 'long'
		});
	}

	circleLoading.value = false;
}
</script>
