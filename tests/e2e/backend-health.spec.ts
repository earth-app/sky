import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

/**
 * Force what the preflight sees. Intercepts in the browser rather than reprogramming the mock
 * server, so this exercises the real client path the app uses on device.
 */
async function serveInfo(page: Page, reply: { status: number; body?: unknown }) {
	await page.route('**/v2/info', async (route) => {
		if (reply.status >= 500) return route.fulfill({ status: reply.status, body: 'upstream error' });
		await route.fulfill({
			status: reply.status,
			contentType: 'application/json',
			body: JSON.stringify(reply.body ?? {})
		});
	});
}

// the whole point on mobile: a dead backend must not drop the user into an empty tab shell
test.describe('Backend health gate (native ios)', () => {
	test.beforeEach(async ({ context, asAnonymous }) => {
		skipIfIntegration();
		await installNativeMock(context, { platform: 'ios' });
		await asAnonymous();
	});

	test('a healthy backend leaves the launch path alone', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('#backend-gate')).toHaveCount(0);
	});

	test('maintenance holds the user on index and explains itself', async ({ page }) => {
		await serveInfo(page, { status: 200, body: { status: 'maintenance' } });
		await page.goto('/');

		const gate = page.locator('#backend-gate');
		await expect(gate).toBeVisible();
		await expect(gate).toContainText('Under Maintenance');

		// planned downtime offers status, not a support escalation
		await expect(gate.getByRole('button', { name: 'Check Status' })).toBeVisible();
		await expect(gate.getByRole('button', { name: 'Contact Support' })).toHaveCount(0);

		// never walked into the tab shell
		await expect(page).not.toHaveURL(/\/tabs\//);
	});

	test('a 5xx holds the user on index and offers status and support', async ({ page }) => {
		await serveInfo(page, { status: 503 });
		await page.goto('/');

		const gate = page.locator('#backend-gate');
		await expect(gate).toBeVisible();
		await expect(gate).toContainText("We can't reach The Earth App");
		await expect(gate.getByRole('button', { name: 'Check Status' })).toBeVisible();
		await expect(gate.getByRole('button', { name: 'Contact Support' })).toBeVisible();

		await expect(page).not.toHaveURL(/\/tabs\//);
	});

	// fail-open: an ambiguous answer must never strand the user on the launch screen
	test('a 404 on the preflight does not gate the app', async ({ page }) => {
		await serveInfo(page, { status: 404 });
		await page.goto('/');

		await expect(page.locator('#backend-gate')).toHaveCount(0);
	});

	test('recovering releases the gate without a relaunch', async ({ page }) => {
		await serveInfo(page, { status: 503 });
		await page.goto('/');
		await expect(page.locator('#backend-gate')).toBeVisible();

		await serveInfo(page, { status: 200, body: { status: 'active' } });
		await page.getByRole('button', { name: 'Try Again' }).click();

		await expect(page.locator('#backend-gate')).toHaveCount(0);
	});
});
