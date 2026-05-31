<template>
	<div class="flex flex-col gap-3">
		<IonCard
			v-for="(q, i) in questions"
			:key="`q-${i}`"
			class="ion-no-margin"
		>
			<IonCardHeader>
				<div class="flex items-center justify-between">
					<IonCardSubtitle>Question {{ i + 1 }}</IonCardSubtitle>
					<IonButton
						fill="clear"
						color="danger"
						size="small"
						:disabled="disabled"
						@click="removeQuestion(i)"
					>
						<UIcon
							name="mdi:close"
							class="size-5"
						/>
					</IonButton>
				</div>
			</IonCardHeader>
			<IonCardContent>
				<IonInput
					v-model="q.question"
					placeholder="Type your question..."
					:minlength="5"
					:maxlength="256"
					:disabled="disabled"
					class="mb-3"
				/>

				<IonSegment
					:value="q.type"
					@ionChange="onTypeChange(i, $event)"
					:disabled="disabled"
					class="mb-3"
				>
					<IonSegmentButton value="true_false">
						<IonLabel>True / False</IonLabel>
					</IonSegmentButton>
					<IonSegmentButton value="multiple_choice">
						<IonLabel>Multiple Choice</IonLabel>
					</IonSegmentButton>
				</IonSegment>

				<div
					v-if="q.type === 'true_false'"
					class="mt-2"
				>
					<p class="text-xs text-muted mb-2">Correct answer:</p>
					<IonSegment
						:value="q.correct_answer"
						@ionChange="setTrueFalseAnswer(i, $event)"
						:disabled="disabled"
					>
						<IonSegmentButton value="True">
							<IonLabel>True</IonLabel>
						</IonSegmentButton>
						<IonSegmentButton value="False">
							<IonLabel>False</IonLabel>
						</IonSegmentButton>
					</IonSegment>
				</div>

				<div
					v-else-if="q.type === 'multiple_choice'"
					class="mt-2 flex flex-col gap-2"
				>
					<p class="text-xs text-muted">Tap the radio to mark the correct answer.</p>
					<div
						v-for="(_, j) in q.options"
						:key="`q${i}-opt${j}`"
						class="flex items-center gap-2"
					>
						<IonRadioGroup
							:value="getCorrectAnswerIndex(q) === j ? 'correct' : ''"
							@ionChange="setMCAnswer(i, j)"
							class="contents"
						>
							<IonRadio
								value="correct"
								:disabled="disabled || !q.options[j]"
							/>
						</IonRadioGroup>
						<IonInput
							v-model="q.options[j]"
							:placeholder="`Option ${j + 1}`"
							:minlength="1"
							:maxlength="64"
							:disabled="disabled"
							class="flex-1"
							@ionInput="onOptionInput(i, j)"
						/>
						<IonButton
							v-if="q.options.length > 2"
							fill="clear"
							color="danger"
							size="small"
							:disabled="disabled"
							@click="removeOption(i, j)"
						>
							<UIcon
								name="mdi:close"
								class="size-4"
							/>
						</IonButton>
					</div>
					<IonButton
						v-if="q.options.length < 6"
						fill="outline"
						size="small"
						color="secondary"
						:disabled="disabled"
						@click="addOption(i)"
					>
						<UIcon
							name="mdi:plus"
							class="size-4 mr-1"
						/>
						Add option
					</IonButton>
				</div>
			</IonCardContent>
		</IonCard>

		<IonButton
			expand="block"
			fill="outline"
			color="primary"
			:disabled="disabled || questions.length >= 10"
			@click="insertQuestion"
		>
			<UIcon
				name="mdi:plus"
				class="size-5 mr-2"
			/>
			Add Question ({{ questions.length }}/10)
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import type { ArticleQuizQuestionSubmission } from 'types/article';

defineProps<{ disabled?: boolean }>();

const questions = reactive<ArticleQuizQuestionSubmission[]>([]);

defineExpose({
	questions,
	getQuestions() {
		return questions.map(normalize);
	},
	setQuestions(newQuestions: ArticleQuizQuestionSubmission[]) {
		questions.splice(0, questions.length, ...newQuestions.map(normalize));
	}
});

function normalize(q: ArticleQuizQuestionSubmission): ArticleQuizQuestionSubmission {
	if (q.type === 'true_false') {
		return {
			type: 'true_false',
			question: q.question || '',
			options: ['True', 'False'],
			correct_answer: q.correct_answer === 'True' ? 'True' : 'False'
		};
	}
	const opts = (q.options || []).map((o) => o || '').slice(0, 6);
	while (opts.length < 2) opts.push('');
	const correct = opts.includes(q.correct_answer) ? q.correct_answer : '';
	return {
		type: 'multiple_choice',
		question: q.question || '',
		options: opts,
		correct_answer: correct
	};
}

function onTypeChange(i: number, ev: any) {
	const q = questions[i];
	if (!q) return;
	const next = ev?.detail?.value;
	if (next === 'true_false') {
		q.type = 'true_false';
		q.options = ['True', 'False'];
		q.correct_answer = q.correct_answer === 'True' ? 'True' : 'False';
	} else if (next === 'multiple_choice') {
		q.type = 'multiple_choice';
		const opts = (q.options || []).map((o) => o || '').slice(0, 6);
		while (opts.length < 2) opts.push('');
		q.options = opts;
		if (!opts.includes(q.correct_answer)) q.correct_answer = '';
	}
}

function setTrueFalseAnswer(i: number, ev: any) {
	const q = questions[i];
	if (!q || q.type !== 'true_false') return;
	const val = ev?.detail?.value;
	if (val === 'True' || val === 'False') q.correct_answer = val;
}

function getCorrectAnswerIndex(q: ArticleQuizQuestionSubmission): number {
	if (q.type !== 'multiple_choice') return -1;
	return q.options.findIndex((o) => o === q.correct_answer);
}

function setMCAnswer(i: number, j: number) {
	const q = questions[i];
	if (!q || q.type !== 'multiple_choice') return;
	const opt = q.options[j];
	if (opt === undefined || opt === '') return;
	q.correct_answer = opt;
}

function onOptionInput(i: number, j: number) {
	const q = questions[i];
	if (!q || q.type !== 'multiple_choice') return;
	const currentIdx = getCorrectAnswerIndex(q);
	if (currentIdx === j) q.correct_answer = q.options[j] || '';
}

function addOption(i: number) {
	const q = questions[i];
	if (!q || q.type !== 'multiple_choice') return;
	if (q.options.length >= 6) return;
	q.options.push('');
}

function removeOption(i: number, j: number) {
	const q = questions[i];
	if (!q || q.type !== 'multiple_choice') return;
	if (q.options.length <= 2) return;
	const removed = q.options[j];
	q.options.splice(j, 1);
	if (removed === q.correct_answer) q.correct_answer = '';
}

function insertQuestion() {
	questions.push({
		type: 'true_false',
		question: '',
		options: ['True', 'False'],
		correct_answer: 'True'
	});
}

function removeQuestion(i: number) {
	if (i < 0 || i >= questions.length) return;
	questions.splice(i, 1);
}
</script>
