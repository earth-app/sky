<template>
	<IonCard
		class="m-0 p-4 rounded-xl bg-linear-to-br from-primary/10 via-secondary/5 to-transparent"
	>
		<div class="flex items-center gap-2 mb-2">
			<UIcon
				name="mdi:lightbulb-on-outline"
				class="size-5 text-primary"
			/>
			<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Trivia</h3>
		</div>
		<p class="text-base font-medium mb-3">{{ q.question }}</p>
		<div class="flex flex-col gap-2">
			<IonButton
				v-for="(option, i) in q.options"
				:key="`m-opt-${i}`"
				:color="optionColor(i)"
				:fill="optionFill(i)"
				:disabled="answered"
				expand="block"
				class="justify-start"
				@click="select(i)"
			>
				<span class="font-mono mr-2 text-xs opacity-70">{{ letters[i] }}</span>
				{{ option }}
			</IonButton>
		</div>
		<p
			v-if="answered"
			class="text-xs mt-3"
			:class="isCorrect ? 'text-success' : 'text-gray-500'"
		>
			<template v-if="isCorrect">Nice. {{ q.explanation }}</template>
			<template v-else
				>The answer was <strong>{{ q.options[q.answer] }}</strong
				>. {{ q.explanation }}</template
			>
		</p>
		<div class="flex justify-between items-center mt-3">
			<span class="text-xs text-gray-500">{{ index + 1 }} / {{ questions.length }}</span>
			<IonButton
				v-if="answered"
				size="small"
				fill="clear"
				@click="next"
			>
				<UIcon
					name="mdi:refresh"
					class="size-4 mr-1"
				/>
				Next
			</IonButton>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { IonButton, IonCard } from '@ionic/vue';
import { useAppHaptics } from '~/composables/useHaptics';

interface QuizQuestion {
	question: string;
	options: string[];
	answer: number;
	explanation: string;
}

const props = withDefaults(
	defineProps<{
		questions?: QuizQuestion[];
	}>(),
	{
		questions: () => [
			{
				question: 'Roughly what percent of the planet is covered by ocean?',
				options: ['51%', '71%', '83%'],
				answer: 1,
				explanation: 'about 71%, most of earth is water.'
			},
			{
				question: 'Which gas plants release during photosynthesis?',
				options: ['Carbon dioxide', 'Nitrogen', 'Oxygen'],
				answer: 2,
				explanation: 'they take in CO2 and release O2.'
			},
			{
				question: 'The Amazon rainforest is mostly in which country?',
				options: ['Peru', 'Brazil', 'Colombia'],
				answer: 1,
				explanation: 'about 60% of the Amazon sits in Brazil.'
			}
		]
	}
);

const emit = defineEmits<{
	(event: 'correct', index: number): void;
	(event: 'complete'): void;
}>();

const letters = ['A', 'B', 'C', 'D'];
const index = ref(0);
const selected = ref<number | null>(null);
const { selection, notifySuccess, notifyWarning } = useAppHaptics();

const q = computed(() => props.questions[index.value]!);
const answered = computed(() => selected.value !== null);
const isCorrect = computed(() => selected.value === q.value.answer);

function optionColor(i: number): 'success' | 'danger' | 'medium' {
	if (!answered.value) return 'medium';
	if (i === q.value.answer) return 'success';
	if (i === selected.value) return 'danger';
	return 'medium';
}

function optionFill(i: number): 'solid' | 'outline' | 'clear' {
	if (!answered.value) return 'outline';
	if (i === q.value.answer || i === selected.value) return 'solid';
	return 'clear';
}

function select(i: number) {
	if (answered.value) return;
	selected.value = i;
	selection();
	if (i === q.value.answer) {
		notifySuccess();
		emit('correct', index.value);
	} else {
		notifyWarning();
	}
}

function next() {
	selection();
	if (index.value + 1 >= props.questions.length) {
		emit('complete');
		index.value = 0;
	} else {
		index.value++;
	}
	selected.value = null;
}
</script>
