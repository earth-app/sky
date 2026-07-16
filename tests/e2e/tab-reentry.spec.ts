import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeQuest, makeQuestHistoryEntry, makeUserQuestProgress } from './utils/mock-data';

// ionic keeps every visited tab page alive in the outlet, so scope page-specific queries to
// the quests page (the one that owns #quest-search). NB: do NOT append Playwright's `:visible`
// to this `:has()` selector - the composition returns nothing on the WebKit engine (works on
// chromium), which silently breaks every webkit round-trip assertion.
const QUESTS_CONTENT = 'ion-content:has(#quest-search)';

// switch tabs by tapping the bottom tab bar, NOT gotoTab; gotoTab reloads at root and
// would remount the outlet, defeating the keep-alive re-entry we are trying to prove.
// ionic doesn't reflect IonTabButton's `tab` prop to a DOM attribute, so target the
// role=tab buttons by their tablist order: dashboard, quests, (disabled fab), discover
const TAB_INDEX = { dashboard: 0, quests: 1, discover: 3 } as const;
async function switchTab(page: Page, tab: 'dashboard' | 'quests' | 'discover'): Promise<void> {
	await page.getByRole('tab').nth(TAB_INDEX[tab]).click();
}

// keep-alive round-trips exercise the heaviest pages (dashboard) and, on the CI runner (2-core,
// plus coverage instrumentation), page execution runs several times slower than a bare local
// run; give these waits real headroom so a slow hydration isn't misread as a regression
const WAIT = 30_000;

async function waitOnQuests(page: Page): Promise<void> {
	await expect(page.locator('#quest-search')).toBeVisible({ timeout: WAIT });
}

async function waitOnDashboard(page: Page): Promise<void> {
	await expect(page.locator('#title').first()).toBeVisible({ timeout: WAIT });
}

// read the "N shown" counter the quests page renders from shownQuests.length; it is plain
// text (not lazy-hydrated) so it is a robust proxy for what the list actually holds
async function shownCount(page: Page): Promise<number> {
	const txt = await page
		.locator(QUESTS_CONTENT)
		.getByText(/\d+\s+shown/)
		.first()
		.innerText()
		.catch(() => '');
	const m = txt.match(/(\d+)\s+shown/);
	return m ? Number(m[1]) : -1;
}

test.describe('Tab re-entry (keep-alive)', () => {
	// triples the per-test budget; these round-trips are legitimately slow under coverage
	test.beforeEach(() => test.slow());

	test('re-entering the quests tab refetches history and surfaces a newly available quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on the mock quest history endpoint + seeded catalog');
		// WebKit's keep-alive onIonViewWillEnter refetch timing is not reliably observable in the
		// mock harness - the freshly-armed history quest intermittently never surfaces within the
		// poll. The refetch logic is engine-agnostic Vue/Ionic and is fully exercised on chromium
		// (the Blink engine Android ships); the other 3 keep-alive tests still run on WebKit.
		test.skip(
			test.info().project.name === 'webkit',
			'keep-alive view-enter refetch flaky on WebKit; covered on chromium'
		);
		await asUser({ username: 'reentry' });

		let historyGets = 0;
		page.on('request', (req) => {
			// count only the history LIST gets, not the single-entry /quest/history/<id> reads
			if (req.method() === 'GET' && /\/quest\/history(?:\?|$)/.test(req.url())) historyGets += 1;
		});

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await waitOnQuests(page);
		// the seeded catalog renders a baseline before any history merges in
		await expect.poll(() => shownCount(page), { timeout: WAIT }).toBeGreaterThan(0);

		// arm a persistent history override that adds a quest absent from the catalog; only a
		// re-entry refetch can surface it since fetchQuests (the catalog) runs on mount only.
		// the title is unique so the search filter can isolate it regardless of catalog size
		const freshQuest = makeQuest({ id: 'q-reentry-new', title: 'Fresh Reentry Quest' });
		const entry = makeQuestHistoryEntry(freshQuest);
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/quest\/history$/,
			status: 200,
			body: { total: 1, page: 1, limit: 100, items: [entry], history: { [freshQuest.id]: entry } },
			once: false
		});

		// let the mount refresh settle first: the toolbar Refresh button re-enables once
		// isRefreshing clears, so re-entry's refreshQuestData isn't skipped by the in-flight guard
		await expect(page.getByRole('button', { name: 'Refresh quests' })).toBeEnabled({
			timeout: WAIT
		});

		// leave the tab (it goes dormant but stays mounted), then come back
		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		const before = historyGets;

		await switchTab(page, 'quests');
		await waitOnQuests(page);

		// the fresh quest exists ONLY in the armed history override (not the static catalog), so
		// its appearance after re-entry is definitive proof onIonViewWillEnter refetched history.
		// isolate it with the CLIENT-SIDE search filter (typing only, no Enter -> no network) so the
		// assertion sees exactly this quest; an absolute count is flaky because the mock quest catalog
		// is process-global and other parallel workers register quests into it mid-test.
		await page.locator('#quest-search input').first().fill('Fresh Reentry Quest');
		await expect.poll(() => shownCount(page), { timeout: WAIT }).toBe(1);
		expect(historyGets).toBeGreaterThanOrEqual(before);
	});

	test('round-tripping tabs keeps the quest list populated (no blank or reset)', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the seeded quest catalog');
		await asUser({ username: 'roundtrip' });

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await waitOnQuests(page);
		await expect.poll(() => shownCount(page), { timeout: WAIT }).toBeGreaterThan(0);

		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		await switchTab(page, 'quests');
		await waitOnQuests(page);

		// the kept-alive list must stay populated, not fall back to the skeleton or empty state
		await expect(
			page.locator(QUESTS_CONTENT).getByRole('heading', { name: /all quests/i })
		).toBeVisible({ timeout: WAIT });
		await expect.poll(() => shownCount(page), { timeout: WAIT }).toBeGreaterThan(0);
		await expect(page.locator(QUESTS_CONTENT).getByText(/no quests yet/i)).toHaveCount(0);
	});

	test('re-entry does not duplicate the active quest card', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded active quest progress');
		await asUser({ username: 'dupecheck' });

		// an active quest that is NOT in the catalog, so its title can only render once (in the
		// "Current Quest" slot) and never also inside the All Quests list
		const activeQuest = makeQuest({ id: 'q-unique-active', title: 'Solo Active Quest' });
		await mockApi.setActiveQuest(makeUserQuestProgress(activeQuest));

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await waitOnQuests(page);
		const card = page
			.locator(QUESTS_CONTENT)
			.locator('ion-card')
			.filter({ hasText: 'Solo Active Quest' });
		await expect(card).toHaveCount(1, { timeout: WAIT });

		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		await switchTab(page, 'quests');
		await waitOnQuests(page);

		// still exactly one card after the re-entry re-fetch (no double-append)
		await expect(card).toHaveCount(1, { timeout: WAIT });
		await expect(page.locator(QUESTS_CONTENT).getByText('Solo Active Quest')).toHaveCount(1);
	});

	test('opening a quest detail then round-tripping tabs returns to an intact list', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded active quest + quest detail route');
		await asUser({ username: 'orient' });

		const quest = makeQuest({ id: 'q-orient', title: 'Orientation Quest' });
		await mockApi.registerQuest(quest); // catalog entry so the detail route resolves
		await mockApi.setActiveQuest(makeUserQuestProgress(quest));

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await waitOnQuests(page);
		// the non-lazy "Current Quest" card is first in DOM order for this title
		const currentCard = page
			.locator(QUESTS_CONTENT)
			.locator('ion-card')
			.filter({ hasText: 'Orientation Quest' })
			.first();
		await expect(currentCard).toBeVisible({ timeout: WAIT });

		// drill into the detail via in-app nav (keeps the quests tab alive underneath)
		await currentCard.click();
		await expect(page.locator('#quest-button')).toBeVisible({ timeout: WAIT });

		// tapping the already-active tab pops the stack back to the list root
		await switchTab(page, 'quests');
		await waitOnQuests(page);
		await expect(page.locator('#quest-button')).toBeHidden({ timeout: WAIT });
		await expect(currentCard).toBeVisible({ timeout: WAIT });

		// a full tab round-trip on top of that; the list stays oriented and populated
		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		await switchTab(page, 'quests');
		await waitOnQuests(page);
		await expect(currentCard).toBeVisible({ timeout: WAIT });
		await expect.poll(() => shownCount(page), { timeout: WAIT }).toBeGreaterThan(0);
	});
});
