import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast } from './utils/journey-helpers';
import { makeArticleQuizScore, makeArticleQuizV2 } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// the article-create POST (mantle, {title,description,content}) and the quiz-authoring
// POST (mantle, {questions}); crustBaseUrl == the mantle mock in the e2e lane
const ARTICLES_PATH = '/v2/articles';
const QUIZ_WRITE_RE = /^\/v2\/articles\/[^/]+\/quiz$/;

// take-flow quiz carrying a multi_select (in addition to a single-pick) so the take path
// covers a non-radio question type; summary is derived by makeArticleQuizV2
const MULTI_SELECT_QUIZ = makeArticleQuizV2({
	questions: [
		{
			type: 'multiple_choice',
			question: 'What is the capital of France?',
			options: ['Paris', 'London', 'Rome'],
			correct_answer: 'Paris'
		},
		{
			type: 'multi_select',
			question: 'Which of these are primary colors?',
			options: ['Red', 'Green', 'Blue', 'Purple'],
			correct_answers: ['Red', 'Blue']
		}
	]
});

// a three-question quiz (single-pick + order) for the already-taken read-only render
const TAKEN_QUIZ = makeArticleQuizV2({
	questions: [
		{
			type: 'multiple_choice',
			question: 'What is the capital of France?',
			options: ['Paris', 'London', 'Rome'],
			correct_answer: 'Paris'
		},
		{
			type: 'true_false',
			question: 'Water is made of hydrogen and oxygen.',
			options: ['True', 'False'],
			correct_answer: 'True'
		},
		{
			type: 'order',
			question: 'Put the planets in order from the Sun.',
			items: ['Mercury', 'Venus', 'Earth']
		}
	]
});

// an answer far wider than any phone screen; with nowrap it truncates to an ellipsis and can't be read
const LONG_OPTION =
	'The correct yet remarkably verbose answer that keeps going well past the width of any phone screen, so it would truncate with an ellipsis unless the option label is allowed to wrap onto multiple lines.';

const LONG_ANSWER_QUIZ = makeArticleQuizV2({
	questions: [
		{
			type: 'multiple_choice',
			question: 'Which statement is correct?',
			options: [LONG_OPTION, 'A short wrong answer', 'Another short one'],
			correct_answer: LONG_OPTION
		}
	]
});

const TAKEN_SCORE = makeArticleQuizScore({
	score: 3,
	total: 3,
	scorePercent: 100,
	results: [
		{ correct: true, correct_answer_index: 0, user_answer_index: 0 },
		{ correct: true, correct_answer_index: 0, user_answer_index: 0 },
		{
			correct: true,
			correct_order: ['Mercury', 'Venus', 'Earth'],
			user_order: ['Mercury', 'Venus', 'Earth']
		}
	]
});

test.describe('Journey: article author -> reader -> quiz', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('WRITER publishes, reads it back, takes the quiz and passes', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('writes to mantle mock + asserts seeded quiz/journey');
		await asUser({ account: { account_type: 'WRITER', visibility: 'PUBLIC' } });
		// the detail page taps the read journey on mount; seed the crust proxy so it increments
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/api\/user\/journey$/,
			body: { count: 6, incremented: true },
			once: false
		});

		await gotoHydrated('/tabs/articles/new');
		await expect(page.getByText(/create new article/i)).toBeVisible({ timeout: 12_000 });

		await page.getByPlaceholder(/wonderful world of pizzas/i).fill('My First Article');
		await page.getByPlaceholder(/pizzas are great because/i).fill('A short description.');
		await page
			.getByPlaceholder(/the first reason pizzas are great/i)
			.fill('The full body of the article goes here with plenty of clean content.');

		const createReq = page.waitForRequest(
			(r) => r.method() === 'POST' && new URL(r.url()).pathname === ARTICLES_PATH
		);
		await page.getByRole('button', { name: /create article/i }).click();

		// the create POST carries the {title,description,content} contract
		const req = await createReq;
		const body = req.postDataJSON();
		expect(body).toMatchObject({
			title: 'My First Article',
			description: 'A short description.'
		});
		expect(body.content).toContain('clean content');

		await expectNativeToast(page, /created successfully/i);

		// landed on the reader view: title + author render (the "read" leg)
		await page.waitForURL((url) => /^\/tabs\/articles\/[^/]+$/.test(url.pathname), {
			timeout: 12_000
		});
		await expect(
			page.getByRole('heading', { level: 1, name: /my first article/i }).first()
		).toBeVisible({ timeout: 12_000 });

		// the read journey increment surfaces its streak toast
		await expectNativeToast(page, /journey streak/i);

		// mock serves a default quiz for every article, so the Take Quiz CTA renders
		const quizButton = page.locator('#quiz-button');
		await expect(quizButton).toBeVisible({ timeout: 12_000 });
		await expect(quizButton).toContainText(/take quiz/i);
		await quizButton.click();

		// take the quiz: multiple_choice then true_false, submit for a full score
		await expect(page.getByText(/question 1 of 2/i)).toBeVisible({ timeout: 12_000 });
		await page.locator('ion-radio', { hasText: 'Paris' }).click();

		const quizNav = page.locator('#quiz-nav');
		await quizNav.getByRole('button', { name: /^next$/i }).click();
		await expect(page.getByText(/question 2 of 2/i)).toBeVisible();
		await page.locator('ion-radio', { hasText: 'True' }).click();

		const submit = quizNav.getByRole('button', { name: /^submit$/i });
		await expect(submit).toBeVisible({ timeout: 8000 });
		await submit.click();

		await expect(page.getByText(/100%/).first()).toBeVisible({ timeout: 8000 });
		await expect(page.getByText(/\(2\/2\)/).first()).toBeVisible();
	});

	test('ORGANIZER attaches a quiz and the authoring POST carries the question', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('writes article + quiz to the mantle mock');
		// ORGANIZER unlocks the in-form quiz editor (WRITER cannot author quizzes)
		await asUser({ account: { account_type: 'ORGANIZER', visibility: 'PUBLIC' } });

		// base mock lacks the quiz-authoring route; stub it so the create+quiz flow reports success
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: QUIZ_WRITE_RE,
			status: 201,
			body: { id: 'quiz-new', questions: [] },
			once: false
		});

		await gotoHydrated('/tabs/articles/new');
		await expect(page.getByText(/create new article/i)).toBeVisible({ timeout: 12_000 });

		// add + fill one quiz question in the editor
		await page.getByRole('button', { name: /add question/i }).click();
		const stem = page.getByPlaceholder(/type your question/i).first();
		await expect(stem).toBeVisible({ timeout: 8000 });
		await stem.fill('Is the Earth round?');

		await page.getByPlaceholder(/wonderful world of pizzas/i).fill('A Quizzed Article');
		await page.getByPlaceholder(/pizzas are great because/i).fill('It has a quiz attached.');
		await page
			.getByPlaceholder(/the first reason pizzas are great/i)
			.fill('The full body of this quizzed article has plenty of clean content.');

		const createReq = page.waitForRequest(
			(r) => r.method() === 'POST' && new URL(r.url()).pathname === ARTICLES_PATH
		);
		const quizReq = page.waitForRequest(
			(r) => r.method() === 'POST' && QUIZ_WRITE_RE.test(new URL(r.url()).pathname)
		);
		await page.getByRole('button', { name: /create article/i }).click();

		await createReq;
		// the quiz-write POST fires against the new article id and carries the authored question
		const authored = await quizReq;
		expect(authored.postData()).toContain('Is the Earth round?');

		await expectNativeToast(page, /created successfully/i);
	});

	test('reader takes a seeded quiz with a multi-select question and passes', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock article art-1 + seeded quiz');
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/articles\/art-1\/quiz$/,
			body: MULTI_SELECT_QUIZ,
			once: false
		});
		await gotoHydrated('/tabs/articles/art-1/quiz');

		await expect(page.getByText(/question 1 of 2/i)).toBeVisible({ timeout: 12_000 });
		await page.locator('ion-radio', { hasText: 'Paris' }).click();

		const quizNav = page.locator('#quiz-nav');
		await quizNav.getByRole('button', { name: /^next$/i }).click();
		await expect(page.getByText(/primary colors/i)).toBeVisible();

		// tick a multi-select option; one pick satisfies the "answered" gate
		await page.locator('ion-checkbox').first().click();

		const submit = quizNav.getByRole('button', { name: /^submit$/i });
		await expect(submit).toBeVisible({ timeout: 8000 });
		await submit.click();

		// passing flips the score header and hides Submit (the taken/completed state)
		await expect(page.getByText(/100%/).first()).toBeVisible({ timeout: 8000 });
		await expect(page.getByText(/\(2\/2\)/).first()).toBeVisible();
		await expect(submit).toHaveCount(0);
	});

	test('create is blocked with too-short content: form stays, no POST fires', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('asserts client-side schema gate before any mantle write');
		await asUser({ account: { account_type: 'WRITER', visibility: 'PUBLIC' } });

		let createPosts = 0;
		page.on('request', (r) => {
			if (r.method() === 'POST' && new URL(r.url()).pathname === ARTICLES_PATH) createPosts++;
		});

		await gotoHydrated('/tabs/articles/new');
		await expect(page.getByText(/create new article/i)).toBeVisible({ timeout: 12_000 });

		await page.getByPlaceholder(/wonderful world of pizzas/i).fill('A Valid Title');
		await page.getByPlaceholder(/pizzas are great because/i).fill('A valid description.');
		// under the 20-char minimum -> schema rejects, handleSubmit never runs
		await page.getByPlaceholder(/the first reason pizzas are great/i).fill('too short');

		await page.getByRole('button', { name: /create article/i }).click();

		// inline schema error surfaces and the form is still mounted
		await expect(page.getByText(/at least 20 characters/i)).toBeVisible({ timeout: 8000 });
		await expect(page.getByText(/create new article/i)).toBeVisible();

		await page.waitForTimeout(1000);
		expect(createPosts).toBe(0);
	});

	test('a create 5xx surfaces a formatted error toast (no raw status code)', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on a mock 500 override for POST /v2/articles');
		await asUser({ account: { account_type: 'WRITER', visibility: 'PUBLIC' } });
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/articles$/,
			status: 500,
			body: { message: 'The article service is unavailable right now.' },
			once: false
		});

		await gotoHydrated('/tabs/articles/new');
		await expect(page.getByText(/create new article/i)).toBeVisible({ timeout: 12_000 });

		await page.getByPlaceholder(/wonderful world of pizzas/i).fill('A Doomed Article');
		await page.getByPlaceholder(/pizzas are great because/i).fill('This create will fail.');
		await page
			.getByPlaceholder(/the first reason pizzas are great/i)
			.fill('The full body of this article has plenty of clean content to submit.');

		await page.getByRole('button', { name: /create article/i }).click();

		// the failure is shown as a human message, never a raw "[500] /v2/articles"
		await expectNativeToast(page, /unavailable right now|failed to create article/i);
		const toasts = (await page.evaluate(() => (window as any).__toasts ?? [])) as string[];
		expect(toasts.some((t) => /\[\d{3}\]/.test(t))).toBe(false);

		// still on the create form (no navigation on failure)
		await expect(page.getByText(/create new article/i)).toBeVisible();
	});

	test('an already-taken quiz re-opens in read-only state with the answer breakdown', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock art-1 + seeded quiz + prior score');
		await asUser();
		await mockApi.setMany([
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/v2\/articles\/art-1\/quiz$/,
				body: TAKEN_QUIZ,
				once: false
			},
			// score fetch returns a prior perfect result, so the quiz opens already taken
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/api\/article\/quiz$/,
				body: TAKEN_SCORE,
				once: false
			}
		]);
		await gotoHydrated('/tabs/articles/art-1/quiz');

		await expect(page.getByText(/question 1 of 3/i)).toBeVisible({ timeout: 12_000 });
		// prior score is shown and the quiz cannot be re-submitted
		await expect(page.getByText(/100%/).first()).toBeVisible();
		await expect(page.getByText(/\(3\/3\)/).first()).toBeVisible();
		await expect(page.getByText(/^Correct$/).first()).toBeVisible();
		const quizNav = page.locator('#quiz-nav');
		await expect(quizNav.getByRole('button', { name: /^submit$/i })).toHaveCount(0);

		// the order question's read-only breakdown lists the correct sequence
		await quizNav.getByRole('button', { name: /^next$/i }).click();
		await quizNav.getByRole('button', { name: /^next$/i }).click();
		await expect(page.getByText(/question 3 of 3/i)).toBeVisible();
		await expect(page.getByText(/correct order/i)).toBeVisible({ timeout: 8000 });
		await expect(page.getByText('Mercury').first()).toBeVisible();
	});

	test('Back is disabled on the first question and Next on the last', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock art-1 + seeded quiz');
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/articles\/art-1\/quiz$/,
			body: MULTI_SELECT_QUIZ,
			once: false
		});
		await gotoHydrated('/tabs/articles/art-1/quiz');

		await expect(page.getByText(/question 1 of 2/i)).toBeVisible({ timeout: 12_000 });
		// scope to the quiz nav; the ionic header carries its own back button
		const quizNav = page.locator('#quiz-nav');
		await expect(quizNav.getByRole('button', { name: /^back$/i })).toBeDisabled();

		await quizNav.getByRole('button', { name: /^next$/i }).click();
		await expect(page.getByText(/question 2 of 2/i)).toBeVisible();
		await expect(quizNav.getByRole('button', { name: /^next$/i })).toBeDisabled();
	});

	test('a long answer option wraps instead of truncating (stays fully readable)', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock art-1 + seeded long-option quiz');
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/articles\/art-1\/quiz$/,
			body: LONG_ANSWER_QUIZ,
			once: false
		});
		await gotoHydrated('/tabs/articles/art-1/quiz');

		await expect(page.getByText(/question 1 of 1/i)).toBeVisible({ timeout: 12_000 });

		// the whole long option renders as one radio choice
		const longRadio = page.locator('ion-radio', { hasText: /remarkably verbose answer/ });
		await expect(longRadio).toBeVisible({ timeout: 8000 });

		// ionic's label part must wrap (white-space: normal) and not clip horizontally. without the
		// fix it stays nowrap + ellipsis, so scrollWidth exceeds clientWidth and the text is unreadable
		const label = await longRadio.evaluate((el) => {
			const part = (
				el as HTMLElement & { shadowRoot: ShadowRoot | null }
			).shadowRoot?.querySelector('[part="label"]') as HTMLElement | null;
			if (!part) return null;
			return {
				whiteSpace: getComputedStyle(part).whiteSpace,
				clipped: part.scrollWidth > part.clientWidth + 1
			};
		});
		expect(label).not.toBeNull();
		expect(label!.whiteSpace).toBe('normal');
		expect(label!.clipped).toBe(false);
	});
});
