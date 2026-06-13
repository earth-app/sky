<template>
	<div class="flex flex-col items-center w-full gap-4 py-2">
		<div
			v-if="quiz && quiz.length > 0"
			class="flex flex-col items-center w-full max-w-xl px-4"
		>
			<!-- progress + score header -->
			<div class="w-full mb-5">
				<div class="flex items-center justify-between mb-1.5">
					<span class="text-xs! font-medium opacity-60"
						>Question {{ index + 1 }} of {{ quiz.length }}</span
					>
					<span
						v-if="score"
						class="text-xs! font-semibold text-primary"
						>{{ score.scorePercent }}% ({{ score.score }}/{{ score.total }})</span
					>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
					<div
						class="h-full rounded-full bg-primary transition-all duration-300"
						:style="{ width: ((index + 1) / quiz.length) * 100 + '%' }"
					/>
				</div>
			</div>

			<div class="flex flex-col items-center w-full">
				<Transition
					name="fade"
					mode="out-in"
				>
					<div
						:key="index"
						class="flex flex-col items-center w-full"
						v-if="currentQuestion"
					>
						<h2 class="text-lg! font-semibold! mb-4 self-start">
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

						<!-- single-pick (multiple_choice + true_false) -->
						<IonRadioGroup
							v-if="
								currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'true_false'
							"
							class="w-full"
							allow-empty-selection
							:value="singlePickAnswers[index] ?? null"
							@ion-change="handleSinglePick(index, $event)"
						>
							<IonItem
								v-for="option in currentSingleOptions"
								:key="option.value"
								class="p-0! my-2"
							>
								<IonRadio
									:value="option.value"
									:disabled="!!score"
									class="mr-2"
									>{{ option.label }}</IonRadio
								>
							</IonItem>
						</IonRadioGroup>

						<!-- multi_select -->
						<div
							v-else-if="currentQuestion.type === 'multi_select'"
							class="flex flex-col gap-2 w-full px-2"
						>
							<p class="text-xs! text-gray-500 m-0!">Select every option that applies.</p>
							<IonItem
								v-for="(option, i) in currentQuestion.options"
								:key="`ms-${index}-${i}`"
								class="p-0! my-1"
							>
								<IonCheckbox
									slot="start"
									:checked="multiSelectAnswers[index]?.includes(i) ?? false"
									:disabled="!!score"
									@ionChange="(ev) => handleMultiSelect(index, i, !!ev.detail.checked)"
								/>
								<IonLabel class="ml-2!">{{ option }}</IonLabel>
							</IonItem>
						</div>

						<!-- order: untimed Orderer -->
						<div
							v-else-if="currentQuestion.type === 'order'"
							class="flex flex-col gap-2 w-full px-2"
						>
							<UserQuestStepOrderer
								:items="(currentQuestion as any).items"
								untimed
								:disabled="!!score"
								:submit="false"
								@update:order="(order: string[]) => handleOrderUpdate(index, order)"
							/>
						</div>

						<!-- post-score breakdown -->
						<div
							v-if="score && currentResult"
							class="flex flex-col justify-center space-y-2 w-full self-start min-h-55 mt-3 px-2"
						>
							<USeparator />

							<template v-if="currentQuestion.type === 'multi_select'">
								<div
									v-for="(option, i) in currentQuestion.options"
									:key="`msr-${i}`"
									class="flex items-center justify-between p-2 rounded-md"
									:class="multiSelectResultClass(i, currentResult)"
								>
									<span>#{{ i + 1 }}. {{ option }}</span>
									<UIcon
										v-if="
											Array.isArray(currentResult.correct_answer_indices) &&
											currentResult.correct_answer_indices.includes(i)
										"
										name="mdi:check-circle"
										class="text-green-500"
									/>
									<UIcon
										v-else-if="
											Array.isArray(currentResult.user_answer_indices) &&
											currentResult.user_answer_indices.includes(i)
										"
										name="mdi:close-circle"
										class="text-red-500"
									/>
								</div>
							</template>

							<template v-else-if="currentQuestion.type === 'order'">
								<p class="text-xs! text-gray-500 m-0!">Correct order:</p>
								<ol class="flex flex-col gap-1">
									<li
										v-for="(item, i) in currentResult.correct_order || []"
										:key="`co-${i}`"
										class="flex items-center gap-2 rounded-md border border-gray-700/40 px-3 py-2"
										:class="
											currentResult.user_order && currentResult.user_order[i] === item
												? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
												: ''
										"
									>
										<span class="text-xs text-gray-500 w-5 text-right tabular-nums"
											>{{ i + 1 }}.</span
										>
										<span>{{ item }}</span>
									</li>
								</ol>
							</template>

							<template v-else>
								<div
									v-for="(option, i) in currentSingleOptions"
									:key="i"
									class="flex items-center justify-between p-2 rounded-md"
									:class="{
										'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400':
											i === currentResult?.correct_answer_index,
										'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400':
											i === singlePickAnswers[index] &&
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
										v-else-if="i === singlePickAnswers[index] && !currentResult?.correct"
										name="mdi:close-circle"
										class="text-red-500"
									/>
								</div>
							</template>
						</div>
					</div>
				</Transition>

				<div class="flex w-full justify-center gap-3 mt-6">
					<IonButton
						color="primary"
						size="small"
						fill="outline"
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
						Next
						<UIcon
							name="mdi:arrow-right"
							class="size-5"
						/>
					</IonButton>

					<IonButton
						v-if="!score && quizCompleted"
						color="secondary"
						size="small"
						@click="handleSubmit"
						:disabled="submitting"
						:loading="submitting"
					>
						Submit
						<UIcon
							name="mdi:check"
							class="size-5"
						/>
					</IonButton>
				</div>
			</div>
		</div>
		<div
			v-else-if="quiz === undefined || retrying"
			class="flex items-center justify-center py-8"
		>
			<Loading />
		</div>
		<MInlineError
			v-else
			title="Quiz unavailable"
			description="We couldn't load this quiz. It may be a connection hiccup; try again."
			severity="warning"
			icon="mdi:cloud-alert-outline"
			class="my-8"
			@retry="retryQuiz"
		/>
	</div>
</template>

<script setup lang="ts">
import type { ArticleQuizAnswer, ArticleQuizQuestionSubmission } from 'types/article';

const props = defineProps<{
	article: Article;
}>();

const { quiz, fetchQuiz, quizSummary, score, fetchQuizScore, submitQuiz } = useArticle(
	props.article.id,
	makeMServerRequest
);

const articleStore = useArticleStore();
const reloadAttempts = ref(0);
const retrying = ref(false);
const MAX_AUTO_RELOADS = 3;

async function loadQuiz(force = false) {
	if (force) {
		articleStore.quizCache.delete(props.article.id);
		articleStore.quizSummaryCache.delete(props.article.id);
	}
	await fetchQuiz();
}

async function ensureQuizLoaded() {
	await loadQuiz();
	while (
		Array.isArray(quiz.value) &&
		quiz.value.length === 0 &&
		reloadAttempts.value < MAX_AUTO_RELOADS
	) {
		retrying.value = true;
		reloadAttempts.value++;
		await new Promise((r) => setTimeout(r, 500 * 2 ** (reloadAttempts.value - 1))); // 0.5s, 1s, 2s
		await loadQuiz(true);
	}
	retrying.value = false;
}

function retryQuiz() {
	reloadAttempts.value = 0;
	void ensureQuizLoaded();
}

onMounted(() => {
	void ensureQuizLoaded();
	void fetchQuizScore();
});

const index = ref(0);
const currentQuestion = computed<ArticleQuizQuestionSubmission | null>(() => {
	if (!quiz.value || quiz.value.length === 0) return null;
	return (quiz.value[index.value] as ArticleQuizQuestionSubmission) || null;
});

function singleOptionLabels(q: ArticleQuizQuestionSubmission): string[] {
	const opts = (q as any).options as string[] | undefined;
	if (q.type === 'true_false' && (!opts || opts.length === 0)) return ['True', 'False'];
	return opts || [];
}

const currentSingleOptions = computed(() => {
	const q = currentQuestion.value;
	if (!q) return [] as { label: string; value: number }[];
	return singleOptionLabels(q).map((label, i) => ({ label, value: i }));
});

// parallel per-question answer state
const singlePickAnswers = ref<(number | null)[]>([]);
const multiSelectAnswers = ref<(number[] | undefined)[]>([]);
const orderAnswers = ref<(string[] | undefined)[]>([]);

watch(
	quiz,
	(q) => {
		const len = q?.length ?? 0;
		singlePickAnswers.value = Array(len).fill(null);
		multiSelectAnswers.value = Array(len).fill(undefined);
		orderAnswers.value = Array(len).fill(undefined);
	},
	{ immediate: true }
);

function handleSinglePick(questionIndex: number, event: Event) {
	const value = (event as CustomEvent<{ value?: number | string | null }>).detail?.value;
	if (value === null || value === undefined || value === '') {
		singlePickAnswers.value[questionIndex] = null;
		return;
	}
	const n = Number(value);
	singlePickAnswers.value[questionIndex] = Number.isFinite(n) ? n : null;
}

function handleMultiSelect(questionIndex: number, optionIndex: number, checked: boolean) {
	const set = new Set<number>(multiSelectAnswers.value[questionIndex] ?? []);
	if (checked) set.add(optionIndex);
	else set.delete(optionIndex);
	multiSelectAnswers.value[questionIndex] = [...set].sort((a, b) => a - b);
}

function handleOrderUpdate(questionIndex: number, order: string[]) {
	orderAnswers.value[questionIndex] = order;
}

const submitting = ref(false);
const handleSubmit = async () => {
	if (!quizCompleted.value || !quiz.value) return;

	submitting.value = true;
	try {
		const payload: ArticleQuizAnswer[] = quiz.value.map((q, i) => {
			const question = q.question;
			if (q.type === 'multi_select') {
				const indices = multiSelectAnswers.value[i] ?? [];
				const opts = (q as any).options as string[];
				return {
					question,
					indices,
					texts: indices.map((idx) => opts[idx] ?? '')
				};
			}
			if (q.type === 'order') {
				return { question, ordered: orderAnswers.value[i] ?? [] };
			}
			const pick = singlePickAnswers.value[i];
			const labels = singleOptionLabels(q as ArticleQuizQuestionSubmission);
			return {
				question,
				index: pick ?? undefined,
				text: pick !== null && pick !== undefined ? (labels[pick] ?? '') : ''
			};
		});

		await submitQuiz(payload);
	} finally {
		submitting.value = false;
	}
};

const quizCompleted = computed(() => {
	if (!quiz.value || !quizSummary.value) return false;
	if (quiz.value.length === 0) return false;
	return quiz.value.every((q, i) => {
		if (q.type === 'multi_select') {
			return (multiSelectAnswers.value[i]?.length ?? 0) >= 1;
		}
		if (q.type === 'order') {
			const items = ((q as any).items as string[]) || [];
			return (orderAnswers.value[i]?.length ?? 0) === items.length;
		}
		return typeof singlePickAnswers.value[i] === 'number';
	});
});

const currentResult = computed(() => {
	if (!score.value || !currentQuestion.value) return null;
	if (!score.value.results) return null;
	return score.value.results[index.value] || null;
});

function multiSelectResultClass(i: number, result: any): Record<string, boolean> {
	const correctIdx = Array.isArray(result?.correct_answer_indices)
		? result.correct_answer_indices
		: [];
	const userIdx = Array.isArray(result?.user_answer_indices) ? result.user_answer_indices : [];
	const isCorrect = correctIdx.includes(i);
	const isUserPicked = userIdx.includes(i);
	return {
		'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400':
			isCorrect && isUserPicked,
		'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400':
			isCorrect && !isUserPicked,
		'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400': !isCorrect && isUserPicked
	};
}
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
