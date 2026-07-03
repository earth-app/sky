import { expect, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

test.describe('Verify email page (unverified user)', () => {
	test.beforeEach(async ({ context, asUser }) => {
		await installNativeMock(context, { platform: 'android' });
		await asUser({ account: { email_verified: false, email: 'unverified@example.com' } });
	});

	test('renders the code entry UI', async ({ page, gotoHydrated }) => {
		await gotoHydrated('/verify-email');
		await expect(page.getByText(/Email Verification/i).first()).toBeVisible({ timeout: 10_000 });
		await expect(page.getByPlaceholder(/12345678/i)).toBeVisible();
		await expect(page.getByRole('button', { name: /^Verify$/i })).toBeVisible();
	});

	test('accepts a valid code and navigates to the profile editor', async ({
		page,
		gotoHydrated
	}) => {
		await gotoHydrated('/verify-email');

		const codeInput = page.getByPlaceholder(/12345678/i);
		await codeInput.click();
		await codeInput.fill('12345678');
		await page.getByRole('button', { name: /^Verify$/i }).click();

		// 204 -> onEmailVerified() routes to the profile editor
		await page.waitForURL(/\/tabs\/profile\/editor/, { timeout: 10_000 });
	});

	test('surfaces an inline error when the code is rejected', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		await mockApi.set({
			method: 'POST',
			path: '/v2/users/current/verify_email',
			status: 400,
			body: { message: 'Invalid verification code' },
			once: false
		});

		await gotoHydrated('/verify-email');

		const codeInput = page.getByPlaceholder(/12345678/i);
		await codeInput.click();
		await codeInput.fill('99999999');
		await page.getByRole('button', { name: /^Verify$/i }).click();

		// stays on the page and shows the danger message
		await expect(page.getByText(/incorrect|invalid/i).first()).toBeVisible({ timeout: 10_000 });
		expect(page.url()).toMatch(/\/verify-email/);
	});
});
