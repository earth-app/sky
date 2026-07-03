import { expect, skipIfIntegration, test } from './utils/fixtures';

// mantle quiz-definition shape the article store expects: { questions, summary }
const QUIZ_DEFINITION = {
	questions: [
		{
			type: 'multiple_choice',
			question: 'What is the capital of France?',
			options: ['Paris', 'London', 'Rome'],
			correct_answer: 'Paris',
			correct_answer_index: 0
		}
	],
	summary: {
		total: 1,
		multiple_choice_count: 1,
		multi_select_count: 0,
		true_false_count: 0,
		order_count: 0
	}
};

test.describe('Article detail page', () => {
	test('renders the title, body and author for art-1', async ({ page, asUser, gotoHydrated }) => {
		skipIfIntegration('depends on mock article art-1');
		await asUser();
		await gotoHydrated('/tabs/articles/art-1');

		await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});
		// author rendered as "@writer" (mock seeds art-1 authored by writer-1/writer)
		await expect(page.getByText('@writer').first()).toBeVisible();
		// body is split into <p> paragraphs; the mock content mentions "test article"
		await expect(page.getByText(/test article/i).first()).toBeVisible();
	});

	test('shows the Take Quiz CTA when the article has a quiz', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock article art-1 + mock override');
		await asUser();
		// article store loads the quiz from mantle on mount; seed it so the CTA renders
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/articles\/art-1\/quiz$/,
			body: QUIZ_DEFINITION,
			once: false
		});
		await gotoHydrated('/tabs/articles/art-1');

		await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});
		const quizButton = page.locator('#quiz-button');
		await expect(quizButton).toBeVisible({ timeout: 12_000 });
		await expect(quizButton).toContainText(/take quiz|view quiz/i);
	});
});
