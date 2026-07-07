<template>
	<ClientOnly>
		<div class="w-full flex items-center justify-center my-8">
			<div class="relative w-full">
				<MInfoCard
					:title="identifier"
					:content="responseText"
					:footer="time"
					:avatar="{
						src: authorAvatar,
						size: 'md',
						chip: response?.owner.account.account_type
							? {
									color:
										response?.owner.account.account_type === 'ORGANIZER'
											? 'warning'
											: response?.owner.account.account_type === 'ADMINISTRATOR'
												? 'error'
												: undefined
								}
							: undefined,
						link: `/tabs/profile/@${response?.owner.username}`
					}"
					class="w-full p-4 border-2 border-gray-800 light:border-gray-500"
					:report="
						canReport
							? {
									contentType: 'prompt_response',
									contentId: response.id,
									parentId: response.prompt_id,
									extraActions: reportExtraActions
								}
							: undefined
					"
				/>
			</div>
		</div>
		<IonModal
			v-if="hasButtons"
			:is-open="editOpen"
			@did-dismiss="editOpen = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Edit Response</IonTitle>
					<IonButtons slot="end">
						<IonButton
							fill="clear"
							strong
							@click="editOpen = false"
							>Close</IonButton
						>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				<div class="flex flex-col space-y-4 p-4">
					<IonTextarea
						:value="responseText"
						label="Response"
						label-placement="stacked"
						:minlength="1"
						:maxlength="700"
						counter
						@ion-input="
							(event) => {
								responseText = event.target.value || '';
							}
						"
					/>
					<IonButton
						@click="saveResponse"
						:disabled="editLoading || responseText.trim().length === 0"
						>Save</IonButton
					>
				</div>
			</IonContent>
		</IonModal>
	</ClientOnly>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import { DateTime } from 'luxon';
import { type PromptResponse } from 'types/prompts';

const props = defineProps<{
	response: PromptResponse;
}>();

const emit = defineEmits<{
	(event: 'deleted'): void;
}>();

const i18n = useI18n();
const { user } = useAuth();
const { handle: identifier } = useDisplayName(props.response.owner);
const { updateResponse, removeResponse } = usePromptResponses(props.response.prompt_id);

const avatarStore = useAvatarStore();
const ownerAvatarUrl = computed(() => props.response.owner.account?.avatar_url);
const authorAvatar = computed(() => avatarStore.safeUrl(ownerAvatarUrl.value, 'avatar128'));

if (import.meta.client) {
	watch(ownerAvatarUrl, (url) => avatarStore.preloadAvatar(url), { immediate: true });
}

const time = computed(() => {
	const created = DateTime.fromISO(props.response.created_at, {
		zone: 'utc'
	});

	let str = created.toRelative({
		locale: i18n.locale.value,
		round: true
	});
	if (props.response.updated_at && props.response.created_at !== props.response.updated_at) {
		const updated = DateTime.fromISO(props.response.updated_at, {
			zone: 'utc'
		});
		str += ` (edited ${updated.toRelative({ locale: i18n.locale.value, round: true }) || 'at some point'})`;
	}

	return str || 'Whenever';
});

const hasButtons = computed(() => {
	return (
		user.value &&
		(user.value.id === props.response.owner.id ||
			user.value.account.account_type === 'ADMINISTRATOR')
	);
});

const responseText = ref(props.response.response);
watch(
	() => props.response,
	(newResponse) => {
		responseText.value = newResponse.response;
	}
);

const editOpen = ref(false);
const editLoading = ref(false);

const canReport = computed(() => Boolean(user.value) && !isOffline.value);

const reportExtraActions = computed(() => {
	if (!hasButtons.value) return [];
	return [
		{ text: 'Edit', handler: () => (editOpen.value = true) },
		{
			text: 'Delete',
			role: 'destructive' as const,
			handler: () => deleteResponse()
		}
	];
});

async function saveResponse() {
	editLoading.value = true;
	const res = await updateResponse(props.response.id, responseText.value);

	if (res.success) {
		editOpen.value = false;

		await Toast.show({
			text: 'Your prompt response has been successfully updated.',
			duration: 'short'
		});
	} else {
		await Toast.show({
			text: res.message || 'An unknown error occurred while updating your prompt response.',
			duration: 'long'
		});
	}

	editLoading.value = false;
}

async function deleteResponse() {
	const yes = await Dialog.confirm({
		message: 'Are you sure you want to delete this response? This action cannot be undone.'
	});

	if (yes.value) {
		const res = await removeResponse(props.response.id);
		if (res.success) {
			await Toast.show({
				text: 'Your prompt response has been successfully deleted.',
				duration: 'short'
			});

			emit('deleted');
		} else {
			await Toast.show({
				text: res.message || 'An unknown error occurred while deleting your prompt response.',
				duration: 'long'
			});
		}
	} else {
		await Toast.show({
			text: 'Prompt deletion has been cancelled.',
			duration: 'short'
		});
	}
}
</script>
