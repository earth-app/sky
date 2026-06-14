<template>
	<IonModal
		:is-open="isOpen"
		@did-dismiss="onDidDismiss"
	>
		<IonHeader>
			<IonToolbar>
				<IonTitle>{{ `Report ${typeLabel}` }}</IonTitle>
				<IonButtons slot="end">
					<IonButton
						fill="clear"
						strong
						@click="close"
						>Close</IonButton
					>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent>
			<div class="flex flex-col space-y-4 p-4!">
				<IonSelect
					v-model="reason"
					label="Reason"
					label-placement="stacked"
					placeholder="Select a reason"
					interface="action-sheet"
					:disabled="loading"
				>
					<IonSelectOption
						v-for="option in REPORT_REASONS"
						:key="option.value"
						:value="option.value"
					>
						{{ option.label }}
					</IonSelectOption>
				</IonSelect>

				<IonTextarea
					v-model="description"
					label="Additional details"
					label-placement="stacked"
					placeholder="Add any context that helps us review this report (optional)"
					:auto-grow="true"
					:maxlength="1024"
					counter
					:disabled="loading"
				/>

				<IonButton
					expand="block"
					:disabled="!reason || loading"
					@click="submit"
				>
					{{ loading ? 'Submitting…' : 'Submit Report' }}
				</IonButton>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import type { ContentType, ReportReason } from 'types/report';
import { REPORT_REASONS } from 'types/report';

const props = defineProps<{
	contentType: ContentType;
	contentId: string;
	parentId?: string;
	isOpen: boolean;
}>();

const emit = defineEmits<{
	(event: 'update:isOpen', value: boolean): void;
	(event: 'close'): void;
}>();

const { submitReport } = useReport();

const reason = ref<ReportReason | undefined>(undefined);
const description = ref('');
const loading = ref(false);

const TYPE_LABELS: Record<ContentType, string> = {
	prompt: 'Prompt',
	prompt_response: 'Response',
	article: 'Article',
	event: 'Event',
	event_image: 'Image',
	user: 'User'
};
const typeLabel = computed(() => TYPE_LABELS[props.contentType]);

function reset() {
	reason.value = undefined;
	description.value = '';
	loading.value = false;
}

function close() {
	emit('update:isOpen', false);
	emit('close');
}

function onDidDismiss() {
	// keep the bound ref in sync on swipe-down/backdrop dismiss
	reset();
	close();
}

async function submit() {
	if (!reason.value || loading.value) return;

	loading.value = true;
	const res = await submitReport(props.contentType, props.contentId, {
		parentId: props.parentId,
		reason: reason.value,
		description: description.value
	});
	loading.value = false;

	if (res.success) {
		reset();
		close();
	}
}
</script>
