import type { BrowserContext } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// cold-launch auth hydration + the native current-user REPAIR path. on native/webkit the
// crust ofetch GET /v2/users/current can lose the transport-warmup race and null currentUser;
// sky's repairCurrentUser (src/app.vue) retries via CapacitorHttp and heals it. these run
// under the ios native mock so isNativePlatform()=true (repair only fires when isNative) and
// the CapacitorHttp shim routes through fetch carrying the context x-test-id.
test.describe('Auth cold launch + current-user repair (native ios)', () => {
	test.beforeEach(async ({ context, asAnonymous }) => {
		await installNativeMock(context, { platform: 'ios' });
		// start from a clean anonymous mock; each test seeds its own stored token in Preferences
		await asAnonymous();
	});

	// mirror how the app persists its session natively: Preferences key `session_token`
	// (src/app.vue bootstrapAuth + the token-mirror watcher + middleware/auth.global.ts). the
	// native-mock init script (registered first) resets w.__prefs each navigation, so this one
	// (registered after) re-adds the token on every document init
	async function seedStoredToken(context: BrowserContext, token: string): Promise<void> {
		await context.addInitScript((t) => {
			const w = window as any;
			(w.__prefs ||= {})['session_token'] = t;
		}, token);
	}

	function makeColdUser(testId: string, username: string): Record<string, any> {
		return {
			id: `cold-${testId.slice(0, 8)}`,
			username,
			full_name: 'Cold Launch',
			account: {
				account_type: 'FREE',
				username,
				email: `${username}@example.com`,
				email_verified: true
			}
		};
	}

	test('cold launch with a stored token hydrates the user', async ({
		context,
		page,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native cold-launch + mock session');
		const token = `cold-token-${testId}`;
		const user = makeColdUser(testId, 'coldstart');
		await mockApi.registerUser(user);
		// bind BOTH so the token-only Preferences boot AND the x-test-id transport resolve them
		await mockApi.loginAs(user.id, token);

		// only source of the session is Preferences (no cookie / localStorage) so this proves
		// the native bootstrap path, not a browser-cookie shortcut
		await seedStoredToken(context, token);

		await gotoHydrated('/tabs/dashboard');

		// a hydrated user renders `Welcome, @username!`; a null user leaves it as bare `Welcome,`
		await expect(page.getByRole('heading', { name: /Welcome, @coldstart!/ })).toBeVisible({
			timeout: 15_000
		});
	});

	test('repair heals a warmup-nulled current user via CapacitorHttp', async ({
		context,
		page,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native cold-launch + mock session');
		const token = `cold-token-${testId}`;
		const user = makeColdUser(testId, 'healme');
		await mockApi.registerUser(user);
		await mockApi.loginAs(user.id, token);
		await seedStoredToken(context, token);

		// first GET /v2/users/current comes back an empty 200 body ONCE so crust can't resolve a
		// full user; the once override is then consumed and the repair retry falls through to the
		// seeded default route (the real user)
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current',
			status: 200,
			body: {},
			once: true
		});

		// count current-user GETs (crust ofetch + the CapacitorHttp-shim repair are both real
		// fetches playwright sees) to prove a retry actually fired
		let currentUserGets = 0;
		page.on('request', (req) => {
			if (req.method() === 'GET' && /\/v2\/users\/current(\?|$)/.test(req.url())) {
				currentUserGets++;
			}
		});

		await gotoHydrated('/tabs/dashboard');

		// repair recovered the user, so the username still renders despite the first null response
		await expect(page.getByRole('heading', { name: /Welcome, @healme!/ })).toBeVisible({
			timeout: 15_000
		});
		// at least the malformed first hit + one repair retry
		expect(currentUserGets).toBeGreaterThanOrEqual(2);
	});

	test('a persistent 401 on current-user clears the session', async ({
		context,
		page,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native cold-launch + mock session');
		const token = `cold-token-${testId}`;
		const user = makeColdUser(testId, 'goner');
		await mockApi.registerUser(user);
		await mockApi.loginAs(user.id, token);
		await seedStoredToken(context, token);

		// every current-user read 401s (once:false); repairCurrentUser must treat this as a
		// rejected token and tear the session down rather than leave a half-logged-in shell
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current',
			status: 401,
			body: { message: 'Unauthorized', code: 401 },
			once: false
		});

		await gotoHydrated('/tabs/dashboard');

		// session token is wiped from Preferences (the token-mirror watcher removes it once the
		// store token goes null), so the app is cleanly logged out
		await expect
			.poll(() => page.evaluate(() => (window as any).__prefs?.['session_token']), {
				timeout: 15_000
			})
			.toBeFalsy();
		// and the authed welcome heading never renders for this user
		await expect(page.getByRole('heading', { name: /Welcome, @goner!/ })).toHaveCount(0);
	});

	test('cold launch with no stored token bounces a protected route to Login', async ({ page }) => {
		skipIfIntegration('native cold-launch guard');
		// no Preferences token seeded; the global auth middleware must redirect /tabs -> /login
		await page.goto('/tabs/dashboard', { waitUntil: 'domcontentloaded' });
		await page.waitForURL(/\/login(\?|$)/, { timeout: 15_000 });
		expect(new URL(page.url()).pathname).toBe('/login');
	});
});
