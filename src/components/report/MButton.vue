<template>
	<IonButton
		v-bind="$attrs"
		:fill="fill"
		:size="size"
		:color="color"
		data-testid="report-button"
		@click.stop.prevent="openMenu"
		:class="full ? 'w-full' : ''"
	>
		<UIcon
			v-if="icon"
			:name="icon"
			class="size-5"
		/>
		<span
			v-if="label"
			class="ml-2"
			>{{ label }}</span
		>
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

// two root nodes (button + teleported modal) render a fragment; opt out of auto-inherit and
// forward $attrs (the parent's positioning class) onto the button so vue stops warning
defineOptions({ inheritAttrs: false });

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
		label?: string;
		icon?: string;
		fill?: 'clear' | 'outline' | 'solid' | 'default';
		size?: 'small' | 'default' | 'large';
		full?: boolean;
		color?: string;
	}>(),
	{ fill: 'outline', size: 'small', color: 'medium', icon: 'mdi:menu', extraActions: () => [] }
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
