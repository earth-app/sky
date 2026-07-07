import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// a fresh oauth signup lands on the dashboard and is offered an optional username change,
// pre-filled with the auto-generated (email-prefix) username.
test.describe('OAuth signup username onboarding step', () => {
	test.beforeEach(async ({ context, asAnonymous }) => {
		await installNativeMock(context, { platform: 'ios' });
		await asAnonymous();
	});

	async function completeOAuthSignup(page: any, mockApi: any, testId: string) {
		const token = `oauth-token-${testId}`;
		const user = {
			id: `oauth-user-${testId.slice(0, 8)}`,
			username: 'skyoauth',
			full_name: 'Sky OAuth',
			account: {
				account_type: 'FREE',
				username: 'skyoauth',
				email: 'skyoauth@example.com',
				email_verified: true
			}
		};
		await mockApi.registerUser(user);
		await mockApi.loginAs(user.id, token);

		await page.goto('/login');
		// fire the universal link the OS delivers after the provider sheet succeeds; context=signup
		await page.evaluate((t: string) => {
			(window as any).__fireAppUrlOpen(
				`https://app.earth-app.com/oauth/complete?session_token=${t}&provider=github&context=signup`
			);
		}, token);

		await page.waitForURL(/\/tabs(\/|$)/, { timeout: 10_000 }).catch(() => {});
		return { token, user };
	}

	test('shows the optional step with the email-prefix placeholder and PATCHes a new username', async ({
		page,
		mockApi,
		testId
	}) => {
		skipIfIntegration('native deep-link + mock session');
		await completeOAuthSignup(page, mockApi, testId);

		// the prompt opens on the dashboard once the pending flag is seen
		await expect(page.getByRole('heading', { name: 'Pick a Username' })).toBeVisible({
			timeout: 12_000
		});
		// placeholder == current auto username (email local-part); exclude webkit's hidden
		// .cloned-input twin so the locator stays single-match
		await expect(
			page.locator('ion-modal input[placeholder="skyoauth"]:not(.cloned-input)')
		).toBeVisible();

		const patchReq = page.waitForRequest(
			(req) => req.method() === 'PATCH' && /\/v2\/users\/current(\?|$)/.test(req.url())
		);

		const input = page.locator('ion-modal input[placeholder="skyoauth"]:not(.cloned-input)');
		await input.click();
		await input.fill('newpick');
		await page.getByRole('button', { name: 'Save Username' }).click();

		const req = await patchReq;
		expect(JSON.parse(req.postData() || '{}').username).toBe('newpick');

		// modal closes and the one-shot flag is cleared
		await expect(page.getByRole('heading', { name: 'Pick a Username' })).toBeHidden({
			timeout: 8_000
		});
		await expect
			.poll(() =>
				page.evaluate(() => (window as any).__prefs?.['sky:oauth-username-prompt-pending'])
			)
			.toBeFalsy();
	});

	test('can be skipped without firing a PATCH', async ({ page, mockApi, testId }) => {
		skipIfIntegration('native deep-link + mock session');
		await completeOAuthSignup(page, mockApi, testId);

		await expect(page.getByRole('heading', { name: 'Pick a Username' })).toBeVisible({
			timeout: 12_000
		});

		let patchFired = false;
		page.on('request', (req) => {
			if (req.method() === 'PATCH' && /\/v2\/users\/current(\?|$)/.test(req.url())) {
				patchFired = true;
			}
		});

		await page.getByRole('button', { name: 'Keep This Username' }).click();

		await expect(page.getByRole('heading', { name: 'Pick a Username' })).toBeHidden({
			timeout: 8_000
		});
		expect(patchFired).toBe(false);
		await expect
			.poll(() =>
				page.evaluate(() => (window as any).__prefs?.['sky:oauth-username-prompt-pending'])
			)
			.toBeFalsy();
	});
});
