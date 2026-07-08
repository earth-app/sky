import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

function harnessUrl(kind: string): string {
	return `/__test__/widget-harness?kind=${kind}`;
}

// 4 activities with clear, distinct descriptions -> a full real-activity round after filtering
const RANDOM_ACTIVITIES = [
	{
		id: 'rf-1',
		name: 'Kayaking',
		description: 'Kayaking is a paddling sport on open water.',
		types: ['SPORT'],
		aliases: [],
		fields: {}
	},
	{
		id: 'rf-2',
		name: 'Origami',
		description: 'Origami is the art of folding paper into shapes.',
		types: ['ART'],
		aliases: [],
		fields: {}
	},
	{
		id: 'rf-3',
		name: 'Birdwatching',
		description: 'Birdwatching means observing wild birds in nature.',
		types: ['NATURE'],
		aliases: [],
		fields: {}
	},
	{
		id: 'rf-4',
		name: 'Pottery',
		description: 'Pottery is shaping clay into vessels and firing it.',
		types: ['CREATIVE'],
		aliases: [],
		fields: {}
	}
];

test.describe('Interactive feed widgets', () => {
	test.beforeEach(async ({ context, asUser }) => {
		await installNativeMock(context, { platform: 'ios' });
		await asUser({ username: 'widgetuser' });
	});

	test('MicroQuiz reveals feedback after answering and advances with Next', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness + mock widget data');
		await gotoHydrated(harnessUrl('MicroQuiz'));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.getByText(/quick trivia/i)).toBeVisible({ timeout: 12_000 });
		// default question 1 answer is "71%"; picking it reveals the explanation + a Next button
		await page.getByRole('button', { name: /71%/ }).click();
		await expect(page.getByText(/most of earth is water/i)).toBeVisible({ timeout: 8000 });

		const nextButton = page.getByRole('button', { name: /next/i });
		await expect(nextButton).toBeVisible();
		await nextButton.click();
		// question 2 surfaces its own options
		await expect(page.getByRole('button', { name: /oxygen/i })).toBeVisible({ timeout: 8000 });
	});

	test('RapidFlash starts a round and completes after matching all pairs', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness + mock widget data');
		await gotoHydrated(harnessUrl('RapidFlash'));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.getByText(/rapid flash match/i)).toBeVisible({ timeout: 12_000 });
		await page.getByRole('button', { name: /start round/i }).click();

		// both columns render the term text (defs display their pair's term). the first 4 cells are
		// the terms column, the last 4 the defs column. match each term to the def cell with the
		// same label. read raw textContent (Ionic css-uppercases the visible text, so innerText lies).
		const cellSel = '[data-testid="widget-slot"] ion-button';
		await expect.poll(async () => page.locator(cellSel).count(), { timeout: 8000 }).toBe(8);

		const labels = await page
			.locator(cellSel)
			.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));

		// for each terms-column cell, find its twin index in the defs column (4..7)
		for (let t = 0; t < 4; t++) {
			const twin = labels.findIndex((l, i) => i >= 4 && l === labels[t]);
			await page.locator(cellSel).nth(t).click();
			await page.locator(cellSel).nth(twin).click();
		}

		await expect(page.getByText(/all 4 matched/i)).toBeVisible({ timeout: 8000 });
		await expect(page.getByRole('button', { name: /play again/i })).toBeVisible();
	});

	test('RapidFlash pulls real activities from the API and shows their names', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('testBuild harness + mocked activities');
		// the slot over-fetches /v2/activities/random(8); return 4 clean activities so the real pool wins
		await mockApi.set({
			method: 'GET',
			path: '/v2/activities/random',
			body: RANDOM_ACTIVITIES,
			once: false
		});
		await gotoHydrated(harnessUrl('RapidFlash'));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.getByText(/rapid flash match/i)).toBeVisible({ timeout: 12_000 });
		await page.getByRole('button', { name: /start round/i }).click();

		const cellSel = '[data-testid="widget-slot"] ion-button';
		await expect.poll(async () => page.locator(cellSel).count(), { timeout: 8000 }).toBe(8);
		// read raw textContent (Ionic css-uppercases the visible label, so innerText lies)
		const labels = await page
			.locator(cellSel)
			.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim().toLowerCase()));
		for (const name of ['kayaking', 'origami', 'birdwatching', 'pottery']) {
			expect(labels.some((l) => l.includes(name))).toBe(true);
		}
	});

	test('RapidFlash falls back to the default pool when the endpoint fails', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('testBuild harness + mock widget data');
		// force the random endpoint to fail so the slot falls back to the widget's DEFAULT_POOL
		await mockApi.set({
			method: 'GET',
			path: '/v2/activities/random',
			status: 404,
			body: { message: 'Not Found' },
			once: false
		});
		await gotoHydrated(harnessUrl('RapidFlash'));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.getByText(/rapid flash match/i)).toBeVisible({ timeout: 12_000 });
		await page.getByRole('button', { name: /start round/i }).click();

		const cellSel = '[data-testid="widget-slot"] ion-button';
		await expect.poll(async () => page.locator(cellSel).count(), { timeout: 8000 }).toBe(8);
		const labels = await page
			.locator(cellSel)
			.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
		const poolTerm = /Biome|Pollinator|Watershed|Compost|Mycelium|Canopy/i;
		expect(labels.filter((l) => poolTerm.test(l)).length).toBeGreaterThanOrEqual(4);
	});

	test('MicroPoll vote round-trips to /v2/users/current/poll and shows aggregate bars', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('poll aggregation is mock-only');
		await gotoHydrated(harnessUrl('MicroPoll'));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.getByText(/quick poll/i)).toBeVisible({ timeout: 12_000 });

		const postSeen = page.waitForRequest(
			(req) => req.method() === 'POST' && /\/v2\/users\/current\/poll/.test(req.url()),
			{ timeout: 10_000 }
		);
		// vote the first option (default poll: "Plant a tree")
		await page.getByRole('button', { name: /plant a tree/i }).click();

		const post = await postSeen;
		expect(post.postDataJSON()).toMatchObject({ option_index: 0 });

		// aggregate bars render from the returned PollVote.aggregate
		await expect(page.locator('ion-progress-bar').first()).toBeVisible({ timeout: 8000 });
		await expect(page.getByText(/votes? so far/i)).toBeVisible({ timeout: 8000 });
	});

	test('MicroReflection saves a written reflection', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness + mock widget data');
		await gotoHydrated(harnessUrl('MicroReflection'));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.getByText(/quick reflection/i)).toBeVisible({ timeout: 12_000 });
		// ion-textarea proxies to an inner textarea
		await page
			.locator('[data-testid="widget-slot"] ion-textarea textarea')
			.fill('A short note about my day.');
		await page.getByRole('button', { name: /save reflection/i }).click();

		await expect(page.getByText(/reflection saved/i)).toBeVisible({ timeout: 8000 });
		await expect(page.getByText(/a short note about my day\./i)).toBeVisible();
	});

	test('ImpactTracker marks today complete and shows the streak', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness + mock widget data');
		await gotoHydrated(harnessUrl('ImpactTracker'));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.getByText(/today's impact goal/i)).toBeVisible({ timeout: 12_000 });
		await page.getByRole('button', { name: /mark today complete/i }).click();

		await expect(page.getByText(/done for today/i)).toBeVisible({ timeout: 8000 });
		await expect(page.getByText(/streak:\s*1\s*consecutive day/i)).toBeVisible();
	});
});
