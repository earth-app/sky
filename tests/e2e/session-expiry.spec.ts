/**
 * Session-expiry + mid-session 401 handling (native ios mock).
 *
 * auth-cold-launch.spec.ts already covers a COLD 401 on current-user (persistent 401 at boot
 * tears the session down). THIS suite proves the ALREADY-LOGGED-IN case: a valid session that
 * hits a 401 mid-flight must never wedge a half-logged-in shell. The app has to either clear
 * auth cleanly or surface a human-readable error through the toast pipeline - never a raw
 * `[401] /v2/...` string (project memory "Sky error formatting").
 *
 * Two teardown paths exist and are both exercised:
 *   (1) crust authStore.fetchCurrentUser(force) -> plain $fetch throws on 401 -> catch clears
 *       sessionToken + currentUser (node_modules/@earth-app/crust/src/stores/auth.ts).
 *   (4) sky repairCurrentUser -> CapacitorHttp GET /v2/users/current -> 401/403 clears
 *       sessionToken + currentUser (src/app.vue ~635-639), driven by the `token && !current`
 *       watcher; the native-mock CapacitorHttp shim routes it through fetch carrying x-test-id.
 *
 * When the store token goes null the token-mirror watcher (src/app.vue ~448) removes both the
 * localStorage and @capacitor/preferences `session_token`, so we assert the mocked Preferences
 * key clears too. NOTE we assert the cleared state IN PLACE rather than a /login redirect: the
 * asUser fixture re-seeds localStorage `session_token` via an init script on every navigation,
 * so a fresh navigate would re-hydrate the token - the honest mid-session behavior is an
 * immediate anonymous clear, which is what we check.
 *
 * Runs on chromium, mobile-chromium, and webkit (webkit ~ iOS WKWebView).
 */

import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

// collect only genuine JS crashes; ignore benign backend/resource misses (a 404 avatar etc.)
function trackPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => {
		const msg = err?.message ?? String(err);
		if (/FetchError|\[(GET|POST|PUT|PATCH|DELETE)\]\s+"/.test(msg)) return;
		if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return;
		errors.push(msg);
	});
	return errors;
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
	const toasts = await getToasts(page);
	for (const t of toasts) {
		expect(t, `toast leaked a bracketed status code: ${t}`).not.toMatch(/\[\d{3}\]/);
		expect(t, `toast leaked a raw api path: ${t}`).not.toMatch(/\/v2\//);
	}
}

// read the live pinia auth state (token presence + whether a currentUser is loaded)
async function readAuthState(page: Page): Promise<{ hasToken: boolean; hasUser: boolean }> {
	return page.evaluate(() => {
		const auth = (window as any).useNuxtApp?.().$pinia?.state?.value?.auth;
		return { hasToken: !!auth?.sessionToken, hasUser: !!auth?.currentUser };
	});
}

test.describe('Session expiry + mid-session 401 handling (native ios)', () => {
	test.beforeEach(async ({ context }) => {
		// native repair path only fires when isNativePlatform()=true, and the CapacitorHttp shim
		// (plus in-memory Preferences) live in the mock; both teardown paths need it installed
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a mid-session 401 on current-user clears auth instead of wedging a half-logged-in shell', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + forced current-user 401');
		const user = await asUser();
		const username = user.username as string;
		const heading = new RegExp(`Welcome, @${username}!`);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		// a fully hydrated session renders the authed welcome heading
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });

		// every current-user read now 401s; the next forced refetch (what the app does on resume,
		// pull-to-refresh, and profile save) must treat the token as rejected and clear it
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current',
			status: 401,
			body: { message: 'Unauthorized', code: 401 },
			once: false
		});

		// drive the same store action the shell calls to re-hydrate (useAuth().fetchUser(true) ->
		// authStore.fetchCurrentUser(true)); crust's plain $fetch throws on 401 and the store's
		// catch tears the session down
		await page.evaluate(async () => {
			const store = (window as any).useNuxtApp?.().$pinia?._s?.get('auth');
			await store?.fetchCurrentUser?.(true);
		});

		// store is cleanly anonymous - no lingering token, no stale currentUser
		await expect
			.poll(() => readAuthState(page), { timeout: 15_000 })
			.toEqual({
				hasToken: false,
				hasUser: false
			});
		// the token-mirror watcher wiped the durable Preferences token too
		await expect
			.poll(() => page.evaluate(() => (window as any).__prefs?.['session_token']), {
				timeout: 15_000
			})
			.toBeFalsy();
		// the authed welcome heading no longer renders for this user (not a frozen half-state)
		await expect(page.getByRole('heading', { name: heading })).toHaveCount(0);
	});

	test('the native repair path clears the session when a lost current-user 401s mid-session', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('native repair CapacitorHttp 401');
		const user = await asUser();
		const username = user.username as string;
		const heading = new RegExp(`Welcome, @${username}!`);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });

		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current',
			status: 401,
			body: { message: 'Unauthorized', code: 401 },
			once: false
		});

		// simulate the transport losing currentUser while the token is still present (the exact
		// condition the `token && !current` watcher repairs). repairCurrentUser fires via
		// CapacitorHttp; a 401 there must clear the token rather than retry forever
		await page.evaluate(() => {
			const store = (window as any).useNuxtApp?.().$pinia?._s?.get('auth');
			if (store) store.currentUser = null;
		});

		await expect
			.poll(() => readAuthState(page), { timeout: 15_000 })
			.toEqual({
				hasToken: false,
				hasUser: false
			});
		await expect
			.poll(() => page.evaluate(() => (window as any).__prefs?.['session_token']), {
				timeout: 15_000
			})
			.toBeFalsy();
		// no raw bracketed transport code ever surfaced during the repair teardown
		await expectNoRawApiToast(page);
	});

	test('a 401 on a protected mutation surfaces a formatted toast (never a raw [401]) and the UI recovers', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + mutation 401');
		const errors = trackPageErrors(page);
		// default makeUser is email_verified so the email gate does not short-circuit the post
		await asUser();

		await gotoHydrated('/tabs/prompts/pmt-1');
		await expect(page.getByText(/sample prompt 1\?/i).first()).toBeVisible({ timeout: 15_000 });

		// the response POST is rejected as an expired session; the mock returns a human message,
		// which is what the shared request layer passes through as `res.message`
		await mockApi.set({
			method: 'POST',
			path: '/v2/prompts/pmt-1/responses',
			status: 401,
			body: { message: 'Your session has expired. Please sign in again.', code: 401 },
			once: false
		});

		// webkit renders a hidden cloned twin of the textarea; type into the real one
		const input = page.locator('#response-input textarea:not(.cloned-input)').first();
		await input.click();
		await input.fill('Sharing an honest reflection on this prompt.');

		const postButton = page.locator('#post-button');
		await expect(postButton).toBeEnabled({ timeout: 12_000 });
		await postButton.click();

		// the toast carries the backend's human message, not a bracketed transport code
		await expectNativeToast(page, /session has expired/i);
		await expectNoRawApiToast(page);

		// the editor is not wedged: the composer + Post button are still interactive after the failure
		await expect(postButton).toBeVisible({ timeout: 12_000 });
		await expect(postButton).toBeEnabled({ timeout: 12_000 });
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('a 401 on a secondary fetch degrades gracefully and the primary content still renders', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + secondary 401');
		const errors = trackPageErrors(page);
		await asUser();

		// the profile editor's badges read is a non-critical secondary fetch; a persistent 401 on
		// it must not blank the editor or crash the shell (the primary user data comes from the store)
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/badges$/,
			status: 401,
			body: { message: 'Unauthorized', code: 401 },
			once: false
		});

		await gotoHydrated('/tabs/profile/editor');
		await expect(page.getByText(/Edit Profile/i).first()).toBeVisible({ timeout: 15_000 });

		// still on the editor, no crash, and nothing leaked a raw transport code into a toast
		await expect(page).toHaveURL(/\/tabs\/profile\/editor/);
		await expectNoRawApiToast(page);
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});
});
