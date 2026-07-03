import { expect, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

test.describe('Settings sub-pages (logged in, empty state)', () => {
	test.beforeEach(async ({ asUser }) => {
		await asUser();
	});

	test('API Keys page renders its title and empty state', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		// fetchKeys() -> /v2/users/current/api-keys ; fetchCatalog() -> /v2/api-keys/scopes
		await mockApi.setMany([
			{
				method: 'GET',
				path: '/v2/users/current/api-keys',
				body: { items: [], count: 0, active: 0, max: 5 },
				once: false
			},
			{
				method: 'GET',
				path: '/v2/api-keys/scopes',
				body: {
					name: { min: 3, max: 64 },
					description: { max: 512 },
					scopes: {},
					expiry_presets: {}
				},
				once: false
			}
		]);

		await gotoTab(page, gotoHydrated, '/tabs/settings/api-keys');
		await expect(page.getByText(/API Keys/i).first()).toBeVisible();
		await expect(page.getByText(/No API Keys Yet/i)).toBeVisible({ timeout: 10_000 });
	});

	test('Blocked Users page renders its title and empty state', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		// fetchBlocked() -> /v2/users/current/blocked
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current/blocked',
			body: { items: [], total: 0 },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/settings/blocked-users');
		await expect(page.getByText(/Blocked Users/i).first()).toBeVisible();
		await expect(page.getByText(/No blocked users/i)).toBeVisible({ timeout: 10_000 });
	});

	test('My Words page renders its title and empty state', async ({ page, gotoHydrated }) => {
		// saved words are device-local (useSavedWords); starts empty, no override needed
		await gotoTab(page, gotoHydrated, '/tabs/settings/words');
		await expect(page.getByText(/My Words/i).first()).toBeVisible();
		await expect(page.getByText(/No saved words yet/i)).toBeVisible({ timeout: 10_000 });
	});

	test('Moderation Status page renders its title and good-standing state', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		// fetchModeration() -> /v2/users/current/moderation
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current/moderation',
			body: {
				count: 0,
				cycles: 0,
				banned: false,
				updated_at: 0,
				strikes_remaining: 3,
				standing: 'ok',
				history: []
			},
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/settings/moderation');
		await expect(page.getByText(/Moderation Status/i).first()).toBeVisible();
		await expect(page.getByText(/All clear/i)).toBeVisible({ timeout: 10_000 });
	});
});
