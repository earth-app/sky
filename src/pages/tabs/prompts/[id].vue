<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonButtons
					slot="end"
					class="gap-2 mx-2"
				>
					<Share
						v-if="currentPrompt"
						:payload="{
							dialogTitle: 'Share Prompt',
							title: currentPrompt.prompt,
							text: `Check out this prompt by @${currentPrompt.owner.username} on Earth App!`,
							url: `https://app.earth-app.com/prompts/${currentPrompt.id}`
						}"
					/>

					<div class="relative size-8 flex items-center justify-center">
						<Transition
							name="download-icon-fade"
							mode="out-in"
						>
							<UIcon
								v-if="isDownloading"
								key="downloading"
								name="line-md:downloading-loop"
								class="text-primary size-8"
							/>
							<UIcon
								v-else-if="isDownloaded"
								key="delete"
								name="material-symbols:delete-outline"
								:class="
									canDeleteDownload
										? 'text-error size-8 cursor-pointer'
										: 'text-gray-400 size-8 opacity-60 cursor-not-allowed'
								"
								@click.stop="deleteDownload"
							/>
							<UIcon
								v-else
								key="download"
								name="material-symbols:download-for-offline-outline"
								class="text-primary size-8 cursor-pointer"
								@click.stop="startDownload"
							/>
						</Transition>
					</div>

					<Transition name="download-icon-pop">
						<UIcon
							v-if="isDownloaded"
							name="mdi:check-circle"
							class="text-success size-6"
						/>
					</Transition>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent
			v-if="currentPrompt"
			:scroll-y="true"
		>
			<ContentTTLNotice
				v-if="promptExpiresAt"
				kind="prompt"
				variant="countdown"
				:expires-at="promptExpiresAt"
				class="w-full max-w-2xl mx-auto px-4 mt-2 min-h-24"
			/>
			<PromptMPage
				:prompt="currentPrompt"
				:offline-mode="loadedFromOffline"
			/>
			<!-- prompts are already reflective; MicroReflection mirrors that tone -->
			<div class="w-full max-w-2xl mx-auto px-4 my-3">
				<LazyMWidgetSlot
					kind="MicroReflection"
					:topic="`prompt-${currentPrompt.id}`"
					hydrate-on-visible
				/>
			</div>
		</IonContent>
		<div
			v-else-if="unavailableOffline"
			class="h-screen flex flex-col"
		>
			<div class="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-2">
				<h2 class="text-xl font-semibold">Prompt unavailable offline</h2>
				<p class="text-gray-500 text-sm">
					Connect once and download this prompt to open it without internet.
				</p>
			</div>
		</div>
		<div
			v-else
			class="h-screen"
		>
			<div class="flex items-center justify-center h-full pb-8">
				<IonSpinner name="crescent" />
			</div>
		</div>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const route = useRoute();
const { user } = useAuth();
const { prompt, fetch } = usePrompt(route.params.id as string);
const currentPrompt = ref<Prompt | null>(null);
const loadedFromOffline = ref(false);
const unavailableOffline = ref(false);

const promptExpiresAt = computed(() => {
	const p = currentPrompt.value;
	if (!p?.created_at) return null;
	return computeContentExpiry('prompt', Math.floor(Date.parse(p.created_at) / 1000));
});

const downloads = useDownloads();
const routeId = computed(() => route.params.id as string);
const downloadItem = computed(() => {
	const id = routeId.value;
	if (!id || !currentPrompt.value) return null;

	return {
		id,
		type: 'prompt' as const,
		payload: currentPrompt.value
	};
});
const timerMetadata = computed(() => ({
	prompt: currentPrompt.value ?? prompt.value ?? undefined,
	user: user.value ?? undefined
}));
useTimeOnPageM('prompts_read_time', timerMetadata);
const {
	isDownloaded,
	isDownloading,
	startDownload: startPromptDownload,
	deleteDownload: deletePromptDownload
} = useDownloadState(() => downloadItem.value);
const canDeleteDownload = computed(() => false);

async function startDownload() {
	if (isDownloading.value || isDownloaded.value) return;

	try {
		const started = await startPromptDownload();
		if (!started) return;

		await Toast.show({
			text: 'Prompt downloaded for offline use',
			duration: 'short'
		});
	} catch (error: any) {
		await Toast.show({
			text: extractServerMessage(error, 'Failed to download prompt'),
			duration: 'short'
		});
	}
}

async function deleteDownload() {
	if (!canDeleteDownload.value) return;

	const removed = await deletePromptDownload();
	if (!removed) return;
	await Toast.show({ text: 'Removed download', duration: 'short' });
}

async function loadPromptForView() {
	const id = routeId.value;
	if (!id) return;

	unavailableOffline.value = false;

	if (isOffline.value) {
		const offlinePrompt = await downloads.get('prompt', id);
		if (offlinePrompt) {
			loadedFromOffline.value = true;
			currentPrompt.value = offlinePrompt as Prompt;
			return;
		}

		currentPrompt.value = null;
		loadedFromOffline.value = false;
		unavailableOffline.value = true;
		return;
	}

	loadedFromOffline.value = false;
	await fetch();
	currentPrompt.value = prompt.value || null;
}

watch(
	[routeId, isOffline],
	() => {
		void loadPromptForView();
	},
	{ immediate: true }
);

watch(prompt, (newPrompt) => {
	if (!loadedFromOffline.value && newPrompt) {
		currentPrompt.value = newPrompt;
	}
});
</script>

<style scoped>
.download-icon-fade-enter-active,
.download-icon-fade-leave-active {
	transition:
		opacity 180ms ease,
		transform 180ms ease;
}

.download-icon-fade-enter-from,
.download-icon-fade-leave-to {
	opacity: 0;
	transform: scale(0.92);
}

.download-icon-pop-enter-active,
.download-icon-pop-leave-active {
	transition:
		opacity 160ms ease,
		transform 160ms ease;
}

.download-icon-pop-enter-from,
.download-icon-pop-leave-to {
	opacity: 0;
	transform: scale(0.88);
}
</style>
