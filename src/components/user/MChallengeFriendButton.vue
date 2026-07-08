<template>
	<IonButton
		:size="size"
		:fill="fill"
		:expand="expand"
		color="warning"
		:disabled="sending"
		@click="onChallenge"
	>
		<UIcon
			name="mdi:sword-cross"
			class="size-5 mr-1"
		/>
		{{ label }}
	</IonButton>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { IonButton } from '@ionic/vue';

const props = withDefaults(
	defineProps<{
		friendId: string;
		friendName: string;
		size?: 'small' | 'default' | 'large';
		fill?: 'clear' | 'outline' | 'solid' | 'default';
		expand?: 'block' | 'full';
		label?: string;
	}>(),
	{ size: 'small', fill: 'outline', label: 'Challenge' }
);

const { notifySuccess, notifyError } = useAppHaptics();
const { pickableQuests, challenge } = useChallengeFriend();

const sending = ref(false);

async function onChallenge() {
	if (pickableQuests.value.length === 0) {
		void notifyError();
		await Toast.show({
			text: 'Start a quest first, then challenge a friend to it.',
			duration: 'short'
		});
		return;
	}

	sending.value = true;
	try {
		const outcome = await challenge(props.friendId, props.friendName);
		if (outcome.status === 'sent') {
			void notifySuccess();
			await Toast.show({
				text: `${props.friendName} has been challenged. Game on.`,
				duration: 'short'
			});
		} else if (outcome.status === 'error') {
			void notifyError();
			await Toast.show({
				text: outcome.message || 'Could not send the challenge. Please try again.',
				duration: 'short'
			});
		}
		// cancelled / no-quests -> no toast (no-quests handled by the guard above)
	} finally {
		sending.value = false;
	}
}
</script>
