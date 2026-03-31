<template>
	<IonButton
		color="secondary"
		:class="text ? 'my-4' : ''"
		:fill="text ? 'solid' : 'clear'"
		@click="share"
	>
		<UIcon
			name="mdi:share-variant"
			:class="text ? 'mr-2 size-5' : 'size-8'"
		/>
		<span v-if="text">Back</span>
	</IonButton>
</template>

<script setup lang="ts">
import { Share, type ShareOptions } from '@capacitor/share';
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	text?: boolean;
	payload: ShareOptions;
}>();

async function share() {
	if (!(await Share.canShare())) {
		await Toast.show({
			text: 'Sharing is not supported on this device.',
			duration: 'short'
		});

		return;
	}

	try {
		await Share.share({ ...props.payload });
	} catch (error) {
		await Toast.show({
			text: `${error instanceof Error ? error.message : String(error)}`,
			duration: 'short'
		});
	}
}
</script>
