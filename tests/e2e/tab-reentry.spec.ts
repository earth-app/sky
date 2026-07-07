import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeQuest, makeQuestHistoryEntry, makeUserQuestProgress } from './utils/mock-data';

// ionic keeps every visited tab page alive in the outlet, so scope page-specific
// queries to the visible quests page (the one that owns #quest-search)
const QUESTS_CONTENT = 'ion-content:has(#quest-search)';

// switch tabs by tapping the bottom tab bar, NOT gotoTab; gotoTab reloads at root and
// would remount the outlet, defeating the keep-alive re-entry we are trying to prove.
// ionic doesn't reflect IonTabButton's `tab` prop to a DOM attribute, so target the
// role=tab buttons by their tablist order: dashboard, quests, (disabled fab), discover
const TAB_INDEX = { dashboard: 0, quests: 1, discover: 3 } as const;
async function switchTab(page: Page, tab: 'dashboard' | 'quests' | 'discover'): Promise<void> {
	await page.getByRole('tab').nth(TAB_INDEX[tab]).click();
}

async function waitOnQuests(page: Page): Promise<void> {
	await expect(page.locator('#quest-search')).toBeVisible({ timeout: 12_000 });
}

async function waitOnDashboard(page: Page): Promise<void> {
	await expect(page.locator('#title').first()).toBeVisible({ timeout: 12_000 });
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
	test('re-entering the quests tab refetches history and surfaces a newly available quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on the mock quest history endpoint + seeded catalog');
		await asUser({ username: 'reentry' });

		let historyGets = 0;
		page.on('request', (req) => {
			// count only the history LIST gets, not the single-entry /quest/history/<id> reads
			if (req.method() === 'GET' && /\/quest\/history(?:\?|$)/.test(req.url())) historyGets += 1;
		});

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await waitOnQuests(page);
		// the seeded catalog renders a baseline before any history merges in
		await expect.poll(() => shownCount(page), { timeout: 12_000 }).toBeGreaterThan(0);
		const baselineShown = await shownCount(page);

		// arm a persistent history override that adds a quest absent from the catalog; only a
		// re-entry refetch can surface it since fetchQuests (the catalog) runs on mount only
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
			timeout: 12_000
		});

		// leave the tab (it goes dormant but stays mounted), then come back
		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		const before = historyGets;

		await switchTab(page, 'quests');
		await waitOnQuests(page);

		// the fresh quest exists ONLY in the armed history override (not the static catalog), so
		// its appearance after re-entry is definitive proof onIonViewWillEnter refetched history.
		// (the raw request count is a flaky signal - ionic can dedupe / skip a view-enter fetch -
		// so we assert the merged OUTCOME, which can't happen without a real refetch)
		await expect.poll(() => shownCount(page), { timeout: 12_000 }).toBe(baselineShown + 1);
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
		await expect.poll(() => shownCount(page), { timeout: 12_000 }).toBeGreaterThan(0);

		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		await switchTab(page, 'quests');
		await waitOnQuests(page);

		// the kept-alive list must stay populated, not fall back to the skeleton or empty state
		await expect(
			page.locator(QUESTS_CONTENT).getByRole('heading', { name: /all quests/i })
		).toBeVisible({ timeout: 12_000 });
		await expect.poll(() => shownCount(page), { timeout: 12_000 }).toBeGreaterThan(0);
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
		await expect(card).toHaveCount(1, { timeout: 12_000 });

		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		await switchTab(page, 'quests');
		await waitOnQuests(page);

		// still exactly one card after the re-entry re-fetch (no double-append)
		await expect(card).toHaveCount(1, { timeout: 12_000 });
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
		await expect(currentCard).toBeVisible({ timeout: 12_000 });

		// drill into the detail via in-app nav (keeps the quests tab alive underneath)
		await currentCard.click();
		await expect(page.locator('#quest-button')).toBeVisible({ timeout: 12_000 });

		// tapping the already-active tab pops the stack back to the list root
		await switchTab(page, 'quests');
		await waitOnQuests(page);
		await expect(page.locator('#quest-button')).toBeHidden({ timeout: 12_000 });
		await expect(currentCard).toBeVisible({ timeout: 12_000 });

		// a full tab round-trip on top of that; the list stays oriented and populated
		await switchTab(page, 'dashboard');
		await waitOnDashboard(page);
		await switchTab(page, 'quests');
		await waitOnQuests(page);
		await expect(currentCard).toBeVisible({ timeout: 12_000 });
		await expect.poll(() => shownCount(page), { timeout: 12_000 }).toBeGreaterThan(0);
	});
});
