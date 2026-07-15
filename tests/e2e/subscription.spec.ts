import type { BrowserContext } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

const STATUS_ACTIVE_PRO = {
	tier: 'pro',
	status: 'active',
	provider: 'apple',
	current_period_end: '2026-08-13T00:00:00+00:00',
	cancel_at_period_end: false,
	is_trial: false,
	trial_end: null,
	refund_eligible: true,
	refund_deadline: '2026-07-27T00:00:00+00:00',
	can_manage_billing: true
};

const STATUS_NONE = {
	tier: 'free',
	status: 'none',
	provider: null,
	current_period_end: null,
	cancel_at_period_end: false,
	is_trial: false,
	trial_end: null,
	refund_eligible: false,
	refund_deadline: null,
	can_manage_billing: false
};

const STATUS_ACTIVE_WRITER = { ...STATUS_ACTIVE_PRO, tier: 'writer' };
const STATUS_ACTIVE_PRO_GOOGLE = { ...STATUS_ACTIVE_PRO, provider: 'google' };

const PLANS_BODY = {
	plans: [
		{
			tier: 'FREE',
			name: 'Free',
			price_cents: 0,
			price_display: '$0',
			currency: 'usd',
			interval: 'month'
		},
		{
			tier: 'PRO',
			name: 'Pro',
			price_cents: 599,
			price_display: '$5.99',
			currency: 'usd',
			interval: 'month'
		}
	],
	refund_window_days: 14
};

test.describe('Subscription pages (logged in, web)', () => {
	test.beforeEach(async ({ asUser }) => {
		await asUser();
	});

	test('Subscription settings page renders its shell', async ({ page, gotoHydrated, mockApi }) => {
		skipIfIntegration('mock subscription status override');
		// useSubscription (crust layer >= 0.6.0) fetches these; the page renders the shell for no-plan
		await mockApi.setMany([
			{ method: 'GET', path: '/v2/users/current/subscription', body: STATUS_NONE, once: false },
			{ method: 'GET', path: '/v2/subscriptions/plans', body: PLANS_BODY, once: false }
		]);

		await gotoTab(page, gotoHydrated, '/tabs/settings/subscription');
		await expect(page.getByText(/Subscription/i).first()).toBeVisible();
		// .first() because the tab outlet keeps a mounted duplicate page in the DOM
		await expect(page.getByText(/Redeem a Code/i).first()).toBeVisible({ timeout: 15_000 });
	});

	test('Subscription settings page shows the live plan + status + cancel', async ({
		page,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('mock subscription status override');
		// with the real crust-layer composable wired, the mocked status now drives the page
		await mockApi.setMany([
			{
				method: 'GET',
				path: '/v2/users/current/subscription',
				body: STATUS_ACTIVE_PRO,
				once: false
			},
			{ method: 'GET', path: '/v2/subscriptions/plans', body: PLANS_BODY, once: false }
		]);

		await gotoTab(page, gotoHydrated, '/tabs/settings/subscription');
		await expect(page.getByText('Pro', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
		// active + not cancel_at_period_end -> one-click cancel is offered
		await expect(page.getByText(/Cancel Subscription/i).first()).toBeVisible();
	});

	test('Memberships (upgrade) page renders the plans', async ({ page, gotoHydrated, mockApi }) => {
		skipIfIntegration('mock plans override');
		await mockApi.set({
			method: 'GET',
			path: '/v2/subscriptions/plans',
			body: PLANS_BODY,
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		await expect(page.getByText(/Memberships/i).first()).toBeVisible();
		await expect(page.locator('#plan-Pro')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText(/\$5\.99/).first()).toBeVisible();
	});
});

test.describe('Subscription IAP (native)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
		// inject the native 'NativePurchases' plugin into the mock registry AFTER native-mock has
		// built window.Capacitor.Plugins; registerPlugin('NativePurchases') resolves through it
		await context.addInitScript(() => {
			const w = window as any;
			w.__iap = { purchased: [] as string[], restored: 0 };
			const inject = () => {
				if (!w.Capacitor || !w.Capacitor.Plugins) return false;
				w.Capacitor.Plugins.NativePurchases = {
					getProducts: async () => ({ products: [] }),
					purchaseProduct: async (opts: { productIdentifier?: string }) => {
						w.__iap.purchased.push(opts?.productIdentifier ?? '');
						return {
							transactionId: '2000000999',
							productIdentifier: opts?.productIdentifier,
							jwsRepresentation: 'eyJ.mock.jws'
						};
					},
					restorePurchases: async () => {
						w.__iap.restored += 1;
					},
					getPurchases: async () => ({ purchases: [] })
				};
				return true;
			};
			if (!inject()) setTimeout(inject, 0);
		});
	});

	test('purchases the Pro plan through the native bridge and verifies server-side', async ({
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked native plugin + mocked verify endpoint');
		await asUser();
		await mockApi.setMany([
			{ method: 'GET', path: '/v2/subscriptions/plans', body: PLANS_BODY, once: false },
			{
				method: 'POST',
				path: '/v2/subscriptions/iap/apple/verify',
				body: STATUS_ACTIVE_PRO,
				once: false
			}
		]);

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');

		const proButton = page.locator('#plan-Pro ion-button').first();
		await expect(proButton).toBeVisible({ timeout: 10_000 });
		await proButton.click();

		await expectNativeToast(page, /now active/i);

		const purchased = await page.evaluate(() => (window as any).__iap?.purchased ?? []);
		expect(purchased).toContain('com.earthapp.sky.pro.monthly');
	});
});

// inject a configurable @capgo/native-purchases mock into the bridge installNativeMock builds;
// registerPlugin('NativePurchases') resolves through window.Capacitor.Plugins, so overriding
// purchase/restore behavior here drives every branch of useIapPurchase
async function setupIap(
	context: BrowserContext,
	opts: {
		platform?: 'ios' | 'android';
		purchase?: 'ok' | 'cancel' | 'fail';
		restore?: 'ok' | 'empty' | 'fail';
	} = {}
) {
	await installNativeMock(context, { platform: opts.platform ?? 'ios' });
	await context.addInitScript(
		({ purchase, restore }) => {
			const w = window as any;
			w.__iap = { purchased: [] as string[], restored: 0 };
			const cancelErr = () => Object.assign(new Error('The purchase was canceled'), { code: '2' });
			const failErr = () => new Error('The payment sheet failed to complete');
			const txFor = (id: string) => ({
				transactionId: '2000000999',
				productIdentifier: id,
				jwsRepresentation: 'eyJ.mock.jws',
				purchaseToken: 'mock-play-token',
				isActive: true
			});
			const inject = () => {
				if (!w.Capacitor || !w.Capacitor.Plugins) return false;
				w.Capacitor.Plugins.NativePurchases = {
					getProducts: async () => ({ products: [] }),
					purchaseProduct: async (o: { productIdentifier?: string }) => {
						if (purchase === 'cancel') throw cancelErr();
						if (purchase === 'fail') throw failErr();
						w.__iap.purchased.push(o?.productIdentifier ?? '');
						return txFor(o?.productIdentifier ?? '');
					},
					restorePurchases: async () => {
						if (restore === 'fail') throw failErr();
						w.__iap.restored += 1;
					},
					getPurchases: async () => ({
						purchases: restore === 'empty' ? [] : [txFor('com.earthapp.sky.pro.monthly')]
					})
				};
				return true;
			};
			if (!inject()) setTimeout(inject, 0);
		},
		{ purchase: opts.purchase ?? 'ok', restore: opts.restore ?? 'ok' }
	);
}

test.describe('Subscription IAP variants (native capgo flow)', () => {
	test('a user-canceled purchase stays silent (no verify, no error toast)', async ({
		context,
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked native cancel');
		await asUser();
		await setupIap(context, { platform: 'ios', purchase: 'cancel' });
		await mockApi.set({
			method: 'GET',
			path: '/v2/subscriptions/plans',
			body: PLANS_BODY,
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		const proButton = page.locator('#plan-Pro ion-button').first();
		await expect(proButton).toBeVisible({ timeout: 10_000 });
		await proButton.click();
		await page.waitForTimeout(600);

		const state = await page.evaluate(() => ({
			purchased: (window as any).__iap?.purchased ?? [],
			toasts: (window as any).__toasts ?? []
		}));
		expect(state.purchased).toHaveLength(0);
		expect(state.toasts.join(' ')).not.toMatch(/now active|could not|failed/i);
	});

	test('a failed native purchase surfaces an error toast', async ({
		context,
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked native failure');
		await asUser();
		await setupIap(context, { platform: 'ios', purchase: 'fail' });
		await mockApi.set({
			method: 'GET',
			path: '/v2/subscriptions/plans',
			body: PLANS_BODY,
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		await page.locator('#plan-Pro ion-button').first().click();

		await expectNativeToast(page, /could not|failed/i);
		const purchased = await page.evaluate(() => (window as any).__iap?.purchased ?? []);
		expect(purchased).toHaveLength(0);
	});

	test('a server verify rejection surfaces an error toast (entitlement not granted)', async ({
		context,
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked verify rejection');
		await asUser();
		await setupIap(context, { platform: 'ios', purchase: 'ok' });
		await mockApi.setMany([
			{ method: 'GET', path: '/v2/subscriptions/plans', body: PLANS_BODY, once: false },
			{
				method: 'POST',
				path: '/v2/subscriptions/iap/apple/verify',
				status: 409,
				body: {
					code: 409,
					message: 'You already have an active subscription on another provider.'
				},
				once: false
			}
		]);

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		await page.locator('#plan-Pro ion-button').first().click();

		await expectNativeToast(page, /could not be completed|already|another/i);
		// the native charge succeeded but the server refused to grant the tier
		const purchased = await page.evaluate(() => (window as any).__iap?.purchased ?? []);
		expect(purchased).toContain('com.earthapp.sky.pro.monthly');
	});

	test('Writer tier purchases through the native bridge', async ({
		context,
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked native writer purchase');
		await asUser();
		await setupIap(context, { platform: 'ios', purchase: 'ok' });
		await mockApi.setMany([
			{ method: 'GET', path: '/v2/subscriptions/plans', body: PLANS_BODY, once: false },
			{
				method: 'POST',
				path: '/v2/subscriptions/iap/apple/verify',
				body: STATUS_ACTIVE_WRITER,
				once: false
			}
		]);

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		const writerButton = page.locator('#plan-Writer ion-button').first();
		await expect(writerButton).toBeVisible({ timeout: 10_000 });
		await writerButton.click();

		await expectNativeToast(page, /now active/i);
		const purchased = await page.evaluate(() => (window as any).__iap?.purchased ?? []);
		expect(purchased).toContain('com.earthapp.sky.writer.monthly');
	});

	test('Android Pro purchase uses the Google Play verify path', async ({
		context,
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked android purchase');
		await asUser();
		await setupIap(context, { platform: 'android', purchase: 'ok' });
		await mockApi.setMany([
			{ method: 'GET', path: '/v2/subscriptions/plans', body: PLANS_BODY, once: false },
			{
				method: 'POST',
				path: '/v2/subscriptions/iap/google/verify',
				body: STATUS_ACTIVE_PRO_GOOGLE,
				once: false
			}
		]);

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		await page.locator('#plan-Pro ion-button').first().click();

		await expectNativeToast(page, /now active/i);
		const purchased = await page.evaluate(() => (window as any).__iap?.purchased ?? []);
		expect(purchased).toContain('sky_pro_monthly');
	});

	test('Restore Purchases re-verifies a prior purchase', async ({
		context,
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked restore');
		await asUser();
		await setupIap(context, { platform: 'ios', restore: 'ok' });
		await mockApi.setMany([
			{ method: 'GET', path: '/v2/subscriptions/plans', body: PLANS_BODY, once: false },
			{
				method: 'POST',
				path: '/v2/subscriptions/iap/apple/verify',
				body: STATUS_ACTIVE_PRO,
				once: false
			}
		]);

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		await page.locator('ion-button:has-text("Restore Purchases")').first().click();

		await expectNativeToast(page, /restored/i);
		const restored = await page.evaluate(() => (window as any).__iap?.restored ?? 0);
		expect(restored).toBeGreaterThan(0);
	});

	test('Restore with nothing to restore informs the user', async ({
		context,
		page,
		gotoHydrated,
		mockApi,
		asUser
	}) => {
		skipIfIntegration('mocked empty restore');
		await asUser();
		await setupIap(context, { platform: 'ios', restore: 'empty' });
		await mockApi.set({
			method: 'GET',
			path: '/v2/subscriptions/plans',
			body: PLANS_BODY,
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/upgrade');
		await page.locator('ion-button:has-text("Restore Purchases")').first().click();

		await expectNativeToast(page, /no previous purchases/i);
	});
});
