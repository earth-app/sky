import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeUser } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// v1.0.2 JOURNEY: deep-link entry. one OS-delivered universal link per surface must
// normalize (resolveDeepLink) to the right internal /tabs/... route AND render its detail
// (never a blank/stuck webview), plus the two auth links (oauth-complete + reset-password)
// and the logged-out bounce->login->resume path. this chains the pieces that
// deep-link-routing.spec / oauth-native.spec / auth-password-reset.spec cover in isolation
// into one session, and adds the surfaces they skip: activity, a bare /quests/<id> link
// (existing quest coverage goes via /profile/quests?open=), and the auth-gated resume.
// guards bug class A (Ionic keep-alive/stacking across five back-to-back detail pages),
// B (hydration races), and the quest-detail-blank seam.

// fire the universal link the OS delivers via the @capacitor/app appUrlOpen listener
// (installNativeMock exposes window.__fireAppUrlOpen); same delivery as deep-link-routing.spec
async function fireAppUrl(page: import('@playwright/test').Page, url: string): Promise<void> {
	await page.evaluate((u) => (window as any).__fireAppUrlOpen(u), url);
}

test.describe('Deep-link routing journey', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('cold launch deep links into each content type normalize and render the detail', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on seeded content (act/art/evt/pmt/quest) + native deep-link hook');
		await asUser();
		// warm the tabs shell so the IonRouterOutlet exists before the deep links navigate
		await gotoHydrated('/tabs/dashboard');

		// 1) activity -> /tabs/activities/:id (surface deep-link-routing.spec doesn't cover)
		await fireAppUrl(page, 'https://app.earth-app.com/activities/act-1');
		await page.waitForURL(/\/tabs\/activities\/act-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: 'Sample Activity 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});

		// 2) article -> /tabs/articles/:id
		await fireAppUrl(page, 'https://app.earth-app.com/articles/art-1');
		await page.waitForURL(/\/tabs\/articles\/art-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});

		// 3) event -> /tabs/events/:id
		await fireAppUrl(page, 'https://app.earth-app.com/events/evt-1');
		await page.waitForURL(/\/tabs\/events\/evt-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText('Event 1').first()).toBeVisible();

		// 4) prompt -> /tabs/prompts/:id
		await fireAppUrl(page, 'https://app.earth-app.com/prompts/pmt-1');
		await page.waitForURL(/\/tabs\/prompts\/pmt-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByText(/sample prompt 1\?/i).first()).toBeVisible({ timeout: 12_000 });

		// 5) quest via a BARE /quests/<id> link -> /tabs/quests/:id; must resolve out of <Loading>
		// into the catalog timeline (quest-detail-blank seam), not a blank page
		await fireAppUrl(page, 'https://app.earth-app.com/quests/q-1');
		await page.waitForURL(/\/tabs\/quests\/q-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: /daily explorer/i }).first()).toBeVisible({
			timeout: 12_000
		});
		await expect(page.locator('#quest-button')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});

	test('an oauth-complete deep link drives the oauth-complete branch and enters the app', async ({
		page,
		asAnonymous,
		gotoHydrated,
		mockApi,
		testId
	}) => {
		skipIfIntegration('native deep-link + mock session');
		await asAnonymous();
		// seed the user the post-oauth /v2/users/current fetch resolves to, bound to the deep link's token
		const token = `oauth-token-${testId}`;
		const user = makeUser({ id: `oauth-${testId.slice(0, 8)}`, username: 'oauthjourney' });
		await mockApi.registerUser(user);
		await mockApi.loginAs(user.id, token);

		await gotoHydrated('/login');

		// the universal link crust delivers after the provider sheet succeeds
		await fireAppUrl(
			page,
			`https://app.earth-app.com/oauth/complete?session_token=${token}&provider=github&context=login`
		);

		// the oauth-complete branch setSessionToken + persists it, then routes into tabs
		await expect
			.poll(async () => page.evaluate(() => (window as any).__prefs?.session_token), {
				timeout: 8000
			})
			.toBe(token);
		await page.waitForURL(/\/tabs(\/|$)/, { timeout: 8000 }).catch(() => {});
		expect(page.url()).not.toMatch(/\/login(\?|$)/);
	});

	test('a reset-password deep link (uid+token) routes to the reset screen', async ({
		page,
		asAnonymous,
		gotoHydrated
	}) => {
		skipIfIntegration('native deep-link hook');
		await asAnonymous();
		await gotoHydrated('/login');

		// the link mantle2 emails; resolveDeepLink keeps it internal (unprotected route)
		await fireAppUrl(page, 'https://app.earth-app.com/reset-password?uid=test-user-1&token=abc');

		await page.waitForURL(/\/reset-password\?.*uid=test-user-1/, { timeout: 15_000 });
		await expect(page.getByText(/Choose a New Password/i)).toBeVisible({ timeout: 12_000 });
	});

	test('an auth-gated content deep link while logged out bounces to /login then resumes after login', async ({
		page,
		asAnonymous,
		gotoHydrated,
		mockApi,
		testId
	}) => {
		skipIfIntegration('auth-gate middleware + form login + native deep-link hook');
		await asAnonymous();
		// a real user to log in as; login only needs findUser to resolve the username
		const user = makeUser({ id: `gate-${testId.slice(0, 8)}`, username: 'gateuser' });
		await mockApi.registerUser(user);

		await gotoHydrated('/login');

		// the content link resolves to /tabs/articles/art-1; the auth.global middleware sees no
		// token and bounces to /login with the intended path preserved as ?redirect=
		await fireAppUrl(page, 'https://app.earth-app.com/articles/art-1');
		await page.waitForURL(/\/login\?.*redirect=/, { timeout: 15_000 });
		expect(decodeURIComponent(page.url())).toContain('redirect=/tabs/articles/art-1');

		// log in via the form; MLoginForm honors ?redirect= and resumes to the intended content
		await page
			.getByPlaceholder(/cooldude78|you@example\.com/i)
			.first()
			.fill('gateuser');
		await page
			.getByPlaceholder(/SuperSecretPassword/i)
			.first()
			.fill('Password_1');
		// ion-button reflects disabled via the host class; wait for canSubmit to enable it
		const submit = page.locator('form#login ion-button').first();
		await expect(submit).not.toHaveClass(/button-disabled/, { timeout: 8000 });
		await submit.click();

		await page.waitForURL(/\/tabs\/articles\/art-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});
	});

	test('an unknown/garbage deep link is ignored in-context without leaving the page or crashing', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native deep-link hook');
		await asUser();
		await gotoHydrated('/tabs/dashboard');

		// land on real content first so we can prove the ignored links don't yank us off it
		await fireAppUrl(page, 'https://app.earth-app.com/articles/art-1');
		await page.waitForURL(/\/tabs\/articles\/art-1(\?|#|$)/, { timeout: 15_000 });

		// disallowed host + unparseable string both resolve to { type: 'ignore' } -> no navigation
		await fireAppUrl(page, 'https://evil.example.com/articles/art-2');
		await fireAppUrl(page, 'not-a-real-url');

		await page.waitForTimeout(1500);
		expect(page.url()).toMatch(/\/tabs\/articles\/art-1(\?|#|$)/);
		// still on the article, content intact (no crash / blank webview) after the ignored links
		await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
			timeout: 8000
		});
	});
});
