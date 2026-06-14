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
			:disabled="friendsLoading || atMaxCircle"
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

		<ReportMButton
			v-if="!isThisUser && currentUser"
			content-type="user"
			:content-id="user.id"
			fill="solid"
			icon="mdi:flag"
			color="warning"
			label="Report"
			full
		/>

		<IonButton
			v-if="canBlock"
			:color="blocking ? 'success' : 'medium'"
			fill="solid"
			size="small"
			:disabled="blockBusy"
			class="w-full"
			@click="toggleBlock"
		>
			<UIcon
				:name="blocking ? 'mdi:account-check' : 'mdi:account-cancel'"
				class="size-5 mr-2"
			/>
			{{ blocking ? 'Unblock' : 'Block' }}
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import type { User } from 'types/user';
import { makeClientAPIRequest } from 'utils';

const props = defineProps<{
	user: User;
}>();

// `user` in template refers to props.user (the profile being viewed); auth user is `currentUser`
const { user: currentUser } = useAuth();
const { addFriend, removeFriend, addToCircle, removeFromCircle } = useFriends();
const { notifyError } = useAppHaptics();
const authStore = useAuthStore();

const friendsLoading = ref(false);
const circleLoading = ref(false);
const blockBusy = ref(false);
const blocking = ref<boolean>(props.user.is_blocking);
const isThisUser = computed(() => {
	return currentUser.value?.id === props.user.id;
});
// block anyone but yourself or an admin
const canBlock = computed(() => !isThisUser.value && !props.user.is_admin);

async function toggleBlock() {
	if (blockBusy.value) return;
	const willBlock = !blocking.value;

	if (willBlock) {
		const { value } = await Dialog.confirm({
			title: 'Block User',
			message: `Block @${props.user.username}? They won't be able to see your profile or interact with your content.`,
			okButtonTitle: 'Block',
			cancelButtonTitle: 'Cancel'
		});
		if (!value) return;
	}

	blockBusy.value = true;
	const res = await makeClientAPIRequest(
		`/v2/users/current/blocked?user=${encodeURIComponent(props.user.id)}`,
		authStore.sessionToken,
		{ method: willBlock ? 'PUT' : 'DELETE' }
	);
	blockBusy.value = false;

	if (res.success) {
		blocking.value = willBlock;
		// blocking severs friendship/circle on the backend — mirror that here
		if (willBlock) {
			props.user.is_friend = false;
			props.user.is_my_friend = false;
			props.user.is_mutual = false;
			props.user.is_in_my_circle = false;
		}
		await Toast.show({
			text: willBlock
				? `You have blocked @${props.user.username}.`
				: `You have unblocked @${props.user.username}.`,
			duration: 'long'
		});
	} else {
		notifyError();
		await Toast.show({
			text: res.message || `Could not update block status for @${props.user.username}.`,
			duration: 'long'
		});
	}
}
const atMaxCircle = computed(() => {
	const count = currentUser.value?.circle_count || 0;
	const max = currentUser.value?.max_circle_count || 0;

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
	if (valid(res)) {
		props.user.is_friend = true;
		props.user.added_count = (props.user.added_count || 0) + 1;

		// increment mutual count  if applicable
		if (props.user.is_my_friend) props.user.mutual_count = (props.user.mutual_count || 0) + 1;
		await Toast.show({
			text: `You have added @${props.user.username} as a friend. Tell them to add you back!`,
			duration: 'long'
		});
	} else {
		notifyError();
		await Toast.show({
			text: res.message || `An error occurred while adding @${props.user.username} as a friend.`,
			duration: 'long'
		});
		console.error('Error adding friend:', res);
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
	if (valid(res)) {
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
	} else {
		notifyError();
		await Toast.show({
			text:
				res.message ||
				`An error occurred while removing @${props.user.username} from your friends.`,
			duration: 'long'
		});
		console.error('Error removing friend:', res);
	}

	friendsLoading.value = false;
}

async function addCurrentToCircle() {
	if (isThisUser.value) return;

	if (atMaxCircle.value) {
		await Toast.show({
			text: `You have reached the maximum circle size of ${currentUser.value?.max_circle_count}. Remove someone from your circle to add a new friend.`,
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
	if (valid(res)) {
		props.user.is_in_my_circle = true;
		props.user.circle_count = (props.user.circle_count || 0) + 1;

		await Toast.show({
			text: `You have added ${props.user.username} to your private circle.`,
			duration: 'long'
		});
	} else {
		notifyError();
		await Toast.show({
			text: res.message || `An error occurred while adding @${props.user.username} to your circle.`,
			duration: 'long'
		});
		console.error('Error adding to circle:', res);
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
	if (valid(res)) {
		props.user.is_in_my_circle = false;
		props.user.circle_count = Math.max((props.user.circle_count || 1) - 1, 0);

		await Toast.show({
			text: `You have removed ${props.user.username} from your private circle. You need to remove them as a friend to fully disconnect.`,
			duration: 'long'
		});
	} else {
		notifyError();
		await Toast.show({
			text:
				res.message || `An error occurred while removing @${props.user.username} from your circle.`,
			duration: 'long'
		});
		console.error('Error removing from circle:', res);
	}

	circleLoading.value = false;
}
</script>
