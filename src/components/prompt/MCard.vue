<template>
	<MInfoCard
		:subtitle="promptText"
		:content="`By ${ownerHandle}`"
		:avatar="{
			src: authorAvatar,
			size: 'xl',
			chip: authorAvatarChipColor
				? {
						color: authorAvatarChipColor,
						size: 'xl'
					}
				: undefined
		}"
		:link="noLink ? undefined : `/tabs/prompts/${prompt.id}`"
		:footer="`${footer} • ${prompt.responses_count ? withSuffix(prompt.responses_count) + ' Responses' : 'No Responses'}`"
		:secondary-footer="secondaryFooter"
		:buttons="
			hasButtons && noLink
				? [
						{
							text: 'Edit',
							color: 'secondary',
							size: 'small',
							onClick: () => {
								editOpen = true;
							}
						},
						{
							text: 'Delete',
							color: 'danger',
							size: 'small',
							onClick: () => {
								deletePrompt();
							}
						}
					]
				: undefined
		"
		class="p-4"
	/>
	<IonModal
		v-if="hasButtons"
		can-dismiss
		:is-open="editOpen"
	>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Edit Prompt</IonTitle>
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
					:value="promptText"
					label="Prompt Question"
					label-placement="stacked"
					:minlength="10"
					:maxlength="100"
					counter
					class="p-2"
					@ion-input="
						(event) => {
							promptText = event.target.value || '';
						}
					"
				/>
				<IonButton
					@click="savePrompt"
					:loading="editLoading"
					:disabled="editLoading || promptText.trim().length === 0"
					>Save</IonButton
				>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import { type Prompt } from '@earth-app/crust/src/shared/types/prompts';
import { withSuffix } from '@earth-app/crust/src/shared/util';
import { DateTime } from 'luxon';

const props = defineProps<{
	prompt: Prompt;
	noLink?: boolean;
}>();

const router = useIonRouter();

const footer = ref<string | undefined>(undefined);
const secondaryFooter = ref<string | undefined>(undefined);

const promptText = ref(props.prompt.prompt);
const { user } = useAuth();
const { handle: ownerHandle } = useDisplayName(() => props.prompt.owner);
const { avatar128: authorAvatar } = useUser(props.prompt.owner_id);
const authorAvatarChipColor = ref<any | null>(null);

const i18n = useI18n();
const time = computed(() => {
	if (!props.prompt.created_at) return 'sometime';
	const created = DateTime.fromISO(props.prompt.created_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATETIME_SHORT);
});

const hasButtons = computed(() => {
	return (
		user.value &&
		(user.value.id === props.prompt.owner_id || user.value.account.account_type === 'ADMINISTRATOR')
	);
});

const updatedTime = computed(() => {
	if (!props.prompt.updated_at) return 'sometime';
	const updated = DateTime.fromISO(props.prompt.updated_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return updated.toRelative({ locale: i18n.locale.value }) || 'sometime';
});

onMounted(async () => {
	if (props.prompt.created_at !== props.prompt.updated_at) {
		secondaryFooter.value = `Updated ${updatedTime.value}`;
	}

	const author = props.prompt.owner;
	switch (author.account.account_type) {
		case 'ORGANIZER':
			authorAvatarChipColor.value = 'warning';
			break;
		case 'ADMINISTRATOR':
			authorAvatarChipColor.value = 'error';
			break;
	}
	footer.value = `@${author.username} - ${time.value}`;
});

const editOpen = ref(false);
const editLoading = ref(false);

async function savePrompt() {
	editLoading.value = true;
	const res = await updatePrompt(props.prompt.id, promptText.value);

	if (res.success) {
		editOpen.value = false;

		await Toast.show({
			text: 'Your prompt has been successfully updated.',
			duration: 'short'
		});
	} else {
		await Toast.show({
			text: res.message || 'An unknown error occurred while updating your prompt.',
			duration: 'long'
		});
	}

	editLoading.value = false;
}

async function deletePrompt() {
	const yes = await Dialog.confirm({
		message: 'Are you sure you want to delete this prompt? This action cannot be undone.'
	});

	if (yes.value) {
		const res = await removePrompt(props.prompt.id);
		if (res.success) {
			await Toast.show({
				text: 'Your prompt has been successfully deleted.',
				duration: 'short'
			});

			refreshNuxtData(`prompt-${props.prompt.id}`);
			router.push('/prompts');
		} else {
			await Toast.show({
				text: res.message || 'An unknown error occurred while deleting your prompt.',
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
