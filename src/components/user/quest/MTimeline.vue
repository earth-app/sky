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
				@click="handleEnd"
				>End Quest</IonButton
			>

			<IonButton
				v-else-if="hasOtherActiveQuest"
				id="quest-button"
				color="warning"
				:loading="loading"
				:disabled="loading"
				class="self-center"
				@click="handleStart(true)"
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
				color="neutral"
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
						:class="
							altStep.delayedUntil > now
								? 'opacity-40 hover:cursor-not-allowed'
								: 'hover:cursor-pointer'
						"
						@click="
							altStep.delayedUntil <= now &&
							emit('select-step', {
								...altStep,
								isCurrentQuest,
								isCurrentStep: isCurrentStep(index)
							})
						"
						hydrate-on-visible
					/>
					<span
						v-if="altStep.reward"
						class="text-xs opacity-70"
						>+{{ altStep.reward }}</span
					>
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
						:class="
							item.delayedUntil > now
								? 'opacity-40 hover:cursor-not-allowed'
								: 'hover:cursor-pointer'
						"
						@click="
							item.delayedUntil <= now &&
							emit('select-step', {
								...item,
								isCurrentQuest,
								isCurrentStep: isCurrentStep(index)
							})
						"
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
import { Toast } from '@capacitor/toast';

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
			isCurrentStep: boolean;
			data?: string;
		}
	];
}>();

const { user } = useAuth();
const { quest, questHistory, fetchUserQuest, startQuest, endQuest } = useUser(user.value?.id || '');
const { getStepIcon } = useQuests();

const loading = ref(false);
const now = ref(Date.now());
let _nowTimer: ReturnType<typeof setInterval>;

onMounted(() => {
	_nowTimer = setInterval(() => {
		now.value = Date.now();
	}, 10_000);
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
	clearInterval(_nowTimer);
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

const hasOtherActiveQuest = computed(
	() => !!quest.value?.questId && quest.value.questId !== props.quest.id
);

async function handleStart(override: boolean = false) {
	loading.value = true;

	try {
		const res = await startQuest(props.quest.id, override);
		await Toast.show({
			text: res.message || 'Quest started!',
			duration: 'long'
		});
	} catch (e: any) {
		await Toast.show({
			text: `Failed to start quest: ${e?.message || 'Unknown error'}`,
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
}

async function handleEnd() {
	loading.value = true;
	try {
		const res = await endQuest();
		await Toast.show({
			text: res.message || 'Quest ended!',
			duration: 'long'
		});
	} catch (e: any) {
		await Toast.show({
			text: `Failed to end quest: ${e?.message || 'Unknown error'}`,
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
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

				return {
					...altStep,
					icon: getStepIcon(altStep.type),
					index,
					altIndex,
					completed: !!entry,
					completedAt: entry?.submittedAt || 0,
					delayedUntil:
						altStep.delay && prevCompletedAt ? prevCompletedAt + altStep.delay * 1000 : 0
				};
			});
		} else {
			// progress[index] is QuestProgressEntry for regular steps
			const progSlot = props.progress?.[index];
			const entry = !Array.isArray(progSlot) ? progSlot : undefined;

			return {
				...step,
				icon: getStepIcon(step.type),
				index,
				completed: !!entry,
				completedAt: entry?.submittedAt || 0,
				delayedUntil: step.delay && prevCompletedAt ? prevCompletedAt + step.delay * 1000 : 0
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

const timelineTour: SiteTourStep[] = [
	{
		id: 'quest-button',
		title: 'Quest Actions',
		description:
			'Welcome to the quest timeline! Here you can start or end quests and track your progress through each step.',
		footer:
			'Click "Next" to learn how to interact with the quest steps and view details about each one.'
	},
	{
		id: 'tile-0',
		title: 'Quest Steps',
		description:
			'Each icon represents a step in the quest. You can click on them to view more details, and they will show your progress as you complete them.',
		footer: 'Hover over steps with multiple options to see all possible actions!'
	},
	{
		id: 'tile-1:0',
		title: 'Step Details',
		description:
			'When you click on a step, you can see more details about what you need to do to complete it, any rewards you will earn, and when it will unlock if it is locked behind a delay.',
		footer: 'Complete steps to earn points and progress through the quest.'
	},
	{
		id: 'tile-end',
		title: 'Quest Completion',
		description:
			'Once you complete all the steps, you will earn the quest reward and can show off your achievement on your profile!',
		footer: 'Great job on making it to the end of the quest timeline tour!'
	}
];
</script>
