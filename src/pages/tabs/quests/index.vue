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
					<h2 class="text-lg">Current Quest</h2>
					<UserQuestMThumbnail
						:quest="quest.quest"
						:progress="quest.progress"
						current
					/>
				</div>

				<div
					v-if="activityQuests.length > 0"
					class="flex flex-col items-center gap-6"
				>
					<div class="flex flex-col items-center">
						<h2 class="text-lg mb-0!">From Your Activities</h2>
						<span class="text-base opacity-90"
							>{{ activityQuests.length }} Built Around What You Picked</span
						>
					</div>
					<LazyUserQuestMThumbnail
						v-for="q in activityQuests"
						:key="q.id"
						:quest="q"
						:progress="questHistory.get(q.id)?.progress"
						:completedAt="questHistory.get(q.id)?.completedAt"
						hydrate-on-visible
					/>
				</div>

				<div class="flex flex-col items-center gap-6 mb-8">
					<div class="flex flex-col items-center">
						<h2 class="text-lg mb-0!">All Quests</h2>
						<span class="text-base opacity-90">{{ questCountLabel }}</span>
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
import { filterQuests, questCountText } from '~/utils/quest';

const { user } = useAuth();
const route = useRoute();
const router = useRouter();
const ionRouter = useIonRouter();

const userId = computed(() => user.value?.id);
const { quest, questHistory, fetchUserQuest, fetchQuestHistory } = useUser(userId);
const { quests, fetchQuests, fetchActivityQuests } = useQuests();

const search = ref('');
const isRefreshing = ref(false);
const showChallengePicker = ref(false);

// challenge / deep-link entry; /tabs/quests?open=<questId> jumps straight to that quest.
// the query is cleared once handled, so tab re-entry does not re-open it.
function maybeOpenQuest() {
	const open = typeof route.query.open === 'string' ? route.query.open : '';
	if (!open) return;

	const { open: _handled, ...rest } = route.query;
	void router.replace({ path: route.path, query: rest });
	ionRouter.navigate(`/tabs/quests/${open}`, 'forward', 'push');
}

const HISTORY_PAGE_LIMIT = 100;

// concurrent callers share one run rather than the later one being dropped; a pull-to-refresh
// that lands while a view-enter refresh is still going used to complete its spinner having
// fetched nothing
let refreshInFlight: Promise<void> | null = null;

async function refreshQuestData(): Promise<void> {
	if (!userId.value) return;
	if (refreshInFlight) return refreshInFlight;

	isRefreshing.value = true;
	refreshInFlight = (async () => {
		try {
			await Promise.all([
				fetchQuests(true),
				fetchActivityQuests(user.value?.activities, true),
				fetchUserQuest(true),
				fetchQuestHistory({ force: true, limit: HISTORY_PAGE_LIMIT, search: search.value })
			]);

			// manual checker: re-arm the quest Live Activity now that the active quest is fresh
			void useQuestLiveActivity().forceResync();
		} finally {
			isRefreshing.value = false;
			refreshInFlight = null;
		}
	})();

	return refreshInFlight;
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
	fetchQuestHistory({ limit: HISTORY_PAGE_LIMIT, search: search.value });
});

// the user hydrates after mount, so the activities are not known yet when this page first renders
watch(
	() => user.value?.activities,
	(activities) => activities?.length && void fetchActivityQuests(activities),
	{ immediate: true }
);

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

// quests built from the user's own activities get their own section above, so like the active
// quest they never repeat down here
const activityQuests = computed<Quest[]>(() =>
	allQuests.value.filter((q) => q.id.startsWith('activity_quest_'))
);

const shownQuests = computed(() =>
	filterQuests(allQuests.value, search.value, quest.value?.quest?.id).filter(
		(q) => !q.id.startsWith('activity_quest_')
	)
);

// an unexplained "35 shown" reads like a bug; name the total whenever anything is held back
const questCountLabel = computed(() =>
	questCountText(shownQuests.value.length, allQuests.value.length)
);

watch(userId, () => void refreshQuestData(), { immediate: true });

// ionic keeps tab pages alive, so without a view-enter hook a newly completed quest
// elsewhere wouldn't show up until the user logs out and back in
onIonViewWillEnter(() => {
	void refreshQuestData();
});

// pushing from onMounted lands mid-transition and ionic drops it, so the deep link is handled
// once this page is actually the active view
onIonViewDidEnter(() => {
	maybeOpenQuest();
});
</script>
