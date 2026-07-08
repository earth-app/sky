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
			<IonRefresher
				slot="fixed"
				@ionRefresh="onRefresh"
			>
				<IonRefresherContent />
			</IonRefresher>
			<div class="flex flex-col items-center px-4 gap-4">
				<IonSearchbar
					id="quest-search"
					v-model="search"
					placeholder="Search Quests..."
					:color="theme"
					class="w-full max-w-2xl mt-8"
					@keyup.enter="refreshQuestData"
				/>

				<IonButton
					id="challenge-friend-trigger"
					expand="block"
					fill="outline"
					color="warning"
					class="w-full max-w-2xl m-0!"
					@click="showChallengePicker = true"
				>
					<UIcon
						name="mdi:sword-cross"
						class="size-5 mr-2!"
					/>
					Challenge a Friend
				</IonButton>

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
					<template v-if="isRefreshing && shownQuests.length === 0">
						<MSkeleton
							v-for="n in 3"
							:key="n"
							:height="120"
							width="100%"
						/>
					</template>
					<MEmptyState
						v-else-if="!isRefreshing && shownQuests.length === 0"
						icon="mdi:map-marker-path"
						title="No quests yet"
						description="Quests are guided journeys tied to your activities. Pick one to start your first."
						cta-label="Explore Activities"
						cta-icon="mdi:run"
						cta-to="/tabs/discover?tab=activity"
						variant="primary"
					/>
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

			<UserMChallengeFriendPicker v-model:is-open="showChallengePicker" />
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { theme } from '~/composables/useSettings';

const { user } = useAuth();
const route = useRoute();
const ionRouter = useIonRouter();

const userId = computed(() => user.value?.id);
const { quest, questHistory, fetchUserQuest, fetchQuestHistory } = useUser(userId);
const { quests, fetchQuests } = useQuests();

const search = ref('');
const isRefreshing = ref(false);
const showChallengePicker = ref(false);

// challenge / deep-link entry; /tabs/quests?open=<questId> jumps straight to that quest.
// guard against re-firing on tab re-entry by clearing the query once handled.
function maybeOpenQuest() {
	const open = typeof route.query.open === 'string' ? route.query.open : '';
	if (!open) return;
	ionRouter.navigate(`/tabs/quests/${open}`, 'forward', 'push');
}

const HISTORY_PAGE_LIMIT = 100;
async function refreshQuestData() {
	if (!userId.value || isRefreshing.value) return;
	isRefreshing.value = true;
	try {
		await Promise.all([
			fetchUserQuest(true),
			fetchQuestHistory({ force: true, limit: HISTORY_PAGE_LIMIT, search: search.value })
		]);
		// manual checker: re-arm the quest Live Activity now that the active quest is fresh
		void useQuestLiveActivity().forceResync();
	} finally {
		isRefreshing.value = false;
	}
}

// pull-to-refresh (parity with the discover tab); always complete the spinner
async function onRefresh(event: CustomEvent) {
	try {
		await refreshQuestData();
	} finally {
		(event.target as HTMLIonRefresherElement | null)?.complete();
	}
}

onMounted(() => {
	fetchUserQuest();
	fetchQuests();
	fetchQuestHistory();
	maybeOpenQuest();
});

// a deep link may arrive while the quests tab is already alive in the outlet
watch(
	() => route.query.open,
	() => maybeOpenQuest()
);

// merge static catalog with history so dynamic quests (badge_mastery, activity, custom)
const allQuests = computed<Quest[]>(() => {
	const merged = new Map<string, Quest>();

	for (const q of quests.value ?? []) if (q?.id) merged.set(q.id, q);
	for (const entry of questHistory.value.values()) {
		if (entry?.quest?.id && !merged.has(entry.quest.id)) merged.set(entry.quest.id, entry.quest);
	}
	return Array.from(merged.values());
});

const shownQuests = computed(() => {
	const term = search.value.toLowerCase();
	return allQuests.value.filter((q) => {
		const id = q.id?.toLowerCase() ?? '';
		const title = q.title?.toLowerCase() ?? '';
		const description = q.description?.toLowerCase() ?? '';
		return id.includes(term) || title.includes(term) || description.includes(term);
	});
});

watch(userId, () => void refreshQuestData(), { immediate: true });

// ionic keeps tab pages alive, so without a view-enter hook a newly completed quest
// elsewhere wouldn't show up until the user logs out and back in
onIonViewWillEnter(() => {
	void refreshQuestData();
});
</script>
