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
					v-if="quest && showHealthDisclosure"
					color="primary"
					variant="subtle"
					icon="mdi:heart-pulse"
					title="Apple Health"
					description="This quest includes a distance step. Distance is read from Apple Health, including workouts your Apple Watch records. You can manage access anytime in Settings > Health > Data Access & Devices."
					class="my-3"
				/>

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
						:title="`Your rank unlocks quest steps faster; ${delayReductionLabel.toLowerCase()}.`"
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
					v-if="quest && progressReady"
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
import { Capacitor } from '@capacitor/core';

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
const { fetchQuest, getStepIcon } = useQuests();

const quest = ref<Quest | null>(null);
const progress = computed(() => {
	if (!quest.value) return [];

	if (currentQuest.value?.questId === quest.value.id) {
		return currentQuest.value.progress;
	}

	return questHistory.value.get(quest.value.id)?.progress;
});

const progressChecked = ref(false);
const progressReady = computed(() => {
	if (!quest.value) return false;
	const id = quest.value.id;

	if (currentQuest.value?.questId === id) return true;
	if (questHistory.value.get(id)?.progress !== undefined) return true;

	return progressChecked.value;
});

// surface the apple health disclosure on quests that include a distance step (ios reads distance from healthkit)
const hasDistanceStep = computed(() =>
	(quest.value?.steps ?? []).some((slot) =>
		(Array.isArray(slot) ? slot : [slot]).some((s) => s?.type === 'distance_covered')
	)
);
const isActiveQuest = computed(
	() => !!quest.value && currentQuest.value?.questId === quest.value.id
);

const showHealthDisclosure = computed(
	() => hasDistanceStep.value && Capacitor.getPlatform() === 'ios' && !isActiveQuest.value
);

// count progress slots with at least one entry; matches how the timeline marks
const completedStepCount = computed(() => {
	const slots = progress.value;
	if (!Array.isArray(slots)) return 0;
	return slots.filter((slot) => (Array.isArray(slot) ? slot.length > 0 : !!slot)).length;
});

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

		// resolve the active quest first; under data saver prefer cache over a forced round-trip
		await fetchUserQuest(!isDataConstrained.value);

		let viewedQuestId = quest.value?.id ?? (route.params.id as string | undefined);

		// retry the quest fetch now that auth is hydrated; covers the race where
		// the page mounted before user.value resolved.
		if (!quest.value && viewedQuestId) {
			quest.value = await fetchQuest(viewedQuestId);
			if (!quest.value && viewedQuestId.startsWith(MASTERY_PREFIX)) {
				await showErrorToast(new Error('Badge mastery quest not found.'), {
					duration: 'short'
				});
				await navigateTo('/tabs/quests', { replace: true });
				return;
			}
			viewedQuestId = quest.value?.id ?? viewedQuestId;
		}

		if (viewedQuestId && currentQuest.value?.questId !== viewedQuestId) {
			await fetchQuestHistoryEntry(viewedQuestId);
		}
		progressChecked.value = true;

		// remaining fetches only feed other surfaces; fire and forget
		void fetchQuestHistory();
		void fetchBadges();
	},
	{ immediate: true }
);

const { notifySuccess } = useAppHaptics();
const sparkleTick = ref(0);

const optimisticApplied = ref(false);

// micro-confetti tick + haptic, then close after the burst plays
function onStepSubmitted() {
	optimisticApplied.value = true;
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

// open a step modal directly from its index; used by deep links / notification taps
// (?step=N&alt=M), mirroring what tapping the timeline tile would do
function openStepByIndex(stepIndex: number, altIndex?: number) {
	if (!quest.value) return;
	const slot = quest.value.steps[stepIndex];
	if (!slot) return;
	const step = Array.isArray(slot) ? (slot[altIndex ?? 0] ?? slot[0]) : slot;
	if (!step) return;
	const isCurrent = currentQuest.value?.questId === quest.value.id;
	const currentIdx = isCurrent
		? (currentQuest.value?.currentStepIndex ?? 0)
		: quest.value.steps.length;
	const progSlot = progress.value?.[stepIndex];
	const completed = Array.isArray(progSlot)
		? progSlot.some((p) => (p.altIndex ?? 0) === (altIndex ?? 0))
		: !!progSlot;
	openStep.value = {
		...step,
		icon: getStepIcon(step.type),
		index: stepIndex,
		...(altIndex !== undefined ? { altIndex } : {}),
		completed,
		isCurrentQuest: isCurrent,
		isUnlocked: stepIndex <= currentIdx
	};
	stepOpen.value = true;
}

const stepQueryHandled = ref(false);
watch(
	[quest, progressReady, () => route.query.step],
	() => {
		if (stepQueryHandled.value || !quest.value || !progressReady.value) return;
		const raw = route.query.step;
		const idxStr = Array.isArray(raw) ? raw[0] : raw;
		if (idxStr == null) return;
		const stepIndex = Number(idxStr);
		if (!Number.isInteger(stepIndex) || stepIndex < 0) return;
		const altRaw = route.query.alt;
		const altStr = Array.isArray(altRaw) ? altRaw[0] : altRaw;
		const altIndex = altStr != null && altStr !== '' ? Number(altStr) : undefined;
		stepQueryHandled.value = true;
		openStepByIndex(stepIndex, Number.isInteger(altIndex) ? altIndex : undefined);
	},
	{ immediate: true }
);

let reconciling = false;
async function reconcileQuestState() {
	if (reconciling || !user.value?.id) return;
	reconciling = true;
	try {
		if (currentQuest.value !== null) {
			await fetchUserQuest(true);
		}

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
	if (!stepOpen.value && openStep.value === null) return;

	const skipReconcile = optimisticApplied.value || isDataConstrained.value;
	optimisticApplied.value = false;
	stepOpen.value = false;
	openStep.value = null;

	if (!skipReconcile) void reconcileQuestState();
}

const celebration = useQuestCelebration();
watch(
	() => celebration.open.value,
	(open) => {
		if (!open || !stepOpen.value) return;
		const celebratedId = celebration.payload.value.questId;
		if (celebratedId && celebratedId !== quest.value?.id) return;

		optimisticApplied.value = true;
		closeStepModal();
	}
);
</script>
