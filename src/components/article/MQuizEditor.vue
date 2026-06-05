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
						:aria-label="`Remove question ${i + 1}`"
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
					scrollable
				>
					<IonSegmentButton value="true_false">
						<IonLabel>T / F</IonLabel>
					</IonSegmentButton>
					<IonSegmentButton value="multiple_choice">
						<IonLabel>Choice</IonLabel>
					</IonSegmentButton>
					<IonSegmentButton value="multi_select">
						<IonLabel>Multi</IonLabel>
					</IonSegmentButton>
					<IonSegmentButton value="order">
						<IonLabel>Order</IonLabel>
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
							aria-label="Remove option"
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

				<div
					v-else-if="q.type === 'multi_select'"
					class="mt-2 flex flex-col gap-2"
				>
					<p class="text-xs! text-muted m-0!">
						Tap the box on every option that's correct. The reader earns 1 point only if their picks
						match this set exactly.
					</p>
					<div
						v-for="(_, j) in q.options"
						:key="`q${i}-mopt${j}`"
						class="flex items-center gap-2"
					>
						<IonCheckbox
							:checked="isMultiSelectCorrect(q, j)"
							:disabled="disabled || !q.options[j]"
							@ionChange="toggleMultiSelectAnswer(i, j)"
							aria-label="Mark correct"
						/>
						<IonInput
							v-model="q.options[j]"
							:placeholder="`Option ${j + 1}`"
							:minlength="1"
							:maxlength="64"
							:disabled="disabled"
							class="flex-1"
							@ionInput="onMultiSelectOptionInput(i)"
						/>
						<IonButton
							v-if="q.options.length > 3"
							fill="clear"
							color="danger"
							size="small"
							:disabled="disabled"
							aria-label="Remove option"
							@click="removeMultiSelectOption(i, j)"
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

				<div
					v-else-if="q.type === 'order'"
					class="mt-2 flex flex-col gap-2"
				>
					<p class="text-xs! text-muted m-0!">
						List items in their correct order. The reader sees them shuffled and earns 1 point only
						if they reproduce this exact sequence.
					</p>
					<div
						v-for="(_, j) in q.items"
						:key="`q${i}-item${j}`"
						class="flex items-center gap-2"
					>
						<span class="text-xs! text-muted w-5 text-right tabular-nums">{{ j + 1 }}.</span>
						<IonInput
							v-model="q.items[j]"
							:placeholder="`Item ${j + 1}`"
							:minlength="1"
							:maxlength="64"
							:disabled="disabled"
							class="flex-1"
						/>
						<IonButton
							fill="clear"
							size="small"
							color="medium"
							:disabled="disabled || j === 0"
							aria-label="Move up"
							@click="moveOrderItem(i, j, -1)"
						>
							<UIcon
								name="mdi:arrow-up"
								class="size-4"
							/>
						</IonButton>
						<IonButton
							fill="clear"
							size="small"
							color="medium"
							:disabled="disabled || j === q.items.length - 1"
							aria-label="Move down"
							@click="moveOrderItem(i, j, 1)"
						>
							<UIcon
								name="mdi:arrow-down"
								class="size-4"
							/>
						</IonButton>
						<IonButton
							v-if="q.items.length > 3"
							fill="clear"
							color="danger"
							size="small"
							:disabled="disabled"
							aria-label="Remove item"
							@click="removeOrderItem(i, j)"
						>
							<UIcon
								name="mdi:close"
								class="size-4"
							/>
						</IonButton>
					</div>
					<IonButton
						v-if="q.items.length < 6"
						fill="outline"
						size="small"
						color="secondary"
						:disabled="disabled"
						@click="addOrderItem(i)"
					>
						<UIcon
							name="mdi:plus"
							class="size-4 mr-1"
						/>
						Add item
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
			correct_answer: (q as any).correct_answer === 'True' ? 'True' : 'False'
		};
	}

	if (q.type === 'multi_select') {
		const opts = ((q as any).options || []).map((o: string) => o || '').slice(0, 6);
		while (opts.length < 3) opts.push('');
		const incoming: string[] = Array.isArray((q as any).correct_answers)
			? (q as any).correct_answers
			: [];
		const correct = incoming.filter((a) => opts.includes(a));
		return {
			type: 'multi_select',
			question: q.question || '',
			options: opts,
			correct_answers: correct
		} as ArticleQuizQuestionSubmission;
	}

	if (q.type === 'order') {
		const items = ((q as any).items || []).map((s: string) => s || '').slice(0, 6);
		while (items.length < 3) items.push('');
		return {
			type: 'order',
			question: q.question || '',
			items
		} as ArticleQuizQuestionSubmission;
	}

	const opts = ((q as any).options || []).map((o: string) => o || '').slice(0, 6);
	while (opts.length < 2) opts.push('');
	const correct = opts.includes((q as any).correct_answer) ? (q as any).correct_answer : '';
	return {
		type: 'multiple_choice',
		question: q.question || '',
		options: opts,
		correct_answer: correct
	};
}

function onTypeChange(i: number, ev: any) {
	const q = questions[i] as any;
	if (!q) return;
	const next = ev?.detail?.value;
	if (next === 'true_false') {
		q.type = 'true_false';
		q.options = ['True', 'False'];
		q.correct_answer = q.correct_answer === 'True' ? 'True' : 'False';
		delete q.correct_answers;
		delete q.items;
	} else if (next === 'multiple_choice') {
		q.type = 'multiple_choice';
		const opts = (q.options || []).map((o: string) => o || '').slice(0, 6);
		while (opts.length < 2) opts.push('');
		q.options = opts;
		if (!opts.includes(q.correct_answer)) q.correct_answer = '';
		delete q.correct_answers;
		delete q.items;
	} else if (next === 'multi_select') {
		q.type = 'multi_select';
		const opts = (q.options || []).map((o: string) => o || '').slice(0, 6);
		while (opts.length < 3) opts.push('');
		q.options = opts;
		q.correct_answers = Array.isArray(q.correct_answers)
			? q.correct_answers.filter((a: string) => opts.includes(a))
			: [];
		delete q.correct_answer;
		delete q.items;
	} else if (next === 'order') {
		q.type = 'order';
		const items = Array.isArray(q.items) ? q.items.map((s: string) => s || '').slice(0, 6) : [];
		while (items.length < 3) items.push('');
		q.items = items;
		delete q.options;
		delete q.correct_answer;
		delete q.correct_answers;
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
	const q = questions[i] as any;
	if (!q || (q.type !== 'multiple_choice' && q.type !== 'multi_select')) return;
	if (q.options.length >= 6) return;
	q.options.push('');
}

function removeOption(i: number, j: number) {
	const q = questions[i] as any;
	if (!q || q.type !== 'multiple_choice') return;
	if (q.options.length <= 2) return;
	const removed = q.options[j];
	q.options.splice(j, 1);
	if (removed === q.correct_answer) q.correct_answer = '';
}

// multi_select helpers
function isMultiSelectCorrect(q: any, j: number): boolean {
	if (q?.type !== 'multi_select') return false;
	const opt = q.options?.[j];
	return Boolean(opt) && Array.isArray(q.correct_answers) && q.correct_answers.includes(opt);
}

function toggleMultiSelectAnswer(i: number, j: number) {
	const q = questions[i] as any;
	if (!q || q.type !== 'multi_select') return;
	const opt = q.options?.[j];
	if (!opt) return;
	const set = new Set<string>(Array.isArray(q.correct_answers) ? q.correct_answers : []);
	if (set.has(opt)) set.delete(opt);
	else set.add(opt);
	q.correct_answers = q.options.filter((o: string) => set.has(o));
}

function onMultiSelectOptionInput(i: number) {
	const q = questions[i] as any;
	if (!q || q.type !== 'multi_select') return;
	if (Array.isArray(q.correct_answers)) {
		q.correct_answers = q.correct_answers.filter((a: string) => q.options.includes(a));
	}
}

function removeMultiSelectOption(i: number, j: number) {
	const q = questions[i] as any;
	if (!q || q.type !== 'multi_select') return;
	if (q.options.length <= 3) return;
	const removed = q.options[j];
	q.options.splice(j, 1);
	if (Array.isArray(q.correct_answers)) {
		q.correct_answers = q.correct_answers.filter((a: string) => a !== removed);
	}
}

// order helpers
function addOrderItem(i: number) {
	const q = questions[i] as any;
	if (!q || q.type !== 'order') return;
	if (q.items.length >= 6) return;
	q.items.push('');
}

function removeOrderItem(i: number, j: number) {
	const q = questions[i] as any;
	if (!q || q.type !== 'order') return;
	if (q.items.length <= 3) return;
	q.items.splice(j, 1);
}

function moveOrderItem(i: number, j: number, dir: -1 | 1) {
	const q = questions[i] as any;
	if (!q || q.type !== 'order') return;
	const target = j + dir;
	if (target < 0 || target >= q.items.length) return;
	const tmp = q.items[j];
	q.items[j] = q.items[target];
	q.items[target] = tmp;
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
