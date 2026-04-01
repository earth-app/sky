<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Downloads</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="flex flex-col items-center px-4 pb-8">
				<div class="w-full max-w-3xl pt-4">
					<h2 class="text-sm! font-medium m-0!">
						{{ comma(allDownloads.length) }} Downloads | Used Space: {{ usedSpace }}
					</h2>

					<div
						v-if="loading"
						class="flex items-center justify-center w-full py-12"
					>
						<IonSpinner name="crescent" />
					</div>

					<div
						v-else-if="allDownloads.length === 0"
						class="w-full rounded-xl border border-black/20 light:border-gray-300 px-6 py-10 text-center"
					>
						<h2 class="text-lg! font-semibold m-0! mb-2!">No downloads yet</h2>
						<p class="text-sm opacity-80 m-0!">
							Download prompts, articles, or activities from their detail pages to access them
							offline.
						</p>
					</div>

					<TransitionGroup
						v-else
						name="downloads-list"
						tag="div"
						class="flex flex-col gap-2 w-full"
					>
						<div
							v-for="item in allDownloads"
							:key="itemKey(item)"
							class="download-row flex items-center gap-2 w-full"
						>
							<div class="flex-1 min-w-0">
								<ActivityMCard
									v-if="item.type === 'activity'"
									:activity="asActivity(item)"
								/>
								<PromptMCard
									v-else-if="item.type === 'prompt'"
									:prompt="asPrompt(item)"
								/>
								<ArticleMCard
									v-else
									:article="asArticle(item)"
								/>
							</div>

							<div class="shrink-0 pr-1">
								<IonButton
									fill="clear"
									color="danger"
									size="small"
									:disabled="!canDelete(item)"
									:class="animationsEnabled ? 'transition-all duration-200 active:scale-95' : ''"
									@click.stop="deleteDownload(item)"
								>
									<Transition
										name="download-delete-icon"
										mode="out-in"
									>
										<UIcon
											v-if="isDeleting(item)"
											key="deleting"
											name="line-md:loading-loop"
											class="size-5"
										/>
										<UIcon
											v-else
											key="delete"
											name="material-symbols:delete-outline"
											class="size-5"
										/>
									</Transition>
								</IonButton>
							</div>
						</div>
					</TransitionGroup>

					<p
						v-if="offlineEntryMode && allDownloads.length > 0"
						class="text-xs opacity-80 mt-3 px-2"
					>
						Deletion is disabled while offline.
					</p>
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';

const downloads = useDownloads();
const { settings: appSettings } = useAppSettings();

const allDownloads = ref<DownloadedItem[]>([]);
const usedSpace = ref('0B');
const loading = ref(true);
const deleting = reactive<Record<string, boolean>>({});

onMounted(async () => {
	usedSpace.value = await downloads.usedSpace();
});

const offlineEntryMode = computed(() => isOffline.value);
const animationsEnabled = computed(() => appSettings.value.animations);
const downloadSignature = computed(() =>
	Object.entries(downloads.downloaded.value)
		.filter(([, downloaded]) => downloaded)
		.map(([key]) => key)
		.sort()
		.join('|')
);

function itemKey(item: DownloadedItem) {
	return `${item.type}-${item.id}`;
}

function asActivity(item: DownloadedItem) {
	return item as DownloadedActivity;
}

function asPrompt(item: DownloadedItem) {
	return item as DownloadedPrompt;
}

function asArticle(item: DownloadedItem) {
	return item as DownloadedArticle;
}

function itemDate(item: DownloadedItem) {
	const maybeUpdated = 'updated_at' in item ? item.updated_at : undefined;
	const maybeCreated = 'created_at' in item ? item.created_at : undefined;
	const parsed = Date.parse(String(maybeUpdated || maybeCreated || ''));
	return Number.isFinite(parsed) ? parsed : 0;
}

function sortDownloads(items: DownloadedItem[]) {
	return [...items].sort((a, b) => itemDate(b) - itemDate(a));
}

async function refreshDownloads() {
	try {
		allDownloads.value = sortDownloads(await downloads.all());
	} catch (error: any) {
		await Toast.show({
			text: error?.message || 'Failed to load downloads',
			duration: 'short'
		});
	} finally {
		loading.value = false;
	}
}

function isDeleting(item: DownloadedItem) {
	return Boolean(deleting[itemKey(item)]);
}

function canDelete(item: DownloadedItem) {
	return !isOffline.value && !isDeleting(item);
}

async function deleteDownload(item: DownloadedItem) {
	if (!canDelete(item)) return;

	const confirm = await Dialog.confirm({
		title: 'Delete Download',
		message: 'Remove this item from your offline downloads?'
	});
	if (!confirm.value) return;

	const key = itemKey(item);
	deleting[key] = true;

	try {
		await downloads.remove(item.type, item.id);
		allDownloads.value = allDownloads.value.filter((candidate) => itemKey(candidate) !== key);

		await Toast.show({
			text: 'Removed download',
			duration: 'short'
		});
	} catch (error: any) {
		await Toast.show({
			text: error?.message || 'Failed to remove download',
			duration: 'short'
		});
	} finally {
		deleting[key] = false;
	}
}

watch(
	downloadSignature,
	() => {
		void refreshDownloads();
	},
	{ immediate: true }
);
</script>

<style scoped>
.downloads-list-enter-active,
.downloads-list-leave-active,
.downloads-list-move {
	transition:
		opacity 220ms ease,
		transform 220ms ease;
}

.downloads-list-enter-from,
.downloads-list-leave-to {
	opacity: 0;
	transform: translateY(8px) scale(0.98);
}

.download-delete-icon-enter-active,
.download-delete-icon-leave-active {
	transition:
		opacity 160ms ease,
		transform 160ms ease;
}

.download-delete-icon-enter-from,
.download-delete-icon-leave-to {
	opacity: 0;
	transform: scale(0.9);
}

:global(html.animations-disabled) .downloads-list-enter-active,
:global(html.animations-disabled) .downloads-list-leave-active,
:global(html.animations-disabled) .downloads-list-move,
:global(html.animations-disabled) .download-delete-icon-enter-active,
:global(html.animations-disabled) .download-delete-icon-leave-active {
	transition-duration: 0ms !important;
}
</style>
