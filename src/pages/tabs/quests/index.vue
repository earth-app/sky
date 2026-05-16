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

				<div class="flex flex-col items-center gap-6">
					<h2>All Quests</h2>
					<LazyUserQuestMThumbnail
						v-for="quest in quests"
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

onMounted(() => {
	fetchQuests();
	fetchUserQuest(true);
	fetchQuestHistory();
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
