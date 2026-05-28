<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Quests</IonTitle>
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
						hydrate-on-visible
					/>
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();

const { quest, questHistory, fetchUserQuest, fetchQuestHistory } = useUser(user.value?.id || '');
const { quests, fetchQuests } = useQuests();

const search = ref('');

onMounted(() => {
	fetchQuests();
	fetchUserQuest(true);
	fetchQuestHistory();
});

const shownQuests = computed(() => {
	const quests0 = quests.value || [];
	if (!quests0) return [];

	return quests0.filter(
		(q) =>
			q.id.toLowerCase().includes(search.value.toLowerCase()) ||
			q.title.toLowerCase().includes(search.value.toLowerCase()) ||
			q.description.toLowerCase().includes(search.value.toLowerCase())
	);
});

watch(
	() => user.value?.id,
	(id) => {
		if (!id) return;
		const { fetchUserQuest, fetchQuestHistory } = useUser(id);

		void fetchUserQuest(true);
		void fetchQuestHistory();
	},
	{ immediate: true }
);
</script>
