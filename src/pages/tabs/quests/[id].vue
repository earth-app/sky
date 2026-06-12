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
			<div class="flex flex-col items-center px-4 mt-2">
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

				<UserQuestMChallengeBanner
					v-if="quest"
					:quest-id="quest.id"
					:your-completed-steps="completedStepCount"
					:total-steps="quest.steps.length"
				/>

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
			@did-dismiss="closeStepModal"
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
							@click="closeStepModal"
							color="danger"
							aria-label="Close quest step"
						>
							<UIcon
								name="mdi:close"
								class="min-h-6 min-w-6"
							/>
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<div class="h-full overflow-auto relative">
				<UserQuestStepMSubmission
					v-if="quest"
					:quest="quest"
					:progress="progress"
					:step="openStep"
					:migration-signals="migrationSignals"
					@submitted="onStepSubmitted"
				/>
				<Loading v-else-if="stepOpen" />
				<UiSparkleBurst
					:trigger="sparkleTick"
					:count="36"
					color="success"
				/>
			</div>
		</IonModal>
	</IonPage>
</template>

<script setup lang="ts">
const route = useRoute();
const { user } = useAuth();
const userId = computed(() => user.value?.id);
const {
	quest: currentQuest,
	questHistory,
	badges,
	fetchUserQuest,
	fetchQuestHistoryEntry
} = useUser(userId);
const { fetchQuest } = useQuests();

const quest = ref<Quest | null>(null);
const progress = computed(() => {
	if (!quest.value) return [];

	if (currentQuest.value?.questId === quest.value.id) {
		return currentQuest.value.progress;
	}

	return questHistory.value.get(quest.value.id)?.progress;
});

// count progress slots with at least one entry — matches how the timeline marks a
// step complete (alt-step groups are an array, regular steps a single entry).
const completedStepCount = computed(() => {
	const slots = progress.value;
	if (!Array.isArray(slots)) return 0;
	return slots.filter((slot) => (Array.isArray(slot) ? slot.length > 0 : !!slot)).length;
});

// only pass through cloud cancel signals when the open quest matches the active one.
// history quests can't have a live in-progress runner, so signals there are irrelevant.
const migrationSignals = computed(() => {
	if (!quest.value || currentQuest.value?.questId !== quest.value.id) return [];
	return currentQuest.value?.migrationSignals ?? [];
});

const MASTERY_PREFIX = 'badge_mastery_';
const isMasteryQuest = computed(() => quest.value?.id?.startsWith(MASTERY_PREFIX) ?? false);
const masteryBadge = computed(() => {
	if (!isMasteryQuest.value) return null;
	if (!quest.value) return null;

	const badgeId = quest.value.id.slice(MASTERY_PREFIX.length);
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

	// Mastery quests are user-scoped. If auth hasn't hydrated yet, fetchQuest may
	// legitimately return null even though the quest exists for the eventual user.
	// Defer the 404 redirect to the auth watcher below.
	if (!quest.value && id.startsWith(MASTERY_PREFIX) && user.value) {
		await showErrorToast(new Error('Badge mastery quest not found.'), { duration: 'short' });
		await navigateTo('/tabs/quests', { replace: true });
	}
}

watch(
	() => user.value?.id,
	async (id) => {
		if (!id) return;
		const { fetchUserQuest, fetchQuestHistory, fetchQuestHistoryEntry, fetchBadges } = useUser(id);

		void fetchUserQuest(true);
		void fetchQuestHistory();
		void fetchBadges();

		const viewedQuestId = quest.value?.id ?? (route.params.id as string | undefined);
		if (viewedQuestId && currentQuest.value?.questId !== viewedQuestId) {
			void fetchQuestHistoryEntry(viewedQuestId);
		}

		// retry the quest fetch now that auth is hydrated — covers the race where
		// the page mounted before user.value resolved.
		if (!quest.value && viewedQuestId) {
			quest.value = await fetchQuest(viewedQuestId);
			if (!quest.value && viewedQuestId.startsWith(MASTERY_PREFIX)) {
				await showErrorToast(new Error('Badge mastery quest not found.'), {
					duration: 'short'
				});
				await navigateTo('/tabs/quests', { replace: true });
			}
		}
	},
	{ immediate: true }
);

const { notifySuccess } = useAppHaptics();
const sparkleTick = ref(0);

// micro-confetti tick + haptic, then close after the burst plays
function onStepSubmitted() {
	sparkleTick.value++;
	void notifySuccess();
	setTimeout(() => {
		closeStepModal();
	}, 650);
}

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

let reconciling = false;
async function reconcileQuestState() {
	if (reconciling || !user.value?.id) return;
	reconciling = true;
	try {
		await fetchUserQuest(true);
		const viewedId = quest.value?.id;
		if (viewedId && currentQuest.value?.questId !== viewedId) {
			await fetchQuestHistoryEntry(viewedId, { force: true });
		}
	} catch {
		// non-fatal: the optimistic update usually already reflects the change
	} finally {
		reconciling = false;
	}
}

function closeStepModal() {
	stepOpen.value = false;
	openStep.value = null;
	void reconcileQuestState();
}
</script>
