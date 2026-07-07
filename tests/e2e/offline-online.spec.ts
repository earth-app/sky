/**
 * Offline <-> online transition suite (mobile shell).
 *
 * Proves the app reacts to native connectivity changes end to end:
 *
 *   (a) the app.vue offline banner ("You're offline") appears when the device drops
 *       offline and clears when it comes back
 *   (b) a detail page for content that was never downloaded shows its
 *       "unavailable offline" branch instead of spinning forever
 *   (c) after recovery the banner is gone and the live session is still usable
 *
 * Offline mechanism: native-mock exposes window.__fireNetworkChange(connected), which
 * fires the @capacitor/network 'networkStatusChange' listener that app.vue subscribes to
 * (updateFromStatus -> applyNetworkStatus -> networkOffline). isOffline is a computed over
 * networkOffline, so flipping it re-renders the banner reactively without a page reload.
 * We fire it IN-CONTEXT (page.evaluate, no navigation) so the module-level networkOffline
 * ref survives; a full reload would reset it. Detail pages that read isOffline in
 * onMounted must therefore be reached via an in-context router.push AFTER going offline,
 * not via gotoHydrated (which reloads at '/' for tab routes and would clear the flag).
 *
 * Runs on chromium, mobile-chromium AND webkit (webkit ~ iOS WKWebView) so the native
 * listener path surfaces on the closest-to-device engine.
 */

import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

// re-fire on every poll tick so a listener that registered a hair late still catches the
// change; applyNetworkStatus is idempotent so repeating the same status is harmless
async function fireNetwork(page: Page, connected: boolean): Promise<void> {
	await page.evaluate((c) => (window as any).__fireNetworkChange(c), connected);
}

const offlineBanner = (page: Page) => page.getByText("You're offline");

async function assertOffline(page: Page): Promise<void> {
	await expect
		.poll(
			async () => {
				await fireNetwork(page, false);
				return offlineBanner(page).count();
			},
			{ timeout: 15_000 }
		)
		.toBeGreaterThan(0);
	await expect(offlineBanner(page).first()).toBeVisible({ timeout: 5_000 });
}

async function assertOnline(page: Page): Promise<void> {
	await expect
		.poll(
			async () => {
				await fireNetwork(page, true);
				return offlineBanner(page).count();
			},
			{ timeout: 15_000 }
		)
		.toBe(0);
}

// push a route without reloading so the in-context offline state is preserved
async function pushRoute(page: Page, path: string): Promise<void> {
	await page.evaluate((p) => {
		const router = (window as any).useNuxtApp?.().$router;
		if (router) router.push(p);
	}, path);
	await page.waitForURL((url) => url.pathname === path, { timeout: 8_000 }).catch(() => {});
}

test.describe('Offline banner reacts to connectivity', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('banner appears when offline and clears when back online', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native network mock + seeded dashboard');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.locator('#title')).toBeVisible({ timeout: 12_000 });

		// no banner while online
		await expect(offlineBanner(page)).toHaveCount(0);

		await assertOffline(page);
		await assertOnline(page);
	});
});

test.describe('Detail pages fall back to the unavailable-offline branch', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('event detail shows "unavailable offline" (not an infinite spinner)', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native network mock');
		await asUser();
		// warm + hydrate the SPA online, then drop offline in-context before navigating
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await assertOffline(page);

		// non-downloaded id: the event page reads isOffline in onMounted and short-circuits
		await pushRoute(page, '/tabs/events/evt-never-downloaded');

		await expect(page.getByText('Event unavailable offline').first()).toBeVisible({
			timeout: 12_000
		});
		// no VISIBLE crescent spinner (hidden dashboard page stays mounted in the outlet,
		// so scope to :visible); proves the page settled instead of spinning forever
		await expect
			.poll(async () => page.locator('ion-spinner[name="crescent"]:visible').count(), {
				timeout: 8_000
			})
			.toBe(0);
	});

	test('activity detail shows "unavailable offline" (not an infinite spinner)', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native network mock');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await assertOffline(page);

		// the activity page reconciles via a watch([routeId, isOffline]); offline + not
		// downloaded -> unavailableOffline, no network fetch
		await pushRoute(page, '/tabs/activities/act-never-downloaded');

		await expect(page.getByText('Activity unavailable offline').first()).toBeVisible({
			timeout: 12_000
		});
		await expect
			.poll(async () => page.locator('ion-spinner[name="crescent"]:visible').count(), {
				timeout: 8_000
			})
			.toBe(0);
	});
});

test.describe('Recovery after reconnecting', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('banner clears and the live session stays usable after coming back online', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native network mock + seeded discover');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await assertOffline(page);
		await assertOnline(page);

		// banner truly gone
		await expect(offlineBanner(page)).toHaveCount(0);

		// same session must still navigate + fetch content after recovery
		await pushRoute(page, '/tabs/discover');
		await expect(page.locator('#discover-results')).toBeVisible({ timeout: 12_000 });
	});
});
