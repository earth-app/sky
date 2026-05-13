<template>
	<div class="flex flex-col gap-4 items-center justify-center w-full min-h-50">
		<h3
			v-if="score"
			class="text-base font-semibold"
		>
			{{ score.scorePercent }}% ({{ score.score }} / {{ score.total }})
		</h3>
		<div
			v-if="quiz && quiz.length > 0"
			class="flex flex-col items-center justify-between w-full"
		>
			<div class="flex flex-col items-center justify-between w-full">
				<Transition
					name="fade"
					mode="out-in"
				>
					<div
						:key="index"
						class="flex flex-col items-center w-full"
						v-if="currentQuestion"
					>
						<h2 class="text-lg! font-semibold! mb-4 self-start px-4">
							{{ index + 1 }}. {{ currentQuestion.question }}
						</h2>

						<div
							v-if="currentResult"
							class="flex items-center mb-2 self-start"
						>
							<UIcon
								:name="currentResult.correct ? 'mdi:check' : 'mdi:close'"
								class="mr-2"
								:class="currentResult.correct ? 'text-green-500' : 'text-red-500'"
							/>
							<span>{{ currentResult.correct ? 'Correct' : 'Incorrect' }}</span>
						</div>

						<IonRadioGroup
							class="w-full"
							allow-empty-selection
							:value="userAnswers[index] ?? null"
							@ion-change="handleAnswerChange(index, $event)"
						>
							<IonItem
								v-for="option in currentOptions"
								:key="option.value"
								class="p-0 my-2"
							>
								<IonRadio
									:value="option.value"
									:disabled="!!score"
									class="mr-2"
									>{{ option.label }}</IonRadio
								>
							</IonItem>
						</IonRadioGroup>

						<div
							v-if="score"
							class="flex flex-col justify-center space-y-2 w-full self-start min-h-55"
						>
							<USeparator />
							<div
								v-for="(option, i) in currentOptions"
								:key="i"
								class="flex items-center justify-between p-2 rounded"
								:class="{
									'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400':
										i === currentResult?.correct_answer_index,
									'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400':
										i === userAnswers[index] &&
										!currentResult?.correct &&
										i !== currentResult?.correct_answer_index
								}"
							>
								<span>#{{ i + 1 }}. {{ option.label }}</span>
								<UIcon
									v-if="i === currentResult?.correct_answer_index"
									name="mdi:check-circle"
									class="text-green-500"
								/>
								<UIcon
									v-else-if="i === userAnswers[index] && !currentResult?.correct"
									name="mdi:close-circle"
									class="text-red-500"
								/>
							</div>
						</div>
					</div>
				</Transition>

				<div class="flex gap-4">
					<IonButton
						color="primary"
						size="small"
						@click="index--"
						:disabled="index === 0"
					>
						<UIcon
							name="mdi:arrow-left"
							class="size-5"
						/>
						Back
					</IonButton>

					<IonButton
						color="primary"
						size="small"
						@click="index++"
						:disabled="index === quiz.length - 1"
					>
						<UIcon
							name="mdi:arrow-right"
							class="size-5"
						/>
						Next
					</IonButton>

					<IonButton
						v-if="!score && quizCompleted"
						color="secondary"
						size="small"
						@click="handleSubmit"
						:disabled="!quizCompleted || submitting"
						:loading="submitting"
					>
						Submit
						<UIcon
							name="mdi:arrow-right"
							class="size-5"
						/>
					</IonButton>

					<div
						v-else-if="index === quiz.length - 1 && !quizCompleted"
						class="w-16"
					/>
				</div>
			</div>
			<div class="my-4 w-full bg-black/80">
				<div
					class="h-4 bg-blue-600 transition-all duration-300"
					:style="{
						width: ((index + 1) / quiz.length) * 100 + '%',
						borderTopRightRadius: index + 1 === quiz.length ? '0' : '0.5rem',
						borderBottomRightRadius: index + 1 === quiz.length ? '0' : '0.5rem'
					}"
				/>
			</div>
		</div>
		<div
			v-else-if="quiz === null"
			class="text-center text-gray-500 py-8"
		>
			<p>No quiz available for this article.</p>
		</div>
		<div
			v-else
			class="flex items-center justify-center py-8"
		>
			<Loading />
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	article: Article;
}>();

const { quiz, fetchQuiz, quizSummary, score, fetchQuizScore } = useArticle(props.article.id);

onMounted(() => {
	fetchQuiz();
	fetchQuizScore();
});

const index = ref(0);
const currentQuestion = computed(() => {
	if (!quiz.value || quiz.value.length === 0) return null;
	return quiz.value[index.value] || null;
});

const getQuestionOptions = (question: ArticleQuizQuestion) => {
	if (question.options.length === 0 && question.type === 'true_false') {
		return [
			{ label: 'True', value: 0 },
			{ label: 'False', value: 1 }
		];
	}

	return question.options.map((option, optionIndex) => ({
		label: option,
		value: optionIndex
	}));
};

const currentOptions = computed(() => {
	if (!currentQuestion.value) return [];

	return getQuestionOptions(currentQuestion.value);
});

const handleAnswerChange = (questionIndex: number, event: Event) => {
	const value = (event as CustomEvent<{ value?: number | string | null }>).detail?.value;

	if (value === null || value === undefined || value === '') {
		userAnswers.value[questionIndex] = null;
		return;
	}

	const normalizedValue = Number(value);
	userAnswers.value[questionIndex] = Number.isFinite(normalizedValue) ? normalizedValue : null;
};

const submitting = ref(false);
const handleSubmit = async () => {
	if (!quizCompleted.value || !quiz.value) return;

	submitting.value = true;
	try {
		await submitMArticleQuiz(
			props.article,
			quiz.value,
			userAnswers.value.map((answer) => {
				if (typeof answer !== 'number' || Number.isNaN(answer)) {
					throw new Error('Cannot submit an incomplete quiz.');
				}

				return answer;
			})
		);
	} finally {
		submitting.value = false;
	}
};

const userAnswers = ref<(number | null)[]>([]);
const quizCompleted = computed(() => {
	return (
		Array.isArray(quiz.value) &&
		quiz.value.length > 0 &&
		!!quizSummary.value &&
		quiz.value.every((question, questionIndex) => {
			const answer = userAnswers.value[questionIndex];
			const options = getQuestionOptions(question);

			return (
				typeof answer === 'number' &&
				Number.isInteger(answer) &&
				answer >= 0 &&
				answer < options.length
			);
		})
	);
});

const currentResult = computed(() => {
	if (!score.value || !currentQuestion.value) return null;

	return score.value.results[index.value] || null;
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
