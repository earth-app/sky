/**
 * Recent-badges showcase (dashboard) populates on first load.
 *
 * Regression guard for the "Recent Badges" card appearing late (only after a refresh
 * or another interaction). The showcase force-fetches badges eagerly on mount so a
 * recently-granted badge renders on the first dashboard paint instead of after a
 * stale-cache replay. See MBadgeShowcase.vue + crust userStore.fetchBadges(force).
 */

import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeBadge } from './utils/mock-data';

test.describe('Recent badges showcase', () => {
	test('renders the seeded recent badge on first dashboard load', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on a seeded recent badge + mock backend');
		await asUser();

		// seed a badge granted just now so it falls inside the 7-day window; once:false so
		// every badges fetch (showcase force + dashboard deferred) sees it, not just the first
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/badges\/?$/,
			once: false,
			body: [
				makeBadge({
					id: 'b-recent',
					name: 'Trailblazer',
					granted: true,
					granted_at: new Date().toISOString()
				})
			]
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// the card only mounts when there IS a recent granted badge -> proves it populated
		await expect(page.getByText('Recent Badges')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText('last 7 days')).toBeVisible({ timeout: 12_000 });
	});

	test('hides the showcase when no badge was granted in the last 7 days', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on the mock backend');
		await asUser();

		// granted long ago -> outside the window -> optional card stays hidden (no empty flash)
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/badges\/?$/,
			once: false,
			body: [
				makeBadge({
					id: 'b-old',
					name: 'Ancient',
					granted: true,
					granted_at: '2020-01-01T00:00:00.000Z'
				})
			]
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// wait for the shell, then assert the optional card never appears
		await page.waitForTimeout(1500);
		await expect(page.getByText('Recent Badges')).toHaveCount(0);
	});
});
