<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<div class="flex items-center justify-between w-full">
					<Back />
					<div class="mr-4 flex items-center gap-2">
						<Share
							v-if="currentActivity"
							:payload="{
								dialogTitle: 'Share Activity',
								title: `Learn about ${currentActivity.name}`,
								text: currentActivity.description,
								url: `https://app.earth-app.com/activities/${currentActivity.id}`
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
									name="material-symbols:download-for-offline"
									class="text-success size-8"
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
								key="delete"
								name="material-symbols:delete-outline"
								:class="
									canDeleteDownload
										? 'text-error size-8 cursor-pointer'
										: 'text-gray-400 size-8 opacity-60 cursor-not-allowed'
								"
								@click.stop="deleteDownload"
							/>
						</Transition>
					</div>
				</div>
			</IonToolbar>
		</IonHeader>
		<IonContent
			v-if="currentActivity"
			:scroll-y="true"
		>
			<ActivityMProfile
				:activity="currentActivity"
				:offline-mode="loadedFromOffline"
				:offline-cards="offlineCards"
			/>
		</IonContent>
		<div
			v-else-if="unavailableOffline"
			class="h-screen flex flex-col"
		>
			<div class="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-2">
				<h2 class="text-xl font-semibold">Activity unavailable offline</h2>
				<p class="text-gray-500 text-sm">
					Connect once and download this activity to open it without internet.
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
import type { Activity } from 'types/activity';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const route = useRoute();
const { activity, fetch } = useActivity(route.params.id as string);
const currentActivity = ref<Activity | null>(null);
const loadedFromOffline = ref(false);
const unavailableOffline = ref(false);

const downloads = useDownloads();
const routeId = computed(() => route.params.id as string);
const downloadItem = computed(() => {
	const id = routeId.value;
	if (!id || !currentActivity.value) return null;

	return {
		id,
		type: 'activity' as const,
		payload: currentActivity.value
	};
});
const {
	isDownloaded,
	isDownloading,
	startDownload: startActivityDownload,
	deleteDownload: deleteActivityDownload
} = useDownloadState(() => downloadItem.value);
const canDeleteDownload = computed(() => false);
const offlineCards = computed(() => {
	return (((currentActivity.value as any)?.offline_cards || []) as any[]).slice(0, 10);
});

async function loadActivityForView() {
	const id = routeId.value;
	if (!id) return;

	unavailableOffline.value = false;

	if (isOffline.value) {
		const offlineActivity = await downloads.get('activity', id);
		if (offlineActivity) {
			loadedFromOffline.value = true;
			currentActivity.value = offlineActivity as Activity;
			return;
		}

		currentActivity.value = null;
		loadedFromOffline.value = false;
		unavailableOffline.value = true;
		return;
	}

	loadedFromOffline.value = false;
	await fetch();
	currentActivity.value = activity.value;
}

async function startDownload() {
	if (isDownloading.value || isDownloaded.value) return;

	try {
		const started = await startActivityDownload();
		if (!started) return;

		await Toast.show({
			text: 'Activity downloaded for offline use',
			duration: 'short'
		});
	} catch (error: any) {
		await Toast.show({
			text: error?.message || 'Failed to download activity',
			duration: 'short'
		});
	}
}

async function deleteDownload() {
	if (!canDeleteDownload.value) return;

	const removed = await deleteActivityDownload();
	if (!removed) return;
	await Toast.show({ text: 'Removed download', duration: 'short' });
}

watch(
	[routeId, isOffline],
	() => {
		void loadActivityForView();
	},
	{ immediate: true }
);

watch(activity, (newActivity) => {
	if (!loadedFromOffline.value && newActivity) {
		currentActivity.value = newActivity;
	}
});

// User Journey

const { user } = useAuth();
const { count: totalActivities, refresh: refreshCount } = useActivitiesCount();
watch(currentActivity, (newActivity) => {
	if (newActivity && !loadedFromOffline.value) {
		refreshCount();
	}
});

onMounted(async () => {
	if (isOffline.value || loadedFromOffline.value) return;
	if (!route.params.id) return;

	if (!user.value) return;
	if (totalActivities.value === null) {
		await refreshCount();
	}

	const count = await getCurrentJourneyM('activity', user.value.id);
	if (!count.success || !count.data) return; // silently ignore errors
	if ('message' in count.data) return;

	const res = await tapCurrentJourneyM('activity', route.params.id as string);
	if (!res.success || !res.data) return; // silently ignore errors
	if ('message' in res.data) return;

	if (count.data.count === res.data.count) return; // no change

	await Toast.show({
		text: `You have now found ${res.data.count}/${totalActivities.value} activities on your journey. Keep going!`,
		duration: 'long'
	});
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
