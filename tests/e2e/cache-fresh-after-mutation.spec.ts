/**
 * Cache-freshness suite (mobile shell).
 *
 * Proves the app shows FRESH data after a refresh / mutation instead of replaying a stale
 * cache. The vendored crust `makeAPIRequest` keeps a module-level LRU api cache that is LIVE
 * in the browser build, and the user store adds its own `questHistory.has()` short-circuit.
 * A `force` fetch must pass a NULL cache key (and skip the store guard) so pull-to-refresh
 * actually re-hits the network - the coordinator just fixed `fetchQuestHistory` this way.
 *
 * Guards covered:
 *   1. pull-to-refresh forces a real /quest/history round trip + surfaces a newly-completed quest
 *   2. the header Refresh button takes the same forced path (second entry point)
 *   3. detail navigation between sibling ids does not bleed a stale cached item
 *   4. a non-seeded detail id renders the fresh override (no absent/stale cache served)
 *
 * Runs on chromium AND webkit (webkit ~ iOS WKWebView) so cache behavior surfaces on both.
 */

import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab, searchIn } from './utils/journey-helpers';
import { makeActivity, makeQuest, makeQuestHistoryEntry } from './utils/mock-data';

// the quests list list-route (NOT the single-entry .../history/<id> variant)
const HISTORY_LIST = /^\/v2\/users\/[^/]+\/quest\/history\/?$/;

test.describe('Quest history refresh serves fresh data (force -> null cache key)', () => {
	test('pull-to-refresh re-hits the network and surfaces a newly-completed quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/quests');
		// the initial (non-force) history fetch primes the store cache with an empty map, so a
		// non-force refetch would short-circuit; only force can surface anything new
		await expect(page.getByText(/daily explorer/i).first()).toBeVisible({ timeout: 12_000 });

		// arm a persistent history override that reports a quest NOT in the static catalog, so it
		// can only appear if the forced refetch actually merges fresh server data into the store
		const freshQuest = makeQuest({ id: 'q-fresh-1', title: 'Freshly Completed Quest' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: HISTORY_LIST,
			body: {
				total: 1,
				page: 1,
				limit: 100,
				items: [makeQuestHistoryEntry(freshQuest)],
				history: { 'q-fresh-1': makeQuestHistoryEntry(freshQuest) }
			},
			once: false
		});

		let historyFetches = 0;
		page.on('request', (r) => {
			if (/\/quest\/history/.test(r.url())) historyFetches++;
		});

		// fire the quests content's IonRefresher directly (a real drag gesture isn't reliable
		// in-harness). scope to #quest-search's IonContent; ionic keeps other tab pages mounted
		// so a bare ion-refresher.first() can hit the dashboard's refresher
		await page
			.locator('ion-content:has(#quest-search) ion-refresher')
			.first()
			.evaluate((el) => {
				el.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => {} } }));
			});

		// force means the store guard is bypassed, so a genuine /quest/history GET must fire
		await expect.poll(() => historyFetches, { timeout: 8000 }).toBeGreaterThan(0);

		// filter down to the newly-merged quest so the (lazy, below-fold) card is the only one
		// left and renders at the top; a stale cache would never have merged it
		await searchIn(page, 'quest-search', 'Freshly');
		await expect(
			page.getByRole('heading', { name: /freshly completed quest/i }).first()
		).toBeVisible({ timeout: 12_000 });
	});

	test('the header Refresh button also forces a history round trip', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await expect(page.getByText(/daily explorer/i).first()).toBeVisible({ timeout: 12_000 });

		let historyFetches = 0;
		page.on('request', (r) => {
			if (/\/quest\/history/.test(r.url())) historyFetches++;
		});

		await page
			.getByRole('button', { name: /refresh quests/i })
			.first()
			.click();

		// the button path calls fetchQuestHistory({ force: true }); without the null cache key the
		// store's questHistory.has() guard would return early and no request would fire
		await expect.poll(() => historyFetches, { timeout: 8000 }).toBeGreaterThan(0);
	});
});

test.describe('Detail navigation does not replay a stale cached item', () => {
	test('opening a sibling id renders its own data, not the previous item', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on seeded activity catalog + activity detail');
		await asUser();

		await gotoHydrated('/tabs/activities/act-2');
		await expect(page.getByRole('heading', { name: 'Sample Activity 2', level: 1 })).toBeVisible({
			timeout: 12_000
		});

		await gotoHydrated('/tabs/activities/act-3');
		await expect(page.getByRole('heading', { name: 'Sample Activity 3', level: 1 })).toBeVisible({
			timeout: 12_000
		});
		// the prior item must not bleed through from a stale store/LRU entry
		await expect
			.poll(
				async () => page.getByRole('heading', { name: 'Sample Activity 2', level: 1 }).count(),
				{
					timeout: 8000
				}
			)
			.toBe(0);
	});

	test('a non-seeded detail id renders the fresh override (nothing stale to serve)', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on the mock backend');
		await asUser();
		// non-seeded id: the ONLY source for this detail fetch is the override, so a rendered
		// heading proves the fetch was served fresh rather than from an absent/stale cache
		await mockApi.respondEnvelope(
			'GET',
			'/v2/activities/act-fresh-1',
			makeActivity({ id: 'act-fresh-1', name: 'Freshly Fetched Activity' })
		);
		await gotoHydrated('/tabs/activities/act-fresh-1');
		await expect(
			page.getByRole('heading', { name: 'Freshly Fetched Activity', level: 1 })
		).toBeVisible({ timeout: 12_000 });
	});
});
