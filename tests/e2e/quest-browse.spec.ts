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
