import { expect, test } from './utils/fixtures';

test.describe('Signup page (anonymous)', () => {
	test.beforeEach(async ({ asAnonymous }) => {
		await asAnonymous();
	});

	test('renders the heading, OAuth container, and the signup form', async ({
		page,
		gotoHydrated
	}) => {
		await gotoHydrated('/signup');
		// the page reuses id="signup" on both the h1 and the form, so target the heading
		await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible();
		await expect(page.locator('#signup-oauth')).toBeVisible();
		await expect(page.getByPlaceholder(/cooldude78/i)).toBeVisible();
		await expect(page.getByPlaceholder(/SuperSecretPassword/i)).toBeVisible();
	});

	test('creates an account with an email and routes to verify-email', async ({
		page,
		gotoHydrated
	}) => {
		await gotoHydrated('/signup');

		await page.getByPlaceholder(/me@example\.com/i).fill('newbie@example.com');
		await page.getByPlaceholder(/cooldude78/i).fill('newbie');
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');

		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		// email present => page navigates to the email verification screen
		await page.waitForURL(/\/verify-email/, { timeout: 10_000 });
	});

	test('surfaces an inline error when the username is already taken', async ({
		page,
		gotoHydrated
	}) => {
		await gotoHydrated('/signup');

		// no email so the flow would otherwise land on /tabs; the 409 short-circuits it
		await page.getByPlaceholder(/cooldude78/i).fill('taken');
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');

		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		// mantle 409 -> the form renders a UAlert about the username being taken (scope to the
		// form; a transient capacitor/pwa toast carries the same copy and trips strict mode)
		await expect(
			page
				.locator('#signup-form')
				.getByText(/already taken/i)
				.first()
		).toBeVisible({
			timeout: 10_000
		});
		// and we must NOT have navigated into the tabs shell
		expect(page.url()).not.toMatch(/\/tabs(\/|$)/);
	});
});
