<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Quests {{ quest?.title ? `- ${quest.title}` : '' }}</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col px-4">
				<UserQuestMTimeline
					v-if="quest"
					:quest="quest"
					:progress="progress"
					@select-step="
						openStep = $event;
						stepOpen = true;
					"
				/>
				<Loading v-else />
			</div>
		</IonContent>

		<IonModal
			v-if="openStep"
			:is-open="stepOpen"
			@did-dismiss="stepOpen = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>
						<div class="flex items-center ml-2">
							<UIcon
								:name="openStep.icon"
								class="text-2xl! mr-2"
							/>

							<div class="flex flex-col">
								<span class="font-semibold text-base!"
									>Step #{{ openStep.index + 1 }}
									{{ openStep.altIndex ? `(Alt ${openStep.altIndex + 1})` : '' }}</span
								>
								<span class="text-xs! opacity-80">{{ trimString(openStep.description, 100) }}</span>
							</div>
						</div>
					</IonTitle>
					<IonButtons slot="end">
						<IonButton
							@click="stepOpen = false"
							color="danger"
						>
							<UIcon
								name="mdi:close"
								class="min-h-6 min-w-6"
							/>
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<div class="h-full overflow-auto">
				<UserQuestStepMSubmission
					v-if="quest"
					:quest="quest"
					:progress="progress"
					:step="openStep"
					@submitted="stepOpen = false"
				/>
				<Loading v-else-if="stepOpen" />
			</div>
		</IonModal>
	</IonPage>
</template>

<script setup lang="ts">
const route = useRoute();
const { user } = useAuth();
const { quest: currentQuest, questHistory } = useUser(user.value?.id || '');
const { fetchQuest } = useQuests();

const quest = ref<Quest | null>(null);
const progress = computed(() => {
	if (!quest.value) return [];

	if (currentQuest.value?.questId === quest.value.id) {
		return currentQuest.value.progress;
	}

	return questHistory.value.get(quest.value.id)?.progress;
});

if (route.params.id) {
	quest.value = await fetchQuest(route.params.id as string);
}

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

const openStep = ref<
	| (QuestStep & {
			icon: string;
			completed: boolean;
			index: number;
			altIndex?: number;
			isCurrentQuest: boolean;
			isCurrentStep: boolean;
			data?: string;
	  })
	| null
>(null);
const stepOpen = ref(false);
</script>
