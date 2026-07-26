import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

const SETTINGS_ROW = '#setting-link-verified-publisher';

test.describe('verified publisher settings', () => {
	test('the row is visible for an organizer', async ({ asUser, page, gotoHydrated }) => {
		skipIfIntegration('verified publisher is mock-only');
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await gotoTab(page, gotoHydrated, '/tabs/settings');

		await expect(page.locator(SETTINGS_ROW)).toBeVisible({ timeout: 15_000 });
	});

	test('the row is absent for a free account', async ({ asUser, page, gotoHydrated }) => {
		skipIfIntegration('verified publisher is mock-only');
		await asUser({ account: { account_type: 'FREE' } });
		await gotoTab(page, gotoHydrated, '/tabs/settings');

		await expect(page.locator(SETTINGS_ROW)).toHaveCount(0);
	});

	test('navigating in shows the page with a back button to settings', async ({
		asUser,
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('verified publisher is mock-only');
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await gotoTab(page, gotoHydrated, '/tabs/settings/verified-publisher');

		await expect(page.getByText('Verified Publisher').first()).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('ion-back-button')).toHaveAttribute('default-href', '/tabs/settings');
	});

	test('client-side validation blocks a short reason without a network call', async ({
		asUser,
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('verified publisher is mock-only');
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await gotoTab(page, gotoHydrated, '/tabs/settings/verified-publisher');

		const requests: string[] = [];
		page.on('request', (req) => {
			if (req.url().includes('/verified_publisher') && req.method() === 'POST') {
				requests.push(req.url());
			}
		});

		await page.locator('ion-textarea input, ion-textarea textarea').first().fill('too short');
		await page.locator('ion-checkbox').first().click();
		await page.locator('[data-testid="verified-publisher-submit"]').click();

		await expect(page.getByText(/at least 40 characters/i)).toBeVisible({ timeout: 10_000 });
		expect(requests).toHaveLength(0);
	});

	test('a valid application submits and flips to under review', async ({
		asUser,
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('verified publisher is mock-only');
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await gotoTab(page, gotoHydrated, '/tabs/settings/verified-publisher');

		await page
			.locator('ion-textarea input, ion-textarea textarea')
			.first()
			.fill('We organize weekly trail runs for a 400 member community across the bay area.');
		await page.locator('ion-input input').nth(2).fill('trail running, bouldering');
		await page.locator('ion-checkbox').first().click();

		const response = page.waitForResponse(
			(res) =>
				res.url().includes('/v2/users/current/verified_publisher') &&
				res.request().method() === 'POST'
		);
		await page.locator('[data-testid="verified-publisher-submit"]').click();
		await response;

		await expect(page.getByText(/Under Review/i)).toBeVisible({ timeout: 10_000 });
	});

	test('an approved publisher sees the verified chip', async ({
		asUser,
		page,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('verified publisher is mock-only');
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current/verified_publisher',
			body: { state: 'approved', verified: true, reviewed_at: '2026-05-21T12:00:00.000Z' }
		});
		await gotoTab(page, gotoHydrated, '/tabs/settings/verified-publisher');

		await expect(page.locator('ion-chip').getByText(/Verified Publisher/i)).toBeVisible({
			timeout: 15_000
		});
	});

	test('a denied applicant cannot re-apply until the cooldown passes', async ({
		asUser,
		page,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('verified publisher is mock-only');
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current/verified_publisher',
			body: {
				state: 'denied',
				verified: false,
				notes: 'Please add more detail about your community.',
				can_reapply_at: new Date(Date.now() + 30 * 86400_000).toISOString()
			}
		});
		await gotoTab(page, gotoHydrated, '/tabs/settings/verified-publisher');

		await expect(page.getByText(/Please add more detail/i)).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole('button', { name: /Apply Again/i })).toBeDisabled();
	});
});
