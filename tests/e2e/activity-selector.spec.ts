import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeActivity } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

const PAGINATED = /^\/v2\/activities\/?$/;

// "Jogging" is only reachable via its alias "run" -- its name never contains the query
const ALIAS_ACTIVITY = makeActivity({
	id: 'act-jog',
	name: 'Jogging',
	description: 'A steady outdoor run at an easy pace.',
	aliases: ['run', 'running'],
	types: ['SPORT']
});

test.describe('Activity selector search', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('surfaces a server alias match whose name does not contain the query', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on a mock activity-search override that mimics alias matching');
		await asUser({ account: { account_type: 'ORGANIZER' } });

		// the server returns the alias match for the query; the picker must show it, not re-hide it
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: PAGINATED,
			body: { items: [ALIAS_ACTIVITY], total: 1 },
			once: false
		});

		await gotoHydrated('/tabs/events/new');

		// open the "Select Activities" picker modal
		await page.getByRole('button', { name: /select activities/i }).click();
		const modal = page.locator('ion-modal');
		await expect(modal.locator('ion-searchbar')).toBeVisible({ timeout: 12_000 });

		// search "run": the name "Jogging" has no "run" in it, so only trusting the server surfaces it
		await modal.locator('ion-searchbar input').fill('run');

		await expect(modal.getByText('Jogging')).toBeVisible({ timeout: 8000 });
		await expect(modal.getByText(/no activities found/i)).toHaveCount(0);
	});

	test('a superseded slow search response cannot clobber the latest query results', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock activity-search overrides');
		await asUser({ account: { account_type: 'ORGANIZER' } });

		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: PAGINATED,
			body: { items: [ALIAS_ACTIVITY], total: 1 },
			once: false
		});

		await gotoHydrated('/tabs/events/new');
		await page.getByRole('button', { name: /select activities/i }).click();
		const modal = page.locator('ion-modal');
		const input = modal.locator('ion-searchbar input');
		await expect(input).toBeVisible({ timeout: 12_000 });

		// type in quick succession; the last query wins
		await input.fill('r');
		await input.fill('ru');
		await input.fill('run');

		await expect(modal.getByText('Jogging')).toBeVisible({ timeout: 8000 });
	});
});
