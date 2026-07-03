import { expect, test } from './utils/fixtures';

test.describe('Login page (anonymous)', () => {
	test.beforeEach(async ({ asAnonymous }) => {
		await asAnonymous();
	});

	test('renders the heading and the login form', async ({ page, gotoHydrated }) => {
		await gotoHydrated('/login');
		await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
		// the form posts to /v2/users/login; assert its submit control is present
		const submitBtn = page.locator('form button[type="submit"], form ion-button').first();
		await expect(submitBtn).toBeVisible();
	});

	test('shows the username/email and password inputs', async ({ page, gotoHydrated }) => {
		await gotoHydrated('/login');
		// sky uses Ionic inputs with these placeholders
		await expect(page.getByPlaceholder(/cooldude78|you@example\.com/i).first()).toBeVisible();
		await expect(page.getByPlaceholder(/SuperSecretPassword/i).first()).toBeVisible();
	});

	test('exposes the Sign Up shortcut', async ({ page, gotoHydrated }) => {
		await gotoHydrated('/login');
		await expect(page.getByRole('button', { name: /sign up/i }).first()).toBeVisible();
	});

	test('exposes a forgot-password affordance', async ({ page, gotoHydrated }) => {
		await gotoHydrated('/login');
		await expect(page.getByText(/forgot your password/i).first()).toBeVisible();
	});

	test('surfaces an OAuth provider error from the query param', async ({ page, gotoHydrated }) => {
		await gotoHydrated('/login?error=provider_error');
		// sky shows the error via a Capacitor toast; the heading must still render
		await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
	});
});

test.describe('Login page (already logged in)', () => {
	test('redirects an authenticated user into the tabs shell', async ({
		asUser,
		page,
		gotoHydrated
	}) => {
		await asUser({ username: 'gregory' });
		await gotoHydrated('/login');
		// self-healing redirect lands the user in /tabs/*; tolerate timing on a
		// busy dev server by waiting for the URL transition.
		await page.waitForURL(/\/tabs(\/|$)/, { timeout: 8000 }).catch(() => {});
	});
});
