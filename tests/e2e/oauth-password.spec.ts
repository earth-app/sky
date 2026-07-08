import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

const NEW_PASSWORD = 'BrandNewPassword_1';

function makeOAuthUser(testId: string): Record<string, any> {
	return {
		id: `oap-${testId.slice(0, 8)}`,
		username: `oauth-${testId.slice(0, 6)}`,
		full_name: 'OAuth User',
		account: {
			account_type: 'FREE',
			email_verified: true,
			has_password: true,
			linked_providers: ['github']
		}
	};
}

// read the live pinia auth identity (token presence + the resolved current user)
async function readAuthIdentity(
	page: Page
): Promise<{ hasToken: boolean; id: string | null; username: string | null }> {
	return page.evaluate(() => {
		const auth = (window as any).useNuxtApp?.().$pinia?.state?.value?.auth;
		const u = auth?.currentUser;
		return { hasToken: !!auth?.sessionToken, id: u?.id ?? null, username: u?.username ?? null };
	});
}

async function getToasts(page: Page): Promise<string[]> {
	try {
		return (await page.evaluate(() => (window as any).__toasts ?? [])) as string[];
	} catch {
		return [];
	}
}

// no user-facing toast may leak a raw transport code / api path (the "Sky error formatting" bar)
async function expectNoRawApiToast(page: Page): Promise<void> {
	for (const t of await getToasts(page)) {
		expect(t, `toast leaked a bracketed status code: ${t}`).not.toMatch(/\[\d{3}\]/);
		expect(t, `toast leaked a raw api path: ${t}`).not.toMatch(/\/v2\//);
	}
}

// in-SPA navigation that preserves the live session (a reload would drop the in-memory token)
async function pushInApp(page: Page, path: string): Promise<void> {
	await page.evaluate((p) => (window as any).useNuxtApp?.().$router?.push(p), path);
}

// drive the exact oauth-complete deep link the OS delivers after the provider sheet succeeds and
// assert we land authenticated as the seeded user with the token persisted (bug class C)
async function completeOAuthLogin(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>,
	mockApi: any,
	testId: string
): Promise<{ user: Record<string, any>; token: string }> {
	const token = `oauth-token-${testId}`;
	const user = makeOAuthUser(testId);
	await mockApi.registerUser(user);
	await mockApi.loginAs(user.id, token);

	await gotoHydrated('/login');
	await page.evaluate((t) => {
		(window as any).__fireAppUrlOpen(
			`https://app.earth-app.com/oauth/complete?session_token=${t}&provider=github&context=login`
		);
	}, token);

	// the token lands in durable Preferences (the OAuth-session-token-persistence seam)
	await expect
		.poll(() => page.evaluate(() => (window as any).__prefs?.session_token), { timeout: 10_000 })
		.toBe(token);
	// routed into the tabs shell, not bounced back to the login form
	await page.waitForURL(/\/tabs(\/|$)/, { timeout: 10_000 }).catch(() => {});
	expect(page.url()).not.toMatch(/\/login(\?|$)/);
	// and hydrated as the RIGHT user (not a null/anonymous stub)
	await expect
		.poll(() => readAuthIdentity(page).then((a) => a.username), { timeout: 12_000 })
		.toBe(user.username);

	return { user, token };
}

// the open change-password modal (scoped so we skip the editor's button that only opens it)
function pwModal(page: Page) {
	return page
		.locator('ion-modal')
		.filter({ has: page.locator('input[placeholder="New Password"]') });
}

async function openChangePasswordModal(page: Page): Promise<void> {
	await expect(page.getByText(/Edit Profile/i).first()).toBeVisible({ timeout: 15_000 });
	await page.locator('#password-change ion-button').first().click();
	await expect(
		page.locator('input[placeholder="New Password"]:not(.cloned-input)').first()
	).toBeVisible({ timeout: 12_000 });
}

async function fillChangePassword(
	page: Page,
	current: string,
	next: string,
	confirm: string
): Promise<void> {
	await page
		.locator('input[placeholder="Current Password"]:not(.cloned-input)')
		.first()
		.fill(current);
	await page.locator('input[placeholder="New Password"]:not(.cloned-input)').first().fill(next);
	await page
		.locator('input[placeholder="Confirm New Password"]:not(.cloned-input)')
		.first()
		.fill(confirm);
}

// log out through the real Settings action, but drop the mock's server-side session first so the
// post-logout current-user read can't re-resolve this test's sticky identity and bounce us back
async function logOutViaSettings(page: Page, mockApi: any, token: string): Promise<void> {
	await pushInApp(page, '/tabs/settings');
	const logoutBtn = page.getByRole('button', { name: 'Log Out' }).first();
	await expect(logoutBtn).toBeVisible({ timeout: 12_000 });

	await mockApi.loginAs(null, token);
	await logoutBtn.scrollIntoViewIfNeeded().catch(() => {});
	await logoutBtn.click();

	await page.waitForURL(/\/login(\?|$)/, { timeout: 15_000 });
	// the store + durable Preferences token are both cleared (not a half-logged-in shell)
	await expect
		.poll(() => readAuthIdentity(page).then((a) => a.hasToken), { timeout: 12_000 })
		.toBe(false);
	await expect
		.poll(() => page.evaluate(() => (window as any).__prefs?.session_token), { timeout: 12_000 })
		.toBeFalsy();
}

async function submitLogin(page: Page, identifier: string, password: string): Promise<void> {
	const user = page.locator('form#login input[autocomplete="username"]:not(.cloned-input)').first();
	await expect(user).toBeVisible({ timeout: 12_000 });
	await user.fill(identifier);
	await page
		.locator('form#login input[autocomplete="current-password"]:not(.cloned-input)')
		.first()
		.fill(password);
	// ionic doesn't reflect type onto the ion-button host; the login form's lone ion-button is submit
	await page.locator('form#login ion-button').first().click();
}

test.describe('OAuth login -> change password -> re-login journey (native ios)', () => {
	test.beforeEach(async ({ context }) => {
		// the oauth-complete handler, the token-mirror watcher, and the durable Preferences store all
		// require isNativePlatform()=true plus the in-memory __prefs + CapacitorHttp shim in the mock
		await installNativeMock(context, { platform: 'ios' });
	});

	test('completes an OAuth login, changes the password, and signs back in with the new one', async ({
		page,
		asAnonymous,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + oauth deep link + change password');
		await asAnonymous();

		// 1) mobile OAuth login lands authenticated in /tabs as the right user (bug class C)
		const { user, token } = await completeOAuthLogin(page, gotoHydrated, mockApi, testId);

		// 2) open the editor's change-password modal (in-SPA so the session stays live)
		await pushInApp(page, '/tabs/profile/editor');
		await openChangePasswordModal(page);

		// 3) submit a new password; assert the request shape/endpoint then the success toast.
		// old_password is 'wrongpassword' (the mock only rejects old_password === 'wrong', so this
		// still succeeds) so the SAME string can be re-tried as a now-stale password below
		await fillChangePassword(page, 'wrongpassword', NEW_PASSWORD, NEW_PASSWORD);
		const reqP = page.waitForRequest(
			(r) => r.method() === 'POST' && /\/v2\/users\/current\/change_password/.test(r.url()),
			{ timeout: 15_000 }
		);
		await pwModal(page)
			.getByRole('button', { name: /Change Password/i })
			.click();
		const req = await reqP;
		expect(req.url()).toContain('old_password=wrongpassword');
		const body = req.postData() ?? '';
		expect(body).toContain('new_password');
		expect(body).toContain(NEW_PASSWORD);
		await expectNativeToast(page, /password changed successfully/i);
		await expectNoRawApiToast(page);

		// 4) log out from Settings -> back on the login form, token cleared everywhere
		await logOutViaSettings(page, mockApi, token);

		// 5) sign back in with the NEW password -> authenticated again as the same user
		await mockApi.loginAs(user.id);
		await submitLogin(page, user.username, NEW_PASSWORD);
		await page.waitForURL(/\/tabs(\/|$)/, { timeout: 15_000 });
		await expect
			.poll(() => readAuthIdentity(page).then((a) => a.username), { timeout: 12_000 })
			.toBe(user.username);
		expect((await readAuthIdentity(page)).id).toBe(user.id);
	});

	test('after the change the old password no longer authenticates on re-login', async ({
		page,
		asAnonymous,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + oauth deep link + stale-credential re-login');
		await asAnonymous();

		const { user, token } = await completeOAuthLogin(page, gotoHydrated, mockApi, testId);

		await pushInApp(page, '/tabs/profile/editor');
		await openChangePasswordModal(page);
		await fillChangePassword(page, 'wrongpassword', NEW_PASSWORD, NEW_PASSWORD);
		await pwModal(page)
			.getByRole('button', { name: /Change Password/i })
			.click();
		await expectNativeToast(page, /password changed successfully/i);

		await logOutViaSettings(page, mockApi, token);
		await mockApi.loginAs(user.id);

		// the OLD password ('wrongpassword') is rejected with a formatted message (never a raw [401])
		// and we stay on the login form
		await submitLogin(page, user.username, 'wrongpassword');
		await expectNativeToast(page, /invalid username or password/i);
		await expectNoRawApiToast(page);
		await expect(page).toHaveURL(/\/login/);

		// the NEW password still works, proving the change took and the form recovered
		await page
			.locator('form#login input[autocomplete="current-password"]:not(.cloned-input)')
			.first()
			.fill(NEW_PASSWORD);
		// ionic doesn't reflect type onto the ion-button host; the login form's lone ion-button is submit
		await page.locator('form#login ion-button').first().click();
		await page.waitForURL(/\/tabs(\/|$)/, { timeout: 15_000 });
		await expect
			.poll(() => readAuthIdentity(page).then((a) => a.username), { timeout: 12_000 })
			.toBe(user.username);
	});

	test('an incorrect current password is rejected with a formatted error and keeps the form open', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + change-password 401');
		// this guards the change FORM itself (auth-method agnostic), so asUser is enough - no oauth
		// ceremony; asUser re-seeds the token on each nav so the editor reload restores the session
		const user = await asUser({ username: 'pwedit' });

		await gotoTab(page, gotoHydrated, '/tabs/profile/editor');
		await openChangePasswordModal(page);

		// old_password === 'wrong' makes the mock return 401 { message: 'Old password incorrect' };
		// the request layer must surface that human reason, not a bracketed [401]
		await fillChangePassword(page, 'wrong', NEW_PASSWORD, NEW_PASSWORD);
		await pwModal(page)
			.getByRole('button', { name: /Change Password/i })
			.click();

		await expectNativeToast(page, /old password incorrect/i);
		await expectNoRawApiToast(page);
		// the inline error echoes the reason and the modal stays open so the user can retry
		await expect(page.getByText(/old password incorrect/i).first()).toBeVisible({ timeout: 8_000 });
		await expect(
			page.locator('input[placeholder="New Password"]:not(.cloned-input)').first()
		).toBeVisible();
		expect(user.username).toBe('pwedit');
	});

	test('a mismatched confirmation is caught client-side and never reaches the server', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + client-side change-password validation');
		await asUser({ username: 'pwmm' });

		// no change_password mutation may fire when the two new-password fields disagree
		let changeRequests = 0;
		page.on('request', (r) => {
			if (r.method() === 'POST' && /\/v2\/users\/current\/change_password/.test(r.url()))
				changeRequests++;
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/editor');
		await openChangePasswordModal(page);

		await fillChangePassword(page, 'wrongpassword', NEW_PASSWORD, 'MismatchPassword_2');
		await pwModal(page)
			.getByRole('button', { name: /Change Password/i })
			.click();

		await expect(page.getByText(/do not match/i).first()).toBeVisible({ timeout: 8_000 });
		// the guard is purely client-side: nothing hit the network and the modal stayed open
		await page.waitForTimeout(800);
		expect(changeRequests, 'a validation failure must not POST to change_password').toBe(0);
		await expect(
			page.locator('input[placeholder="New Password"]:not(.cloned-input)').first()
		).toBeVisible();
	});
});
