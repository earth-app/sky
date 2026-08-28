import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

const PLAN = 'If I close this app, then I will walk one loop around the block.';

test.describe('If-then plan', () => {
	test('links one cue to one response and shows the plan exactly once', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the mock plan endpoints');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/activities');

		const card = page.locator('#user-plan');
		await expect(card).toBeVisible({ timeout: 12_000 });
		await expect(card).toContainText('Make One Plan');

		await card.locator('#plan-start').click();

		// the app writes both halves; the user only links them
		await expect(card).toContainText('When', { timeout: 12_000 });
		await expect(card).toContainText('Then I Will');
		await expect(card.locator('ion-radio')).toHaveCount(4);

		await card.locator('#plan-submit').click();

		await expect(card.locator('#plan-sentence')).toContainText(PLAN, { timeout: 12_000 });

		await card.locator('#plan-rehearse').click();

		// shown once, then gone: a re-readable plan is the weaker condition
		await expect(card.locator('#plan-active')).toBeVisible({ timeout: 12_000 });
		await expect(card).not.toContainText(PLAN);
		await expect(card).toContainText('One Plan Running');
	});

	test('a running plan is never reprinted after a reload', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the mock plan endpoints');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/activities');

		const card = page.locator('#user-plan');
		await expect(card).toBeVisible({ timeout: 12_000 });
		await card.locator('#plan-start').click();
		await expect(card).toContainText('Then I Will', { timeout: 12_000 });
		await card.locator('#plan-submit').click();
		await expect(card.locator('#plan-sentence')).toBeVisible({ timeout: 12_000 });
		await card.locator('#plan-rehearse').click();
		await expect(card.locator('#plan-active')).toBeVisible({ timeout: 12_000 });

		await gotoTab(page, gotoHydrated, '/tabs/activities');

		const reloaded = page.locator('#user-plan');
		await expect(reloaded.locator('#plan-active')).toBeVisible({ timeout: 12_000 });
		await expect(reloaded).not.toContainText(PLAN);
		await expect(reloaded.locator('#plan-start')).toHaveCount(0);
	});
});
