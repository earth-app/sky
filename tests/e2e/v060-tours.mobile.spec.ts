import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

function tourDialog(page: Page) {
	return page.locator('[role="dialog"][aria-labelledby="site-tour-title"]');
}

// step through a tour to completion by clicking Next/Finish until the card closes
async function completeTour(page: Page): Promise<void> {
	const dialog = tourDialog(page);
	await expect(dialog).toBeVisible({ timeout: 20000 });
	for (let i = 0; i < 10 && (await dialog.isVisible()); i++) {
		await dialog.locator('[data-tour-next]').click();
		await page.waitForTimeout(600);
	}
	await expect(dialog).toBeHidden({ timeout: 8000 });
}

test.describe('v0.6.0 SiteTours - auto-play, advance, complete, persist (mobile)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('the trails tour auto-plays, advances step by step, and completes', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('drives a fresh-user auto-play tour');
		await asUser({ username: 'trailtourer' });

		await gotoTab(page, gotoHydrated, '/tabs/trails');
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 20000 });
		await expect(dialog.getByRole('heading', { name: 'Curiosity Trails' })).toBeVisible({
			timeout: 20000
		});
		// the step counter proves it advances through the multi-step tour
		await expect(dialog.getByText(/Step 1 of \d+/)).toBeVisible();
		await dialog.locator('[data-tour-next]').click();
		await expect(dialog.getByText(/Step 2 of \d+/)).toBeVisible({ timeout: 8000 });
		// completeTour asserts the card closes on Finish
		await completeTour(page);
	});

	test('the trailmarks tour auto-plays and completes', async ({ page, asUser, gotoHydrated }) => {
		skipIfIntegration('drives a fresh-user auto-play tour');
		await asUser({ username: 'marktourer' });

		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 20000 });
		await expect(dialog.getByRole('heading', { name: 'Trailmarks Nearby' })).toBeVisible({
			timeout: 20000
		});
		await completeTour(page);
	});

	test('the shared-garden tour auto-plays and completes', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('drives a fresh-user auto-play tour');
		await asUser({ username: 'gardentourer' });

		await gotoTab(page, gotoHydrated, '/tabs/circle');
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 20000 });
		await expect(dialog.getByRole('heading', { name: 'Your Shared Garden' })).toBeVisible({
			timeout: 20000
		});
		await completeTour(page);
	});

	test('the tour button replays a tour on demand even after it was completed', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('drives an on-demand tour replay');
		await asUser({ username: 'replayer' });

		await gotoTab(page, gotoHydrated, '/tabs/trails');
		// dismiss the auto-play first
		await completeTour(page);

		// the MTourButton (aria-label "Show Guided Tour") always restarts the tour
		await page.getByRole('button', { name: 'Show Guided Tour' }).first().click();
		await expect(tourDialog(page)).toBeVisible({ timeout: 12000 });
		await expect(tourDialog(page).getByRole('heading', { name: 'Curiosity Trails' })).toBeVisible();
	});
});
