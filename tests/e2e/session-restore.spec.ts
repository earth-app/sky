import type { BrowserContext, Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { MANTLE_PORT } from './utils/mock-server';
import { installNativeMock } from './utils/native-mock';

function makeReturningUser(testId: string, username: string): Record<string, any> {
	const id = `sr-${testId.slice(0, 8)}`;
	return {
		id,
		username,
		full_name: 'Returning User',
		account: {
			avatar_url: `http://127.0.0.1:${MANTLE_PORT}/v2/users/${id}/profile_photo`
		}
	};
}

async function serveAvatarBytes(mockApi: any): Promise<void> {
	await mockApi.set({
		method: 'GET',
		path: /\/v2\/users\/[^/]+\/profile_photo/,
		status: 200,
		body: {},
		once: false
	});
}

interface AuthSnapshot {
	hasToken: boolean;
	id: string | null;
	username: string | null;
	avatarUrl: string | null;
	accountType: string | null;
}

// read the live pinia auth identity (token presence + the restored current-user)
async function readAuth(page: Page): Promise<AuthSnapshot> {
	return page.evaluate(() => {
		const auth = (window as any).useNuxtApp?.().$pinia?.state?.value?.auth;
		const u = auth?.currentUser;
		return {
			hasToken: !!auth?.sessionToken,
			id: u?.id ?? null,
			username: u?.username ?? null,
			avatarUrl: u?.account?.avatar_url ?? null,
			accountType: u?.account?.account_type ?? null
		};
	});
}

async function readDurablePrefs(
	page: Page
): Promise<{ session_token: string; current_user: string | null }> {
	await expect
		.poll(() => page.evaluate(() => (window as any).__prefs?.['session_token'] ?? null), {
			timeout: 12_000
		})
		.toBeTruthy();
	return page.evaluate(() => {
		const p = (window as any).__prefs ?? {};
		return { session_token: p['session_token'] ?? '', current_user: p['current_user'] ?? null };
	});
}

// re-apply the durable native store on every future document load - __prefs is wiped by the
// native-mock init script each navigation, so this (registered after it) restores what the OS
// keeps across a relaunch. extra keys let a test also seed e.g. the offlineMode setting
async function seedDurablePrefs(
	context: BrowserContext,
	prefs: Record<string, string>
): Promise<void> {
	await context.addInitScript((p) => {
		const w = window as any;
		w.__prefs ||= {};
		for (const k of Object.keys(p)) w.__prefs[k] = (p as Record<string, string>)[k]!;
	}, prefs);
}

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

// no user-facing toast may leak a raw transport code / api path ("Sky error formatting" bar)
async function expectNoRawApiToast(page: Page): Promise<void> {
	const toasts = await getToasts(page);
	for (const t of toasts) {
		expect(t, `toast leaked a bracketed status code: ${t}`).not.toMatch(/\[\d{3}\]/);
		expect(t, `toast leaked a raw api path: ${t}`).not.toMatch(/\/v2\//);
	}
}

test.describe('Returning-user session restore (native ios)', () => {
	test.beforeEach(async ({ context }) => {
		// the native repair + Preferences restore paths only run when isNativePlatform()=true and
		// the CapacitorHttp shim + in-memory Preferences live in the mock; both need it installed
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a valid persisted session resumes authenticated across a cold relaunch with an intact profile', async ({
		context,
		page,
		asUser,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + cold relaunch');
		const errors = trackPageErrors(page);
		await serveAvatarBytes(mockApi);
		const user = await asUser(makeReturningUser(testId, 'returning'));
		const heading = new RegExp(`Welcome, @${user.username}!`);

		// logged-in session: the dashboard renders the authed welcome heading
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
		const before = await readAuth(page);
		expect(before.id).toBe(user.id);
		expect(before.avatarUrl).toContain('/profile_photo');

		// capture what the app persisted, then re-seed it so the durable native store survives the
		// relaunch (module state, in-flight promises, repairBudget all reset on the fresh document)
		const durable = await readDurablePrefs(page);
		expect(durable.current_user, 'app must persist a current_user snapshot').toBeTruthy();
		await seedDurablePrefs(context, {
			session_token: durable.session_token,
			...(durable.current_user ? { current_user: durable.current_user } : {})
		});

		// COLD RELAUNCH: fresh document boot that restores auth purely from Preferences
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// resumed authenticated: no bounce to /login, the authed heading (with @username, not the
		// bare anonymous "Welcome,") renders, and it is the SAME user - not a null/re-anonymized one
		await expect(page).toHaveURL(/\/tabs\/dashboard/);
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
		const after = await readAuth(page);
		expect(after.id).toBe(before.id);
		expect(after.username).toBe(user.username);
		expect(after.hasToken).toBe(true);
		// the restored identity still carries the real avatar (the "default avatar" regression is a
		// null/anonymous currentUser); account_type resolved proves it is the full user, not a stub
		expect(after.avatarUrl).toContain('/profile_photo');
		expect(after.accountType).toBeTruthy();

		// own profile is intact: title shows @username, owner-only controls render (proving the
		// restored currentUser === the profile user), and the avatar is NOT the default fallback
		await gotoTab(page, gotoHydrated, `/tabs/profile/@${user.username}`);
		await expect(page.locator('#profile-title')).toContainText(new RegExp(`@${user.username}`), {
			timeout: 12_000
		});
		await expect(page.locator('#settings-link')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#avatar')).toBeVisible({ timeout: 12_000 });
		// the anonymous state would render <img src="/earth-app.png"> in #avatar; the real user must not
		await expect(page.locator('#avatar img[src*="earth-app.png"]')).toHaveCount(0);

		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('a transient current-user hiccup on relaunch self-heals via repair instead of nulling the user', async ({
		context,
		page,
		asUser,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + one-shot current-user 200 empty');
		await serveAvatarBytes(mockApi);
		const user = await asUser(makeReturningUser(testId, 'healed'));
		const heading = new RegExp(`Welcome, @${user.username}!`);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });

		const durable = await readDurablePrefs(page);
		await seedDurablePrefs(context, {
			session_token: durable.session_token,
			...(durable.current_user ? { current_user: durable.current_user } : {})
		});

		// first current-user read on relaunch comes back an empty 200 body ONCE, so the ofetch
		// path can't resolve a full user; repairCurrentUser (CapacitorHttp) must retry and heal
		// rather than leave the session nulled
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current',
			status: 200,
			body: {},
			once: true
		});

		// count current-user GETs after relaunch (ofetch + the CapacitorHttp repair are both real
		// fetches) to prove a retry actually fired
		let currentUserGets = 0;
		page.on('request', (req) => {
			if (req.method() === 'GET' && /\/v2\/users\/current(\?|$)/.test(req.url())) {
				currentUserGets++;
			}
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// the user still resolves despite the transient empty response (repair healed it)
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
		await expect(page).toHaveURL(/\/tabs\/dashboard/);
		// repair fully resolved the user (account_type present), not just the cached snapshot stub
		await expect
			.poll(async () => (await readAuth(page)).accountType, { timeout: 15_000 })
			.toBeTruthy();
		expect((await readAuth(page)).id).toBe(user.id);
		// at least the malformed first hit + one repair retry
		expect(currentUserGets).toBeGreaterThanOrEqual(2);
	});

	test('an expired token on relaunch clears the session cleanly and bounces a protected route to Login', async ({
		context,
		page,
		asUser,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + persistent current-user 401');
		const user = await asUser(makeReturningUser(testId, 'expired'));
		const heading = new RegExp(`Welcome, @${user.username}!`);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });

		const durable = await readDurablePrefs(page);
		await seedDurablePrefs(context, {
			session_token: durable.session_token,
			...(durable.current_user ? { current_user: durable.current_user } : {})
		});

		// the persisted token is now rejected: every current-user read 401s. boot must treat the
		// token as expired and tear the session down rather than wedge a half-logged-in shell
		await mockApi.set({
			method: 'GET',
			path: '/v2/users/current',
			status: 401,
			body: { message: 'Unauthorized', code: 401 },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// durable token wiped (the token-mirror watcher removes it once the store token goes null)
		// and the authed heading never renders for this user - a clean anonymous clear, not a wedge
		await expect
			.poll(() => page.evaluate(() => (window as any).__prefs?.['session_token']), {
				timeout: 15_000
			})
			.toBeFalsy();
		await expect(page.getByRole('heading', { name: heading })).toHaveCount(0);
		await expect
			.poll(() => readAuth(page).then((a) => a.hasToken), { timeout: 15_000 })
			.toBe(false);

		// with the token gone, an in-context navigation to a protected route bounces to /login (the
		// init script only re-seeds Preferences on a fresh document load, not on an SPA push)
		await page.evaluate(() => {
			const router = (window as any).useNuxtApp?.().$router;
			if (router) router.push('/tabs/settings');
		});
		await page.waitForURL(/\/login(\?|$)/, { timeout: 15_000 });
		expect(new URL(page.url()).pathname).toBe('/login');
	});

	test('an offline relaunch restores the profile from the cached user (no network)', async ({
		context,
		page,
		asUser,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + offline cached-user boot');
		await serveAvatarBytes(mockApi);
		const user = await asUser(makeReturningUser(testId, 'cachedme'));
		const heading = new RegExp(`Welcome, @${user.username}!`);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });

		const durable = await readDurablePrefs(page);
		expect(durable.current_user).toBeTruthy();
		// relaunch with the offlineMode preference set: bootstrapAuth's isOfflineModePreferred()
		// short-circuits online validation and resolves the user from the cached snapshot only
		await seedDurablePrefs(context, {
			session_token: durable.session_token,
			...(durable.current_user ? { current_user: durable.current_user } : {}),
			'app.setting.offlineMode': 'true'
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// resumed authenticated offline from the cached snapshot: username renders, no /login bounce,
		// and the session survives (token intact, same user) rather than being torn down
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
		await expect(page).toHaveURL(/\/tabs\/dashboard/);
		const after = await readAuth(page);
		expect(after.id).toBe(user.id);
		expect(after.hasToken).toBe(true);
		// the offline banner proves offlineMode was active at boot, so isOfflineModePreferred() took
		// the cached-user path (skipping online validation) - the shell is genuinely offline
		await expect(page.getByText("You're offline").first()).toBeVisible({ timeout: 12_000 });
	});

	test('a 401 on a mutation after restore surfaces a formatted re-auth toast, never a raw [401]', async ({
		context,
		page,
		asUser,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock session + post-restore mutation 401');
		const errors = trackPageErrors(page);
		// default makeUser is email_verified so the prompt-response email gate does not short-circuit
		const user = await asUser(makeReturningUser(testId, 'reauth'));
		const heading = new RegExp(`Welcome, @${user.username}!`);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });

		const durable = await readDurablePrefs(page);
		await seedDurablePrefs(context, {
			session_token: durable.session_token,
			...(durable.current_user ? { current_user: durable.current_user } : {})
		});

		// cold relaunch straight into a prompt detail; the restored session must be usable
		await gotoHydrated('/tabs/prompts/pmt-1');
		await expect(page.getByText(/sample prompt 1\?/i).first()).toBeVisible({ timeout: 15_000 });

		// the response POST is rejected as an expired session mid-flight; the mock returns a human
		// message which the shared request layer passes through as res.message
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
		await input.fill('Sharing an honest reflection after coming back to the app.');

		const postButton = page.locator('#post-button');
		await expect(postButton).toBeEnabled({ timeout: 12_000 });
		await postButton.click();

		// the toast carries the backend's human message, not a bracketed transport code / api path
		await expectNativeToast(page, /session has expired/i);
		await expectNoRawApiToast(page);

		// the composer is not wedged: the Post button stays interactive after the failure
		await expect(postButton).toBeVisible({ timeout: 12_000 });
		await expect(postButton).toBeEnabled({ timeout: 12_000 });
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});
});
