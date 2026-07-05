<template>
	<div class="flex flex-col w-full h-full">
		<div class="flex justify-center my-2">
			<IonButton
				v-if="isCurrentQuest"
				id="quest-button"
				color="danger"
				:loading="loading"
				:disabled="loading"
				class="self-center"
				@click="handleEndClick"
				>End Quest</IonButton
			>

			<IonButton
				v-else-if="hasOtherActiveQuest && !completed"
				id="quest-button"
				color="warning"
				:loading="loading"
				:disabled="loading"
				class="self-center"
				@click="handleReplaceClick"
				>Replace &amp; Start Quest</IonButton
			>

			<IonButton
				v-else-if="!isCurrentQuest && !completed"
				id="quest-button"
				color="success"
				:loading="loading"
				:disabled="loading || questLoading"
				class="self-center"
				@click="handleStart(false)"
				>Start Quest</IonButton
			>

			<IonButton
				v-else
				id="quest-button"
				fill="outline"
				:color="theme === 'dark' ? 'light' : 'dark'"
				disabled
				class="self-center"
				>Quest Completed</IonButton
			>

			<IonButton
				color="secondary"
				class="ml-2 max-w-6 max-h-6 rounded-xl"
				fill="outline"
				@click="startTour(`quest-timeline-${props.quest.id}`)"
			>
				<UIcon
					name="mdi:progress-question"
					class="min-h-6 min-w-6"
				/>
			</IonButton>
		</div>
		<div
			v-for="(item, index) in items"
			:key="index"
			class="flex flex-col items-center w-full min-h-24"
		>
			<div
				:id="`tile-${index}`"
				class="flex gap-2 items-start my-2"
				:class="
					isCurrentQuest && currentIndex === index
						? 'ring-2 ring-neutral ring-offset-2 p-2 rounded-lg'
						: ''
				"
			>
				<div
					v-if="Array.isArray(item)"
					v-for="(altStep, altIndex) in item"
					class="flex flex-col items-center gap-1"
				>
					<LazyUBadge
						:key="altIndex"
						:id="`tile-${index}:${altIndex}`"
						:icon="altStep.icon"
						:color="
							isCurrentQuest
								? isCurrentStep(index)
									? 'primary'
									: altStep.completed
										? 'warning'
										: 'secondary'
								: 'neutral'
						"
						:variant="altStep.completed ? 'solid' : 'subtle'"
						size="xl"
						:class="[
							'hover:cursor-pointer',
							{
								'opacity-40':
									altStep.delayedUntil > now ||
									(isCurrentQuest && currentIndex >= 0 && index > currentIndex)
							}
						]"
						:title="
							!altStep.completed && item.some((s) => s.completed)
								? 'Bonus step, optional, but earns extra reward'
								: undefined
						"
						@click="onStepClick(altStep)"
						hydrate-on-visible
					/>
					<span
						v-if="altStep.reward"
						class="text-xs opacity-70"
						>+{{ altStep.reward }}</span
					>
					<span
						v-if="!altStep.completed && item.some((s) => s.completed)"
						class="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300"
					>
						Bonus
					</span>
				</div>
				<div
					v-else
					class="flex flex-col items-center gap-1"
				>
					<LazyUBadge
						:id="`tile-${index}:0`"
						:icon="item.icon"
						:color="
							isCurrentQuest
								? isCurrentStep(index)
									? 'primary'
									: item.completed
										? 'warning'
										: 'secondary'
								: 'neutral'
						"
						:variant="item.completed ? 'solid' : 'subtle'"
						size="xl"
						:class="[
							'hover:cursor-pointer',
							{
								'opacity-40':
									item.delayedUntil > now ||
									(isCurrentQuest && currentIndex >= 0 && index > currentIndex)
							}
						]"
						@click="onStepClick(item)"
						hydrate-on-visible
					/>

					<span
						v-if="item.reward"
						class="text-xs opacity-70"
						>+{{ item.reward }}</span
					>
				</div>
			</div>

			<div
				:class="[
					'w-2 min-h-16 rounded-full transition-colors duration-200',
					Number(Array.isArray(item) ? item.some((s) => s.completed) : item.completed)
						? 'bg-primary'
						: 'bg-gray-300'
				]"
			></div>
		</div>
		<div class="flex flex-col items-center my-4 min-h-24 gap-1">
			<LazyUBadge
				id="tile-end"
				icon="mdi:medal-outline"
				color="warning"
				variant="solid"
				size="xl"
				class="self-center"
				hydrate-on-visible
			/>
			<span class="text-xs opacity-70">+{{ props.quest.reward }}</span>
		</div>

		<ClientOnly>
			<MSiteTour
				:steps="timelineTour"
				:name="`Mobile Quest Timeline Tour (${props.quest.title})`"
				:tour-id="`quest-timeline-${props.quest.id}`"
			/>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import { theme } from '~/composables/useSettings';

const props = defineProps<{
	quest: Quest;
	progress?: (QuestProgressEntry | QuestProgressEntry[])[];
}>();

const emit = defineEmits<{
	'select-step': [
		step: QuestStep & {
			icon: string;
			completed: boolean;
			index: number;
			altIndex?: number;
			isCurrentQuest: boolean;
			isUnlocked: boolean;
			data?: string;
		}
	];
}>();

const { user } = useAuth();
const userId = computed(() => user.value?.id);
const { quest, questHistory, fetchUserQuest, startQuest, endQuest } = useUser(userId);
const { getStepIcon } = useQuests();
const { require: requirePermission } = useQuestPermissions();
const userStore = useUserStore();

const accountType = computed(() => user.value?.account.account_type);
const delayReduction = computed(() => getQuestDelayReduction(accountType.value));
const delayReductionLabel = computed(() => {
	const r = delayReduction.value;
	if (r <= 0) return null;
	if (r >= 1) return 'Bypass';
	return `${Math.round(r * 100)}% Faster`;
});
function effectiveDelay(rawDelay?: number) {
	return getEffectiveQuestStepDelay(rawDelay ?? 0, accountType.value);
}

const masteryBadgeIdFromQuestId = (questId: string | undefined): string | null => {
	if (!questId) return null;
	return questId.startsWith('badge_mastery_') ? questId.slice('badge_mastery_'.length) : null;
};

const loading = ref(false);
const now = ref(Date.now());
let _nowTimer: ReturnType<typeof setInterval> | null = null;
let _visibilityHandler: (() => void) | null = null;

function startNowTimer() {
	if (_nowTimer) return;
	_nowTimer = setInterval(() => {
		now.value = Date.now();
	}, 10_000);
}

function stopNowTimer() {
	if (_nowTimer) {
		clearInterval(_nowTimer);
		_nowTimer = null;
	}
}

onMounted(() => {
	startNowTimer();
	if (typeof document !== 'undefined') {
		_visibilityHandler = () => {
			if (document.visibilityState === 'hidden') {
				stopNowTimer();
			} else {
				now.value = Date.now();
				startNowTimer();
			}
		};
		document.addEventListener('visibilitychange', _visibilityHandler);
	}
});

watch(
	() => user.value?.id,
	(id) => {
		if (!id) return;
		void fetchUserQuest(true);
	},
	{ immediate: true }
);

onUnmounted(() => {
	stopNowTimer();
	if (_visibilityHandler && typeof document !== 'undefined') {
		document.removeEventListener('visibilitychange', _visibilityHandler);
		_visibilityHandler = null;
	}
});

const completed = computed(() => {
	return questHistory.value?.get(props.quest.id)?.completedAt !== undefined;
});

// true while auth hydration or the initial quest fetch hasn't resolved yet
const questLoading = computed(() => !user.value?.id || quest.value === undefined);
const isCurrentQuest = computed(() => !!quest.value && quest.value.questId === props.quest.id);

function isCurrentStep(index: number) {
	if (!quest.value) return false;
	return currentIndex.value === index;
}

function isUnlocked(index: number) {
	if (!quest.value) return false;
	if (currentIndex.value === -1) return true;
	return index <= currentIndex.value;
}

const hasOtherActiveQuest = computed(
	() => !!quest.value?.questId && quest.value.questId !== props.quest.id
);

const isMasteryQuest = computed(() => props.quest.id.startsWith('badge_mastery_'));
const activeQuestIsMastery = computed(() =>
	(quest.value?.questId ?? '').startsWith('badge_mastery_')
);

async function confirmMasteryLock(message: string, okTitle: string): Promise<boolean> {
	const { value } = await Dialog.confirm({
		title: 'Lock this Badge Mastery?',
		message,
		okButtonTitle: okTitle,
		cancelButtonTitle: 'Cancel'
	});
	return value;
}

// generic destructive confirm for regular quests; partial progress isn't recoverable
async function confirmDestructive(
	title: string,
	message: string,
	okTitle: string
): Promise<boolean> {
	const { value } = await Dialog.confirm({
		title,
		message,
		okButtonTitle: okTitle,
		cancelButtonTitle: 'Cancel'
	});
	return value;
}

async function handleEndClick() {
	if (completed.value) return;
	if (isCurrentQuest.value && isMasteryQuest.value) {
		const badgeId = masteryBadgeIdFromQuestId(props.quest.id);
		const ok = await confirmMasteryLock(
			`If you abandon this quest, the mastery for "${props.quest.title}" will be permanently locked. You will not be able to generate or retry it. Are you sure?`,
			'Lock & Abandon'
		);
		if (!ok) return;
		if (badgeId) userStore.lockedMasteries.add(badgeId);
		await handleEnd();
		await showInfoToast(`Mastery for "${props.quest.title}" has been locked.`, {
			duration: 'long'
		});
		return;
	}

	const ok = await confirmDestructive(
		'End Quest?',
		`Ending "${props.quest.title}" discards your progress on it; partial quest progress can't be recovered. Are you sure?`,
		'End Quest'
	);
	if (!ok) return;
	await handleEnd();
}

async function handleReplaceClick() {
	if (completed.value) return;

	if (activeQuestIsMastery.value) {
		const activeBadgeId = masteryBadgeIdFromQuestId(quest.value?.questId);
		const activeTitle = quest.value?.quest?.title || 'this Badge Mastery';
		const ok = await confirmMasteryLock(
			`Your active quest "${activeTitle}" is a Badge Mastery quest. Starting this one will permanently lock that mastery. Are you sure?`,
			'Lock & Start'
		);
		if (!ok) return;
		if (activeBadgeId) userStore.lockedMasteries.add(activeBadgeId);
		await handleStart(true);
		await showInfoToast(`Mastery for "${activeTitle}" has been locked.`, { duration: 'long' });
		return;
	}

	const activeTitle = quest.value?.quest?.title || 'your active quest';
	const ok = await confirmDestructive(
		'Replace Active Quest?',
		`Starting "${props.quest.title}" ends "${activeTitle}" and discards its progress; partial quest progress can't be recovered. Are you sure?`,
		'Replace & Start'
	);
	if (!ok) return;
	await handleStart(true);
}

async function handleStart(override: boolean = false) {
	if (completed.value) return;
	loading.value = true;

	try {
		if (props.quest.mobile_only && !Capacitor.isNativePlatform()) {
			await showErrorToast(
				new Error('This quest can only be started from the mobile app on a device.'),
				{ duration: 'long' }
			);
			return;
		}

		const perms = props.quest.permissions ?? [];
		for (const perm of perms) {
			const granted = await requirePermission(perm);
			if (!granted) return;
		}

		const res = await startQuest(props.quest.id, override);
		await Toast.show({
			text: res.message || 'Quest started!',
			duration: 'long'
		});
	} catch (e) {
		await showErrorToast(e, { fallback: 'Failed to start quest.', duration: 'long' });
	} finally {
		loading.value = false;
	}
}

async function handleEnd() {
	if (completed.value) return;
	loading.value = true;
	try {
		const res = await endQuest();
		await Toast.show({
			text: res.message || 'Quest ended!',
			duration: 'long'
		});
	} catch (e) {
		await showErrorToast(e, { fallback: 'Failed to end quest.', duration: 'long' });
	} finally {
		loading.value = false;
	}
}

type TimelineStep = QuestStep & {
	icon: string;
	index: number;
	altIndex?: number;
	completed: boolean;
	completedAt?: number;
	effectiveDelay: number;
	delayedUntil: number;
};

function formatRemaining(ms: number): string {
	const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	const secs = totalSeconds % 60;

	if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
	return `${secs}s`;
}

async function onStepClick(step: TimelineStep) {
	if (step.delayedUntil > now.value) {
		const remaining = step.delayedUntil - now.value;
		const bonusSuffix = delayReductionLabel.value ? ` (${delayReductionLabel.value})` : '';
		await showInfoToast(`This step unlocks in ${formatRemaining(remaining)}${bonusSuffix}.`, {
			duration: 'long'
		});

		void scheduleStepUnlockNotification({
			questId: props.quest.id,
			questTitle: props.quest.title,
			stepIndex: step.index,
			unlockAt: step.delayedUntil
		});
		return;
	}

	emit('select-step', {
		...step,
		isCurrentQuest: isCurrentQuest.value,
		isUnlocked: isUnlocked(step.index)
	});
}

function getPrevCompletedAt(index: number): number {
	if (index === 0) return 0;
	const prev = props.progress?.[index - 1];
	if (!prev) return 0;
	if (Array.isArray(prev)) {
		return prev.find((p) => p.submittedAt)?.submittedAt || 0;
	}
	return prev.submittedAt || 0;
}

const items = computed(() => {
	const steps = props.quest?.steps;
	if (!steps || steps.length === 0) return [];

	return steps.map((step, index) => {
		const prevCompletedAt = getPrevCompletedAt(index);

		if (Array.isArray(step)) {
			return step.map((altStep, altIndex) => {
				// progress[index] is QuestProgressEntry[] for alt-step groups
				const progSlot = props.progress?.[index];
				const entry = Array.isArray(progSlot)
					? progSlot.find((p) => p.altIndex === altIndex)
					: undefined;

				const effSeconds = effectiveDelay(altStep.delay);
				return {
					...altStep,
					icon: getStepIcon(altStep.type),
					index,
					altIndex,
					completed: !!entry,
					completedAt: entry?.submittedAt || 0,
					effectiveDelay: effSeconds,
					delayedUntil: effSeconds && prevCompletedAt ? prevCompletedAt + effSeconds * 1000 : 0
				};
			});
		} else {
			// progress[index] is QuestProgressEntry for regular steps
			const progSlot = props.progress?.[index];
			const entry = !Array.isArray(progSlot) ? progSlot : undefined;

			const effSeconds = effectiveDelay(step.delay);
			return {
				...step,
				icon: getStepIcon(step.type),
				index,
				completed: !!entry,
				completedAt: entry?.submittedAt || 0,
				effectiveDelay: effSeconds,
				delayedUntil: effSeconds && prevCompletedAt ? prevCompletedAt + effSeconds * 1000 : 0
			};
		}
	});
});

const currentIndex = computed(() => {
	if (!props.quest) return 0;

	return items.value.findIndex((item) => {
		if (Array.isArray(item)) {
			return !item.some((s) => s.completed);
		} else {
			return !item.completed;
		}
	});
});

// quest timeline tour

const { startTour } = useSiteTour();

const hasAltStepGroup = computed(() => (props.quest?.steps ?? []).some((s) => Array.isArray(s)));

const timelineTour = computed<SiteTourStep[]>(() => [
	{
		id: 'quest-button',
		title: 'Start This Quest',
		description:
			'Tap the button above to begin. Only one quest can be active at a time; starting a new one replaces your current active quest.',
		footer:
			"Heads up: Badge Mastery quests are one-shot. The button color tells you which state you're in.",
		icon: 'mdi:sword-cross',
		placement: 'bottom',
		highlightPadding: 6,
		condition: () => !isCurrentQuest.value && !completed.value,
		cta: {
			label: hasOtherActiveQuest.value ? 'Replace & Start' : 'Start Quest',
			icon: 'mdi:sword-cross',
			color: hasOtherActiveQuest.value ? 'warning' : 'success',
			advance: true,
			handler: () => (hasOtherActiveQuest.value ? handleReplaceClick() : handleStart(false))
		}
	},
	{
		id: 'quest-button',
		title: 'Quest in Progress',
		description:
			'This quest is currently active. Open any step below to submit progress, or tap End Quest above to step away.',
		footer:
			'Ending a Badge Mastery quest is permanent; for regular quests you can pick another up later.',
		icon: 'mdi:shield-sword',
		placement: 'bottom',
		highlightPadding: 6,
		condition: () => isCurrentQuest.value && !completed.value
	},
	{
		id: 'tile-0',
		title: 'Quest Steps',
		description:
			'Each badge below is a step. Tap one to see what it asks of you and submit your progress. The active step has a ring around it.',
		footer:
			'A step with multiple badges side-by-side is an "either/or": finish any one to advance.',
		icon: 'mdi:map-marker-path',
		highlightPadding: 8,
		waitFor: 'tile-0'
	},
	{
		id: 'tile-1:0',
		title: 'Either/Or Steps',
		description:
			'This quest includes step groups: rows with multiple badges. Complete just one to advance; the rest become optional bonuses you can come back for.',
		footer: 'Bonus alt-steps stay tappable even after the row finishes.',
		icon: 'mdi:vector-difference',
		condition: () => hasAltStepGroup.value
	},
	{
		id: 'tile-end',
		title: 'Reward & Completion',
		description:
			'The gold medal is the finish line. Complete every step to unlock the quest reward, points, a badge, or a feature unlock, and earn a permanent spot in your quest history.',
		footer: "You're all set. Tap Finish and start your quest!",
		icon: 'mdi:trophy-outline',
		waitFor: 'tile-end'
	}
]);
</script>
