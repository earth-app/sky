<template>
	<div class="relative">
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
			:footer="`${footer} | ${prompt.responses_count ? withSuffix(prompt.responses_count) + ' Responses' : 'No Responses'}`"
			:secondary-footer="secondaryFooter"
			:report="
				canReport
					? { contentType: 'prompt', contentId: prompt.id, extraActions: reportExtraActions }
					: undefined
			"
			class="p-4"
		/>
	</div>
	<IonModal
		v-if="hasButtons"
		can-dismiss
		:is-open="editOpen"
		@did-dismiss="editOpen = false"
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
import { DateTime } from 'luxon';
import { type Prompt } from 'types/prompts';
import { withSuffix } from 'utils';

const props = defineProps<{
	prompt: Prompt;
	noLink?: boolean;
}>();

const router = useIonRouter();

const footer = ref<string | undefined>(undefined);
const secondaryFooter = ref<string | undefined>(undefined);

const promptText = ref(props.prompt.prompt);
const { user } = useAuth();
const { update, remove } = usePrompt(props.prompt.id);
const { handle: ownerHandle } = useDisplayName(() => props.prompt.owner);
const authorAvatarChipColor = ref<any | null>(null);

const avatarStore = useAvatarStore();
const shouldPreloadOwnerAvatar = computed(() => !isDataConstrained.value);
const ownerAvatarUrl = computed(() => {
	return (
		(props.prompt.owner?.account as any)?.avatar_url_offline ||
		props.prompt.owner?.account?.avatar_url
	);
});
const authorAvatar = computed(() => {
	const url = ownerAvatarUrl.value;
	// sky cards may receive inlined offline data: URIs from the R2 download cache
	if (url?.startsWith('data:')) return url;
	return avatarStore.safeUrl(url, 'avatar128');
});

watch(
	[ownerAvatarUrl, shouldPreloadOwnerAvatar],
	([url, shouldPreload]) => {
		if (shouldPreload && url && url.startsWith('http')) {
			avatarStore.preloadAvatar(url);
		}
	},
	{ immediate: true }
);

const i18n = useI18n();
const time = computed(() => {
	if (!props.prompt.created_at) return 'sometime';
	const created = DateTime.fromISO(props.prompt.created_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATETIME_SHORT);
});

const hasButtons = computed(() => {
	if (isOffline.value) return false; // disable editing while offline

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

onMounted(() => {
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

const canReport = computed(() => Boolean(user.value) && !isOffline.value);

// owner Edit/Delete are merged into the overflow sheet only on the detail view (noLink)
const reportExtraActions = computed(() => {
	if (!hasButtons.value || !props.noLink) return [];
	return [
		{ text: 'Edit', handler: () => (editOpen.value = true) },
		{
			text: 'Delete',
			role: 'destructive' as const,
			handler: () => deletePrompt()
		}
	];
});

async function savePrompt() {
	editLoading.value = true;
	const res = await update(promptText.value);

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
		const res = await remove();
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
