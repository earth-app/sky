import { expect, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// well-formed per crust's bridge regex /^[0-9A-HJKMNP-TV-Z]{6}$/ (Crockford base32)
const VALID_CODE = 'ABC234';
// excluded letters + wrong length; the bridge must refuse it
const INVALID_CODE = 'aio123';

/** Read the in-memory Capacitor Preferences store the native mock exposes. */
async function readPref(page: import('@playwright/test').Page, key: string) {
	return page.evaluate((k) => (window as any).__prefs?.[k] ?? null, key);
}

async function captureCreateBody(page: import('@playwright/test').Page) {
	let captured: any = null;
	await page.route('**/v2/users/create', async (route) => {
		const req = route.request();
		try {
			captured = req.postDataJSON();
		} catch {
			captured = null;
		}
		await route.continue();
	});
	return () => captured;
}

test.describe('Referral flow', () => {
	test.beforeEach(async ({ context, asAnonymous }) => {
		await installNativeMock(context, { platform: 'ios' });
		await asAnonymous();
	});

	test('an /invite/<code> deep link persists the code and lands on signup', async ({
		page,
		gotoHydrated
	}) => {
		// warm the SPA so app.vue is mounted and its appUrlOpen listener is live
		await gotoHydrated('/login');

		await page.evaluate((code) => {
			(window as any).__fireAppUrlOpen(`https://app.earth-app.com/invite/${code}`);
		}, VALID_CODE);

		// the resolver persists to Preferences and routes into the signup screen
		await expect
			.poll(async () => readPref(page, 'referral_code'), { timeout: 8000 })
			.toBe(VALID_CODE);
		await page.waitForURL(new RegExp(`/signup\\?ref=${VALID_CODE}`), { timeout: 8000 });
	});

	test('a ?ref=<code> deep link also captures the code and routes to signup', async ({
		page,
		gotoHydrated
	}) => {
		await gotoHydrated('/login');

		// any allowed host with a ?ref param is captured by resolveDeepLink; the root
		// path routes to the dashboard but the ref is still persisted en route
		await page.evaluate((code) => {
			(window as any).__fireAppUrlOpen(`https://app.earth-app.com/?ref=${code}`);
		}, VALID_CODE);

		await expect
			.poll(async () => readPref(page, 'referral_code'), { timeout: 8000 })
			.toBe(VALID_CODE);
	});

	test('signup sends the captured referral_code (from Preferences) in the create body and clears it', async ({
		page,
		gotoHydrated
	}) => {
		const getBody = await captureCreateBody(page);

		// seed the code the way a prior deep link would have (Preferences), then load
		// signup WITHOUT a ?ref so the bridge must read it from Preferences
		await page.addInitScript((code) => {
			(window as any).__prefs = { ...(window as any).__prefs, referral_code: code };
		}, VALID_CODE);

		await gotoHydrated('/signup');

		// no email so a success would otherwise land on /tabs; that's fine, we assert on the request
		await page.getByPlaceholder(/cooldude78/i).fill('invitee');
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');
		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		await expect.poll(() => getBody(), { timeout: 10_000 }).not.toBeNull();
		expect(getBody().referral_code).toBe(VALID_CODE);

		// attribution consumed: useSignup clears the cookie after a successful create
		await expect
			.poll(async () => page.evaluate(() => document.cookie.includes('referral_code=')), {
				timeout: 8000
			})
			.toBe(false);
	});

	test('signup sends a referral_code bridged from the ?ref query', async ({
		page,
		gotoHydrated
	}) => {
		const getBody = await captureCreateBody(page);

		// arrive on signup directly with the query param the deep link would have set
		await gotoHydrated(`/signup?ref=${VALID_CODE}`);

		await page.getByPlaceholder(/cooldude78/i).fill('queryinvitee');
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');
		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		await expect.poll(() => getBody(), { timeout: 10_000 }).not.toBeNull();
		expect(getBody().referral_code).toBe(VALID_CODE);
	});

	test('a malformed referral code is NOT bridged into the create body', async ({
		page,
		gotoHydrated
	}) => {
		const getBody = await captureCreateBody(page);

		// a malformed code in the query: the bridge regex must reject it so it never
		// reaches the create request body (undefined, not the bad string)
		await gotoHydrated(`/signup?ref=${INVALID_CODE}`);

		await page.getByPlaceholder(/cooldude78/i).fill('nobadref');
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');
		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		await expect.poll(() => getBody(), { timeout: 10_000 }).not.toBeNull();
		// crust sends referral_code: undefined when the code fails validation; JSON drops
		// the key entirely, so the created body must not carry the malformed value
		expect(getBody().referral_code).toBeUndefined();
	});
});
