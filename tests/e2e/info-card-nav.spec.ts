import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

// the discover "activity" segment renders a strip of ActivityMCard -> MInfoCard cards,
// the same component the dashboard feed carousel (MInfoCardGroup) slots in. clicking one
// used to fire BOTH the ion-card router-link AND the @click navigateTo for the same
// internal link, so the tap double-navigated (glitch / wrong-target). these guard the fix.

// mock seeds activities named "Sample Activity N" (id act-N); match those to skip the
// interleaved word-of-the-day / rotation widget ion-cards that also live in the results strip
const ACTIVITY_CARD = /Sample Activity \d+/;

// wrap the shared vue-router push so we can count how many navigations a single tap fires
async function instrumentRouterPush(page: import('@playwright/test').Page): Promise<void> {
	await page.evaluate(() => {
		const nuxt = (window as any).useNuxtApp?.();
		const router = nuxt?.$router;
		if (!router) return;
		(window as any).__pushLog = [];
		if (router.__navPatched) return;
		const orig = router.push.bind(router);
		router.push = (to: any, ...rest: any[]) => {
			try {
				const path =
					typeof to === 'string' ? to : (to && (to.path || to.fullPath)) || JSON.stringify(to);
				(window as any).__pushLog.push(path);
			} catch {
				// best-effort logging; never let instrumentation break navigation
			}
			return orig(to, ...rest);
		};
		router.__navPatched = true;
	});
}

test.describe('MInfoCard navigation', () => {
	test('tapping an activity card navigates to that activity exactly once', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('relies on the mock "Sample Activity" catalog + activity detail');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');

		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		const cards = page.locator('#discover-results ion-card', { hasText: ACTIVITY_CARD });
		await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThan(0);

		const card = cards.first();
		// scroll it in + settle so the hydrate-on-visible @click handler is attached; without
		// hydration only the router-link fires and the double-nav regression would be masked
		await card.scrollIntoViewIfNeeded();
		await page.waitForTimeout(1000);

		await instrumentRouterPush(page);

		await card.click();

		await page.waitForURL(/\/tabs\/activities\/[^/?#]+/, { timeout: 12_000 });
		const targetPath = new URL(page.url()).pathname;

		const pushLog: string[] = await page.evaluate(() => (window as any).__pushLog ?? []);
		const hits = pushLog.filter((p) => {
			try {
				return new URL(p, 'http://x').pathname === targetPath;
			} catch {
				return p === targetPath;
			}
		});
		// exactly one navigation to the activity; pre-fix this was 2 (router-link + navigateTo)
		expect(hits.length).toBe(1);
	});

	test('tapping a specific activity card lands on that same activity, not a neighbor', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('relies on the mock "Sample Activity" catalog + activity detail');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');

		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		const cards = page.locator('#discover-results ion-card', { hasText: ACTIVITY_CARD });
		await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

		// pick a non-first card so a wrong-target / DOM-recycling bug would surface as a mismatch
		const card = cards.nth(1);
		await card.scrollIntoViewIfNeeded();
		const title = (await card.locator('ion-card-title').first().innerText()).trim();
		expect(title).toMatch(ACTIVITY_CARD);

		await card.click();

		await page.waitForURL(/\/tabs\/activities\/[^/?#]+/, { timeout: 12_000 });
		// the destination activity page heading must be the card we tapped
		await expect(page.getByRole('heading', { name: title, exact: false }).first()).toBeVisible({
			timeout: 12_000
		});
	});
});
