import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// 2-question quiz: multiple_choice (Paris) + true_false (True)
const QUIZ_DEFINITION = {
	questions: [
		{
			type: 'multiple_choice',
			question: 'What is the capital of France?',
			options: ['Paris', 'London', 'Rome'],
			correct_answer: 'Paris',
			correct_answer_index: 0
		},
		{
			type: 'true_false',
			question: 'Water is made of hydrogen and oxygen.',
			options: ['True', 'False'],
			correct_answer: 'True',
			correct_answer_index: 0,
			is_true: true,
			is_false: false
		}
	],
	summary: {
		total: 2,
		multiple_choice_count: 1,
		multi_select_count: 0,
		true_false_count: 1,
		order_count: 0
	}
};

const SCORE_RESULT = {
	score: 2,
	scorePercent: 100,
	total: 2,
	results: [
		{
			question: 'What is the capital of France?',
			type: 'multiple_choice',
			correct_answer: 'Paris',
			correct_answer_index: 0,
			user_answer: 'Paris',
			user_answer_index: 0,
			correct: true
		},
		{
			question: 'Water is made of hydrogen and oxygen.',
			type: 'true_false',
			correct_answer: 'True',
			correct_answer_index: 0,
			user_answer: 'True',
			user_answer_index: 0,
			correct: true
		}
	]
};

test.describe('Article quiz flow', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('answers every question and submits for a full score', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock article art-1 + mock quiz override');
		await asUser();
		await mockApi.setMany([
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/v2\/articles\/art-1\/quiz$/,
				body: QUIZ_DEFINITION,
				once: false
			},
			{
				backend: 'mantle',
				method: 'POST',
				path: /^\/api\/article\/quiz$/,
				body: SCORE_RESULT,
				once: false
			}
		]);
		await gotoHydrated('/tabs/articles/art-1/quiz');

		// question 1 renders with the progress header
		await expect(page.getByText(/question 1 of 2/i)).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/capital of France/i)).toBeVisible();

		// pick "Paris"
		await page.locator('ion-radio', { hasText: 'Paris' }).click();

		// advance to question 2 (scope to the quiz nav; the ionic header has a back button too)
		const quizNav = page.locator('#quiz-nav');
		await quizNav.getByRole('button', { name: /^next$/i }).click();
		await expect(page.getByText(/question 2 of 2/i)).toBeVisible();
		await expect(page.getByText(/hydrogen and oxygen/i)).toBeVisible();

		// pick "True"
		await page.locator('ion-radio', { hasText: 'True' }).click();

		// Submit appears once every question is answered
		const submit = quizNav.getByRole('button', { name: /^submit$/i });
		await expect(submit).toBeVisible({ timeout: 8000 });
		await submit.click();

		// score header flips to 100% (2/2)
		await expect(page.getByText(/100%/).first()).toBeVisible({ timeout: 8000 });
		await expect(page.getByText(/\(2\/2\)/).first()).toBeVisible();
	});

	test('renders questions and Next navigation even without submitting', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock article art-1 + mock quiz override');
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/articles\/art-1\/quiz$/,
			body: QUIZ_DEFINITION,
			once: false
		});
		await gotoHydrated('/tabs/articles/art-1/quiz');

		await expect(page.getByText(/question 1 of 2/i)).toBeVisible({ timeout: 12_000 });
		// Back is disabled on the first question (scope to quiz nav; header has a back button)
		const quizNav = page.locator('#quiz-nav');
		await expect(quizNav.getByRole('button', { name: /^back$/i })).toBeDisabled();

		await quizNav.getByRole('button', { name: /^next$/i }).click();
		await expect(page.getByText(/question 2 of 2/i)).toBeVisible();
		// Next is disabled on the last question
		await expect(quizNav.getByRole('button', { name: /^next$/i })).toBeDisabled();
	});
});
