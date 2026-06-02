<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Quest</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col items-center px-4">
				<UAlert
					v-if="quest && isMasteryQuest && !isMasteryQuestCompleted"
					color="warning"
					variant="subtle"
					icon="mdi:alert-octagon-outline"
					title="Badge Mastery Quest"
					description="Abandoning this quest or starting a different one will permanently lock this badge's mastery. Complete every step."
					class="my-3"
				/>

				<UserBadgeMCard
					v-if="isMasteryQuest && masteryBadge"
					:badge="masteryBadge"
					no-modal
					class="my-4"
				/>

				<div class="flex items-center justify-center gap-2">
					<h2
						v-if="quest"
						class="text-lg! font-semibold text-center m-0!"
					>
						{{ quest.title }}
					</h2>
					<UBadge
						v-if="quest && delayReductionLabel && hasDelayedStep"
						color="warning"
						variant="subtle"
						icon="mdi:lightning-bolt"
						size="sm"
						:title="`Your rank unlocks quest steps faster — ${delayReductionLabel.toLowerCase()}.`"
						>{{ delayReductionLabel }}</UBadge
					>
				</div>

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

							<span class="font-semibold text-base! mr-2"
								>Step #{{ openStep.index + 1 }}
								{{ openStep.altIndex ? `(Alt ${openStep.altIndex + 1})` : '' }}</span
							>
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
					:migration-signals="migrationSignals"
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
const userId = computed(() => user.value?.id);
const { quest: currentQuest, questHistory, badges } = useUser(userId);
const { fetchQuest } = useQuests();

const quest = ref<Quest | null>(null);
const progress = computed(() => {
	if (!quest.value) return [];

	if (currentQuest.value?.questId === quest.value.id) {
		return currentQuest.value.progress;
	}

	return questHistory.value.get(quest.value.id)?.progress;
});

// only pass through cloud cancel signals when the open quest matches the active one.
// history quests can't have a live in-progress runner, so signals there are irrelevant.
const migrationSignals = computed(() => {
	if (!quest.value || currentQuest.value?.questId !== quest.value.id) return [];
	return currentQuest.value?.migrationSignals ?? [];
});

const isMasteryQuest = computed(() => quest.value?.id?.startsWith('badge_mastery_') ?? false);
const masteryBadge = computed(() => {
	if (!isMasteryQuest.value) return null;
	if (!quest.value) return null;

	const badgeId = quest.value.id.substring(14, quest.value.id.length);
	return badges.value.find((badge) => badge.id === badgeId) ?? null;
});

const accountType = computed(() => user.value?.account.account_type);
const delayReduction = computed(() => getQuestDelayReduction(accountType.value));
const delayReductionLabel = computed(() => {
	const r = delayReduction.value;
	if (r <= 0) return null;
	if (r >= 1) return 'Bypass';
	return `${Math.round(r * 100)}% Faster`;
});
const hasDelayedStep = computed(() =>
	(quest.value?.steps ?? []).some((step) =>
		Array.isArray(step)
			? step.some((alt) => alt.delay && alt.delay > 0)
			: step.delay && step.delay > 0
	)
);
const isMasteryQuestCompleted = computed(() => {
	if (!quest.value) return false;
	const id = quest.value.id;
	if (currentQuest.value?.questId === id) return false;
	return questHistory.value?.get(id)?.completedAt !== undefined;
});

if (route.params.id) {
	const id = route.params.id as string;
	quest.value = await fetchQuest(id);

	if (!quest.value && id.startsWith('badge_mastery_')) {
		await showErrorToast(new Error('Badge mastery quest not found.'), { duration: 'short' });
		await navigateTo('/tabs/quests', { replace: true });
	}
}

watch(
	() => user.value?.id,
	(id) => {
		if (!id) return;
		const { fetchUserQuest, fetchQuestHistory, fetchQuestHistoryEntry, fetchBadges } = useUser(id);

		void fetchUserQuest(true);
		void fetchQuestHistory();
		void fetchBadges();

		// pull the full entry for the currently-viewed quest so the timeline can show completion state
		const viewedQuestId = quest.value?.id ?? (route.params.id as string | undefined);
		if (viewedQuestId && currentQuest.value?.questId !== viewedQuestId) {
			void fetchQuestHistoryEntry(viewedQuestId);
		}
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
			isUnlocked: boolean;
			data?: string;
	  })
	| null
>(null);
const stepOpen = ref(false);
</script>
