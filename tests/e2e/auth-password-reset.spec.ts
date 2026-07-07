import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

test.describe('Forgot password page (anonymous)', () => {
	test.beforeEach(async ({ context, asAnonymous }) => {
		await installNativeMock(context, { platform: 'android' });
		await asAnonymous();
	});

	test('renders the form and confirms the reset link was sent', async ({ page, gotoHydrated }) => {
		await gotoHydrated('/forgot-password');
		await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible({ timeout: 10_000 });

		await page.getByPlaceholder(/you@example\.com/i).fill('you@example.com');
		await page.getByRole('button', { name: /Send Reset Link/i }).click();

		// generic anti-enumeration confirmation toast
		await expectNativeToast(page, /reset link is on its way|if an account exists/i);
	});
});

test.describe('Reset password page (anonymous)', () => {
	test.beforeEach(async ({ context, asAnonymous }) => {
		await installNativeMock(context, { platform: 'android' });
		await asAnonymous();
	});

	test('shows the invalid-link state when uid/token are missing', async ({
		page,
		gotoHydrated
	}) => {
		await gotoHydrated('/reset-password');
		await expect(page.getByText(/Reset Link Invalid/i)).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: /Request a New Link/i })).toBeVisible();
	});

	test('accepts a new password on a valid link and returns to login', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('valid reset link needs a real backend token');
		// reset submits to /v2/users/<uid>/change_password (per-id, not the /current route)
		await mockApi.set({
			method: 'POST',
			path: '/v2/users/test-user-1/change_password',
			status: 204,
			body: '',
			once: false
		});

		await gotoHydrated('/reset-password?uid=test-user-1&token=abc');
		await expect(page.getByText(/Choose a New Password/i)).toBeVisible({ timeout: 10_000 });

		const pwInputs = page.locator('#reset-password ion-input input:not(.cloned-input)');
		await expect(pwInputs.first()).toBeVisible({ timeout: 12_000 });
		await pwInputs.nth(0).fill('BrandNewPassword_1');
		await pwInputs.nth(1).fill('BrandNewPassword_1');

		await page.getByRole('button', { name: /^Reset Password$/i }).click();

		// success routes back to the login screen
		await page.waitForURL(/\/login/, { timeout: 10_000 });
	});
});
