import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

test.describe('Username no-spaces rule', () => {
	test('signup rejects a username containing a space', async ({
		page,
		gotoHydrated,
		asAnonymous
	}) => {
		await asAnonymous();
		await gotoHydrated('/signup');

		await page.getByPlaceholder(/cooldude78/i).fill('foo bar');
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');

		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		await expect(page.getByText('Username cannot contain spaces').first()).toBeVisible({
			timeout: 10_000
		});
		// the spaced username must never reach the signup call / tabs shell
		expect(page.url()).not.toMatch(/\/tabs(\/|$)/);
		expect(page.url()).not.toMatch(/\/verify-email/);
	});

	test('profile editor blocks saving a spaced username (no PATCH fires)', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mutates the mock profile');
		await installNativeMock(context, { platform: 'ios' });
		await asUser({ username: 'cleanname', account: { email: 'cleanname@example.com' } });

		let patchFired = false;
		page.on('request', (req) => {
			if (req.method() === 'PATCH' && /\/v2\/users\/current(\?|$)/.test(req.url())) {
				patchFired = true;
			}
		});

		await gotoHydrated('/tabs/profile/editor');

		// webkit renders a hidden .cloned-input twin per ion-input; exclude it to stay single-match
		const usernameInput = page.locator(
			'input[placeholder="Enter your username"]:not(.cloned-input)'
		);
		await usernameInput.click();
		await usernameInput.fill('foo bar');

		await page.getByRole('button', { name: /Save Profile/i }).click();

		// the no-spaces guard surfaces a Capacitor toast and returns before the PATCH
		await expect
			.poll(() => page.evaluate(() => (window as any).__toasts ?? []), { timeout: 8_000 })
			.toContain('Username cannot contain spaces');
		expect(patchFired).toBe(false);
	});
});
