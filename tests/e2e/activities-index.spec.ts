import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

const CONTENT = 'ion-content:has(#activities-header)';

test.describe('Activities index', () => {
	test('the bare /tabs/activities route renders a catalog instead of 404', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the mock activity catalog');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/activities');

		await expect(page.locator('#activities-header')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/Page not found/i)).toHaveCount(0);
		await expect
			.poll(() => page.locator(`${CONTENT} #activity-list ion-card`).count(), { timeout: 12_000 })
			.toBeGreaterThan(0);
	});

	test('search narrows the catalog', async ({ page, gotoHydrated, asUser, mockApi }) => {
		skipIfIntegration('depends on the mock activity catalog');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/activities');
		await expect(page.locator('#activities-header')).toBeVisible({ timeout: 12_000 });

		const before = await page.locator(`${CONTENT} #activity-list ion-card`).count();
		expect(before).toBeGreaterThan(1);

		await page.locator('#activity-search input').first().fill('Activity 1');
		await expect
			.poll(() => page.locator(`${CONTENT} #activity-list ion-card`).count(), { timeout: 12_000 })
			.toBeLessThan(before);
		expect(mockApi).toBeTruthy();
	});

	test('shows the groups gathered around an activity on its detail page', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the mock expeditions endpoint');
		await asUser();
		await gotoHydrated('/tabs/activities/act-1');

		const block = page.locator('#activity-expeditions');
		await expect(block).toBeVisible({ timeout: 12_000 });
		await expect(block).toContainText('Dawn Chorus Group');
		await expect(block).toContainText('25%');
		await expect(block).toContainText('minutes outside');
	});

	test('the surprise draw returns an activity and re-rolls to a different one', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the mock surprise endpoint');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/activities');

		const card = page.locator('#activity-surprise');
		await expect(card).toBeVisible({ timeout: 12_000 });

		await card.getByRole('button', { name: /Surprise Me|Draw Another/i }).click();
		const first = await card.locator('ion-card').first().innerText();
		expect(first.trim().length).toBeGreaterThan(0);

		await card.getByRole('button', { name: /Draw Another/i }).click();
		await expect
			.poll(async () => (await card.locator('ion-card').first().innerText()).trim(), {
				timeout: 12_000
			})
			.not.toBe(first.trim());
	});
});
