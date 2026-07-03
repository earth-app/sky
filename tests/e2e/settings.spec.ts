import { expect, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

test.describe('Settings page (logged in)', () => {
	test.beforeEach(async ({ asUser }) => {
		await asUser();
	});

	test('renders the title and the core section headings', async ({ page, gotoHydrated }) => {
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('#settings')).toBeVisible();
		// section <h2> headings; "Appearence" is the app's spelling (tolerate both)
		await expect(page.getByRole('heading', { name: /Appearence|Appearance/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /Notifications/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /Account/i })).toBeVisible();
	});

	test('shows the Units select with a resolved imperial/metric value', async ({
		page,
		gotoHydrated
	}) => {
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		// the ion-select is labeled "Units"; assert the control is present and has
		// settled on one of the two allowed values (overlay-driven option changes
		// are intentionally not exercised - see file header)
		// ionic doesn't reflect aria-label to an html attr, so target the select by its
		// stable per-key id
		const unitsSelect = page.locator('#setting-units').first();
		await expect(unitsSelect).toBeVisible();
		// ionic keeps the select value as a JS property (model-value), not an html attr
		await expect
			.poll(async () => (await unitsSelect.evaluate((el: any) => el.value ?? '')) as string, {
				timeout: 6000
			})
			.toMatch(/imperial|metric/i);
	});

	test('flips the Animations toggle when tapped', async ({ page, gotoHydrated }) => {
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		const toggle = page.locator('ion-toggle', { hasText: /Animations/i }).first();
		await expect(toggle).toBeVisible();
		const before = await toggle.getAttribute('aria-checked');
		await toggle.click();
		await expect
			.poll(async () => toggle.getAttribute('aria-checked'), { timeout: 6000 })
			.not.toBe(before);
	});

	test('navigates to the API Keys sub-page from the Account link', async ({
		page,
		gotoHydrated
	}) => {
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		// the "API Keys" row is a link rendered as a router-link button with an arrow icon
		// (icon-only, so target the button by its stable per-title id)
		const apiKeysBtn = page.locator('#setting-link-api-keys');
		await expect(apiKeysBtn).toBeVisible({ timeout: 12_000 });
		await apiKeysBtn.click();
		await page.waitForURL(/\/tabs\/settings\/api-keys/, { timeout: 8000 });
		await expect(page.getByText(/API Keys/i).first()).toBeVisible();
	});
});
