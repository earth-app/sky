<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Quests</IonTitle>
				<IonButtons slot="end">
					<IonButton
						:disabled="isRefreshing || !userId"
						aria-label="Refresh quests"
						@click="refreshQuestData"
					>
						<IonSpinner
							v-if="isRefreshing"
							slot="icon-only"
							name="crescent"
						/>
						<UIcon
							v-else
							slot="icon-only"
							name="mdi:refresh"
							class="size-6"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col items-center px-4 gap-4">
				<IonSearchbar
					id="quest-search"
					v-model="search"
					placeholder="Search Quests..."
					:color="theme"
					class="w-full max-w-2xl mt-8"
					@keyup.enter="refreshQuestData"
				/>

				<div
					v-if="quest?.quest"
					class="flex flex-col items-center gap-6"
				>
					<h2>Current Quest</h2>
					<UserQuestMThumbnail
						:quest="quest.quest"
						:progress="quest.progress"
						current
					/>
				</div>

				<div class="flex flex-col items-center gap-6 mb-8">
					<div class="flex flex-col items-center">
						<h2 class="mb-0!">All Quests</h2>
						<span class="text-base opacity-90">{{ shownQuests.length }} shown</span>
					</div>
					<LazyUserQuestMThumbnail
						v-for="quest in shownQuests"
						:key="quest.id"
						:quest="quest"
						:progress="questHistory.get(quest.id)?.progress"
						:completedAt="questHistory.get(quest.id)?.completedAt"
						hydrate-on-visible
					/>
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();

const userId = computed(() => user.value?.id);
const { quest, questHistory, fetchUserQuest, fetchQuestHistory } = useUser(userId);
const { quests, fetchQuests } = useQuests();

const search = ref('');
const isRefreshing = ref(false);

const HISTORY_PAGE_LIMIT = 100;
async function refreshQuestData() {
	if (!userId.value || isRefreshing.value) return;
	isRefreshing.value = true;
	try {
		await Promise.all([
			fetchUserQuest(true),
			fetchQuestHistory({ force: true, limit: HISTORY_PAGE_LIMIT, search: search.value })
		]);
	} finally {
		isRefreshing.value = false;
	}
}

onMounted(() => {
	fetchQuests();
});

// merge static catalog with history so dynamic quests (badge_mastery, activity, custom)
// — which never appear in the catalog — still show up once they've been started/completed
const allQuests = computed<Quest[]>(() => {
	const merged = new Map<string, Quest>();
	for (const q of quests.value ?? []) merged.set(q.id, q);
	for (const entry of questHistory.value.values()) {
		if (entry.quest && !merged.has(entry.quest.id)) merged.set(entry.quest.id, entry.quest);
	}
	return Array.from(merged.values());
});

const shownQuests = computed(() => {
	const term = search.value.toLowerCase();
	return allQuests.value.filter(
		(q) =>
			q.id.toLowerCase().includes(term) ||
			q.title.toLowerCase().includes(term) ||
			q.description.toLowerCase().includes(term)
	);
});

watch(userId, () => void refreshQuestData(), { immediate: true });

// ionic keeps tab pages alive, so without a view-enter hook a newly completed quest
// elsewhere wouldn't show up until the user logs out and back in
onIonViewWillEnter(() => {
	void refreshQuestData();
});
</script>
