import { expect, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

test.describe('Native OAuth deep-link completion', () => {
	test.beforeEach(async ({ context, asAnonymous }) => {
		await installNativeMock(context, { platform: 'ios' });
		await asAnonymous();
	});

	test('an oauth-complete deep link hydrates the session and lands in tabs', async ({
		page,
		gotoHydrated,
		mockApi,
		testId
	}) => {
		// seed the user the post-OAuth /v2/users/current fetch will resolve to,
		// bound to the token the deep link carries
		const token = `oauth-token-${testId}`;
		const user = { id: `oauth-user-${testId.slice(0, 8)}`, username: 'oauthuser' };
		await mockApi.registerUser({
			...user,
			full_name: 'OAuth User',
			account: { account_type: 'FREE', email_verified: true }
		});
		await mockApi.loginAs(user.id, token);

		await gotoHydrated('/login');

		// fire the universal-link the OS delivers after the provider sheet succeeds
		await page.evaluate((t) => {
			(window as any).__fireAppUrlOpen(
				`https://app.earth-app.com/oauth/complete?session_token=${t}&provider=github&context=login`
			);
		}, token);

		// the handler should setSessionToken + persist it; assert the token landed
		await expect
			.poll(async () => page.evaluate(() => (window as any).__prefs?.session_token), {
				timeout: 8000
			})
			.toBe(token);

		// and route us into the tabs shell (NOT bounce back to /login)
		await page.waitForURL(/\/tabs(\/|$)/, { timeout: 8000 }).catch(() => {});
		expect(page.url()).not.toMatch(/\/login(\?|$)/);
	});

	test('a token-less oauth error deep link routes back to the login form', async ({
		page,
		gotoHydrated
	}) => {
		await gotoHydrated('/login');
		await page.evaluate(() => {
			(window as any).__fireAppUrlOpen(
				'https://app.earth-app.com/oauth/complete?context=login&error=auth_failed'
			);
		});
		// no token => stays on / returns to the login form (does not crash into tabs)
		await page.waitForTimeout(1500);
		expect(page.url()).toMatch(/\/login/);
	});
});
