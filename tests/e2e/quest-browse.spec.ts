import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab, searchIn } from './utils/journey-helpers';
import { seedSingleStepQuest } from './utils/quest-helpers';

test.describe('Quest browse', () => {
	test('renders the seeded quest catalog', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/quests');

		// the default catalog seeds Daily Explorer + Trail Blazer (+ Every Step Type)
		await expect(page.getByText(/daily explorer/i).first()).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/trail blazer/i).first()).toBeVisible();
	});

	test('search filters the catalog client-side', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await expect(page.getByText(/daily explorer/i).first()).toBeVisible({ timeout: 12_000 });

		await searchIn(page, 'quest-search', 'Trail');

		// Trail Blazer survives the title filter, Daily Explorer is filtered out. quest cards
		// lazy-hydrate and ionic keeps the pre-nav page cached (hidden) in the outlet, so a
		// plain-text match can resolve to a hidden/stale label; scope to the visible card
		// heading and poll on the filtered-out one to ride out the debounce
		await expect(page.getByRole('heading', { name: /trail blazer/i }).first()).toBeVisible({
			timeout: 12_000
		});
		await expect
			.poll(async () => page.getByRole('heading', { name: /daily explorer/i }).count(), {
				timeout: 8000
			})
			.toBe(0);
	});

	test('shows the empty state when the catalog and history are empty', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		// blank the whole catalog; history stays empty (mock default) so the merged list is empty
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/quests/,
			body: { total: 0, quests: [] },
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/quests');

		await expect(page.getByText(/no quests yet/i).first()).toBeVisible({ timeout: 12_000 });
	});

	// regression: a malformed catalog entry with no `id` made the search filter throw on
	// `q.id.toLowerCase()`, which crashed the whole list (blank) and, on device, flooded the
	// disk logger enough to starve every other CapacitorHttp fetch. the list must survive it.
	test('renders the catalog even when it contains a malformed (id-less) quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		const crashes: string[] = [];
		page.on('pageerror', (e) => {
			if (/toLowerCase|is not an object|undefined/i.test(String(e))) crashes.push(String(e));
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/quests/,
			body: {
				total: 2,
				quests: [
					{
						id: 'q-ok',
						title: 'Solid Quest',
						description: 'A well-formed quest.',
						icon: 'mdi:trophy',
						rarity: 'common',
						reward: 50,
						steps: []
					},
					// no id, no steps -> the unguarded filter/card used to throw here
					{ title: 'Ghost Quest', description: 'Malformed: no id.' }
				]
			},
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/quests');

		// the valid quest still renders (the malformed one is dropped, not fatal)
		await expect(page.getByText(/solid quest/i).first()).toBeVisible({ timeout: 12_000 });
		// exercise the search filter that used to throw
		await searchIn(page, 'quest-search', 'Solid');
		await expect(page.getByRole('heading', { name: /solid quest/i }).first()).toBeVisible({
			timeout: 8000
		});
		expect(crashes, `list threw: ${crashes.join(' | ')}`).toEqual([]);
	});

	test('pull-to-refresh refetches quest data', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await expect(page.getByText(/daily explorer/i).first()).toBeVisible({ timeout: 12_000 });

		let historyFetches = 0;
		page.on('request', (r) => {
			if (/\/quest\/history/.test(r.url())) historyFetches++;
		});

		// fire the IonRefresher's ionRefresh directly (a real drag gesture isn't reliable in-harness).
		// scope to the quests content's refresher (#quest-search shares its IonContent); ionic keeps
		// other tab pages mounted, so a bare ion-refresher.first() can hit the dashboard's refresher
		await page
			.locator('ion-content:has(#quest-search) ion-refresher')
			.first()
			.evaluate((el) => {
				el.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => {} } }));
			});

		await expect.poll(() => historyFetches, { timeout: 8000 }).toBeGreaterThan(0);
	});

	test('surfaces the active quest under Current Quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend');
		await asUser();
		await seedSingleStepQuest(mockApi, 'describe_text', { questId: 'q-active' });
		await gotoTab(page, gotoHydrated, '/tabs/quests');

		await expect(page.getByRole('heading', { name: /current quest/i }).first()).toBeVisible({
			timeout: 12_000
		});
	});
});
