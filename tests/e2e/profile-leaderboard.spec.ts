import { expect, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

const POINTS_ROWS = [
	{ id: 'test-user-1', streak: 1500 },
	{ id: 'author-1', streak: 1200 },
	{ id: 'host-1', streak: 900 },
	{ id: 'writer-1', streak: 600 },
	{ id: 'admin-user-1', streak: 300 }
];

const JOURNEY_ROWS = [
	{ id: 'author-1', streak: 12 },
	{ id: 'host-1', streak: 8 },
	{ id: 'writer-1', streak: 5 }
];

test.describe('Profile leaderboard', () => {
	test('points leaderboard renders the hero and ranked rows', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'lbviewer' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/api\/user\/leaderboard\b/,
			status: 200,
			body: POINTS_ROWS
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/leaderboard/points');

		await expect(page.locator('#leaderboard-hero')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByRole('heading', { name: /points leaderboard/i })).toBeVisible({
			timeout: 12_000
		});
		// each row fans out to a seeded user card; assert on visible seeded usernames
		await expect(page.getByText(/@author/i).first()).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText(/@host/i).first()).toBeVisible();
	});

	test('article (journey) leaderboard renders streak rows', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'lbviewer' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/api\/user\/leaderboard\b/,
			status: 200,
			body: JOURNEY_ROWS
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/leaderboard/article');

		await expect(page.locator('#leaderboard-hero')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByRole('heading', { name: /articles leaderboard/i })).toBeVisible({
			timeout: 12_000
		});
		await expect(page.getByText(/@author/i).first()).toBeVisible({ timeout: 15_000 });
	});

	test('invalid metric falls back to the loading state', async ({ page, gotoHydrated, asUser }) => {
		await asUser({ username: 'lbviewer' });
		await gotoTab(page, gotoHydrated, '/tabs/profile/leaderboard/not-a-metric');

		// no valid metric -> the <Loading /> fallback renders inside the hero, and
		// the metric-specific heading never appears
		await expect(page.locator('#leaderboard-hero')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByRole('heading', { name: /leaderboard \(showing/i })).toHaveCount(0);
	});
});
