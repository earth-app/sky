import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// proves resolveDeepLink (src/composables/useDeepLinkRouting.ts) + app.vue handleIncomingDeepLink
// map an OS-delivered universal link into the correct internal tab route. oauth-complete links
// are covered by oauth-native.spec.ts + onboarding-username.spec.ts; this file covers CONTENT
// links (articles / events / prompts / quests) and the ignore path. the App plugin +
// window.__fireAppUrlOpen hook comes from installNativeMock; asUser gates the authed detail pages.

// fire the universal link the OS delivers via the @capacitor/app appUrlOpen listener
async function fireAppUrl(page: import('@playwright/test').Page, url: string): Promise<void> {
	await page.evaluate((u) => (window as any).__fireAppUrlOpen(u), url);
}

test.describe('Content deep-link routing', () => {
	test.beforeEach(async ({ context }) => {
		// native mock installs the App plugin (__fireAppUrlOpen) + CapacitorHttp shim for hydration
		await installNativeMock(context, { platform: 'ios' });
	});

	test('an article universal link routes to /tabs/articles/:id and renders the article', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock article art-1 + native deep-link hook');
		await asUser();
		// warm the tabs shell so the IonRouterOutlet exists before the deep link navigates
		await gotoHydrated('/tabs/dashboard');

		await fireAppUrl(page, 'https://app.earth-app.com/articles/art-1');

		await page.waitForURL(/\/tabs\/articles\/art-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});
	});

	test('a quest challenge link (/profile/quests?open=<id>) opens that quest', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock quest q-1 + native deep-link hook');
		await asUser();
		await gotoHydrated('/tabs/dashboard');

		// crust's challenge notification links to /profile/quests?open=<id>; resolveDeepLink maps
		// it to /tabs/quests?open=<id>, then the quests index jumps straight to the quest detail.
		// note: a bare /quests/<id> link is NOT mapped (see product-bug note in the report)
		await fireAppUrl(page, 'https://app.earth-app.com/profile/quests?open=q-1');

		await page.waitForURL(/\/tabs\/quests\/q-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: /daily explorer/i }).first()).toBeVisible({
			timeout: 12_000
		});
	});

	test('an event universal link routes to /tabs/events/:id and renders the event', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 + native deep-link hook');
		await asUser();
		await gotoHydrated('/tabs/dashboard');

		await fireAppUrl(page, 'https://app.earth-app.com/events/evt-1');

		await page.waitForURL(/\/tabs\/events\/evt-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText('Event 1').first()).toBeVisible();
	});

	test('a prompt universal link routes to /tabs/prompts/:id and renders the prompt', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock prompt pmt-1 + native deep-link hook');
		await asUser();
		await gotoHydrated('/tabs/dashboard');

		await fireAppUrl(page, 'https://app.earth-app.com/prompts/pmt-1');

		await page.waitForURL(/\/tabs\/prompts\/pmt-1(\?|#|$)/, { timeout: 15_000 });
		await expect(page.getByText(/sample prompt 1\?/i).first()).toBeVisible({ timeout: 12_000 });
	});

	test('an unknown-host / garbage deep link is ignored, staying put without a crash', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native deep-link hook');
		await asUser();
		await gotoHydrated('/tabs/dashboard');

		// disallowed host + unparseable string both resolve to { type: 'ignore' } -> no navigation
		await fireAppUrl(page, 'https://evil.example.com/articles/art-1');
		await fireAppUrl(page, 'not-a-real-url');

		// give any (unwanted) navigation a chance to happen, then assert we never left the dashboard
		await page.waitForTimeout(1500);
		expect(page.url()).toMatch(/\/tabs\/dashboard(\?|#|$)/);
		// shell is still alive (no crash / blank webview) after the ignored links
		await expect(page.locator('ion-tab-bar').first()).toBeVisible({ timeout: 8000 });
	});

	// NOTE (coverage gap): a notification-tap route (usePushNotifications
	// pushNotificationActionPerformed) is NOT exercised here. native-mock.ts exposes App /
	// Network / Pedometer / HealthKit fire hooks but no push/local-notification action hook
	// (the fire() dispatcher is closure-private), so there is no clean __fireAppUrlOpen-style
	// mirror to drive it. add w.__firePushAction to native-mock.ts to unblock this test.
});
