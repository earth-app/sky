<template>
	<IonButton
		:fill="fill"
		:size="size"
		:color="color"
		@click.stop.prevent="openMenu"
	>
		<UIcon
			name="mdi:menu"
			class="size-5"
		/>
	</IonButton>

	<MReportModal
		:content-type="contentType"
		:content-id="contentId"
		:parent-id="parentId"
		:is-open="modalOpen"
		@update:is-open="modalOpen = $event"
	/>
</template>

<script setup lang="ts">
import { actionSheetController } from '@ionic/vue';
import type { ContentType } from 'types/report';
import MReportModal from '~/components/report/MModal.vue';

interface ExtraAction {
	text: string;
	role?: 'destructive' | 'cancel';
	handler: Function;
}

const props = withDefaults(
	defineProps<{
		contentType: ContentType;
		contentId: string;
		parentId?: string;
		// owner actions (Edit/Delete) merged into the action sheet above Report
		extraActions?: ExtraAction[];
		fill?: 'clear' | 'outline' | 'solid' | 'default';
		size?: 'small' | 'default' | 'large';
		color?: string;
	}>(),
	{ fill: 'outline', size: 'small', color: 'medium', extraActions: () => [] }
);

const modalOpen = ref(false);

async function openMenu() {
	const sheet = await actionSheetController.create({
		buttons: [
			...props.extraActions.map((action) => ({
				text: action.text,
				role: action.role,
				handler: () => {
					void action.handler();
				}
			})),
			{
				text: 'Report',
				role: 'destructive' as const,
				handler: () => {
					modalOpen.value = true;
				}
			},
			{ text: 'Cancel', role: 'cancel' as const }
		]
	});

	await sheet.present();
}
</script>
