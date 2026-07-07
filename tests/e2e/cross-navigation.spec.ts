import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestDetail } from './utils/quest-helpers';

// cross-type navigation: moving between content detail pages (and back) must never leave a
// blank page, a stuck spinner, a false "Not Found", or the PREVIOUS item's content lingering.
// targets three bug classes at once: quest-detail-blank/store-fallback, MInfoCard double-nav,
// and cross-item cache-bleed (a detail page reused across an id change keeping stale data).

const ACTIVITY_CARD = /Sample Activity \d+/;
const ARTICLE_CARD = /\bArticle \d+/;

// the active (top-of-stack) page's scrollable content; ionic stacks detail pages and keeps
// prior ones mounted, so scope to the LAST visible ion-content (newest page in dom order)
// to avoid matching a stale page still transitioning out
function activeContent(page: Page) {
	return page.locator('ion-content:visible').last();
}

// navigate WITHIN the live SPA via the shared vue-router (no full reload), so a reused detail
// component / poisoned store cache would surface as stale content. gotoHydrated re-warms at '/'
// which would mask that, so it is only used for the first entry into the app
async function pushRoute(page: Page, path: string): Promise<void> {
	const targetPath = path.split('?')[0]!;
	const targetQuery = path.split('?')[1] ?? '';
	await page
		.evaluate((p) => {
			(window as any).useNuxtApp?.().$router?.push(p);
		}, path)
		.catch(() => {});
	await page
		.waitForURL(
			(url) =>
				url.pathname === targetPath &&
				(targetQuery === '' || url.search.replace(/^\?/, '') === targetQuery),
			{ timeout: 12_000 }
		)
		.catch(() => {});
	await activeContent(page)
		.waitFor({ state: 'visible', timeout: 12_000 })
		.catch(() => {});
}

// icon-only ion-segment-buttons carry their value as a js property, not a reflected attr, so
// click by matching the live property (mirrors discover.spec's clickSegmentByValue)
async function switchDiscoverSegment(page: Page, value: string): Promise<void> {
	const handle = await page.evaluateHandle((v) => {
		const seg = document.querySelector('#discover-segments');
		const btns = Array.from(seg?.querySelectorAll('ion-segment-button') ?? []);
		return btns.find((b) => (b as any).value === v) ?? null;
	}, value);
	const el = handle.asElement();
	if (el) await el.click();
}

// wrap router.push so a single tap's navigation count is observable (double-nav guard)
async function instrumentRouterPush(page: Page): Promise<void> {
	await page.evaluate(() => {
		const router = (window as any).useNuxtApp?.().$router;
		if (!router || router.__navPatched) return;
		(window as any).__pushLog = [];
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

// tap a discover card and read the title it displayed, so the destination can be matched against
// exactly the card that was tapped (wrong-target / DOM-recycling guard)
async function tapDiscoverCard(page: Page, titlePattern: RegExp, index = 0): Promise<string> {
	const cards = page.locator('#discover-results ion-card', { hasText: titlePattern });
	await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThan(index);
	const card = cards.nth(index);
	await card.scrollIntoViewIfNeeded();
	// let the hydrate-on-visible @click handler attach so the router-link is live
	await page.waitForTimeout(800);
	const raw = (await card.locator('ion-card-title').first().innerText()).trim();
	const match = raw.match(titlePattern);
	const title = match ? match[0] : raw;
	await card.click();
	return title;
}

// assert the active detail page settled on real content, not a blank/loading/not-found shell.
// the main-title assertion at each call site already proves content rendered; here we only
// guard the genuinely-blank signals (a full-page not-found, or the quest Loading... placeholder).
// NOTE: incidental ion-spinners from Related-content carousels are expected and not a blank page
async function expectNotBlank(page: Page): Promise<void> {
	await expect(activeContent(page).getByText(/Not Found/i)).toHaveCount(0);
	await expect(page.getByAltText('Loading...')).toHaveCount(0);
}

test.describe('Cross-type detail navigation', () => {
	test('article A then article B renders B with no stale A', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('relies on the seeded art-1/art-2 article catalog + article detail');
		await asUser();

		// enter the app on article art-1
		await gotoHydrated('/tabs/articles/art-1');
		await expect(
			activeContent(page).getByRole('heading', { name: 'Article 1', exact: true, level: 1 })
		).toBeVisible({ timeout: 12_000 });
		await expectNotBlank(page);

		// open a DIFFERENT article in the same live SPA session (no reload); ionic stacks art-2
		// on top and the top page scoping proves art-2's data, not a reused/poisoned art-1
		await pushRoute(page, '/tabs/articles/art-2');

		// art-2 must render its own title and NOT the previous article's (cache-bleed guard).
		// scope to the level-1 page title; a "Related Articles" carousel legitimately links
		// other articles as level-2 cards, so match only the main heading
		await expect(
			activeContent(page).getByRole('heading', { name: 'Article 2', exact: true, level: 1 })
		).toBeVisible({ timeout: 12_000 });
		await expect(
			activeContent(page).getByRole('heading', { name: 'Article 1', exact: true, level: 1 })
		).toHaveCount(0);
		await expectNotBlank(page);
	});

	test('discover activity then back then a different segment opens the correct detail', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('relies on the mock Sample Activity + Article catalog and discover feed');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');
		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });

		// open an activity from the activity segment
		const activityTitle = await tapDiscoverCard(page, ACTIVITY_CARD);
		await page.waitForURL(/\/tabs\/activities\/[^/?#]+/, { timeout: 12_000 });
		await expect(activeContent(page).getByRole('heading', { name: activityTitle })).toBeVisible({
			timeout: 12_000
		});
		await expectNotBlank(page);

		// back to discover, switch to a DIFFERENT content type, open one of those
		await page.goBack().catch(() => {});
		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		await switchDiscoverSegment(page, 'article');
		await expect(page.getByText(/articles\s*-\s*\d+\s*results/i)).toBeVisible({ timeout: 15_000 });

		const articleTitle = await tapDiscoverCard(page, ARTICLE_CARD);
		await page.waitForURL(/\/tabs\/articles\/[^/?#]+/, { timeout: 12_000 });
		// the destination is an ARTICLE (its own level-1 title), not a lingering activity page
		await expect(
			activeContent(page).getByRole('heading', { name: articleTitle, level: 1 })
		).toBeVisible({ timeout: 12_000 });
		// the prior activity's page title must not persist as this page's main heading
		await expect(
			activeContent(page).getByRole('heading', { name: activityTitle, exact: true, level: 1 })
		).toHaveCount(0);
		await expectNotBlank(page);
	});

	test('quest q-1 then q-2 each render their own timeline, never blank', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('relies on the seeded q-1/q-2 quest catalog + native bridge');
		// quest detail leans on the native bridge on ios paths; match quest-navigation.spec's env
		await installNativeMock(context, { platform: 'ios' });
		await asUser({ username: 'crossnav' });

		await gotoQuestDetail(page, gotoHydrated, 'q-1');
		// quest detail renders its title as a level-2 heading (unlike article/activity level-1)
		await expect(
			activeContent(page).getByRole('heading', { name: 'Daily Explorer', level: 2 })
		).toBeVisible({ timeout: 12_000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);

		// navigate to a second quest in-app; its own definition must resolve (not the q-1 fallback)
		await pushRoute(page, '/tabs/quests/q-2');
		// both quest pages stay mounted (each has a #quest-button), so scope to the top page
		await expect(activeContent(page).locator('#quest-button')).toBeVisible({ timeout: 12_000 });
		await expect(
			activeContent(page).getByRole('heading', { name: 'Trail Blazer', level: 2 })
		).toBeVisible({ timeout: 12_000 });
		// the previous quest's title must not persist behind the store fallback
		await expect(
			activeContent(page).getByRole('heading', { name: 'Daily Explorer', level: 2 })
		).toHaveCount(0);
		await expect(activeContent(page).locator('#tile-0')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});

	test('detail survives a tab switch and browser back without going blank', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('relies on the seeded art-1 article + tab shell');
		await asUser();

		await gotoHydrated('/tabs/articles/art-1');
		await expect(
			activeContent(page).getByRole('heading', { name: 'Article 1', exact: true, level: 1 })
		).toBeVisible({ timeout: 12_000 });

		// jump to another tab, then use browser back to return to the same detail. scope to the
		// level-1 title: the dashboard feed can legitimately surface Article 1 as a level-2 card
		await pushRoute(page, '/tabs/dashboard');
		await expect(
			activeContent(page).getByRole('heading', { name: 'Article 1', exact: true, level: 1 })
		).toHaveCount(0);

		await page.goBack().catch(() => {});
		await page.waitForURL(/\/tabs\/articles\/art-1/, { timeout: 12_000 }).catch(() => {});

		// the detail is re-shown intact, not stranded blank/loading
		await expect(
			activeContent(page).getByRole('heading', { name: 'Article 1', exact: true, level: 1 })
		).toBeVisible({ timeout: 12_000 });
		await expectNotBlank(page);
	});

	test('re-tapping different discover cards lands on each exact target, once', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('relies on the mock Sample Activity catalog + activity detail');
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');
		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		await expect
			.poll(
				async () => page.locator('#discover-results ion-card', { hasText: ACTIVITY_CARD }).count(),
				{
					timeout: 15_000
				}
			)
			.toBeGreaterThanOrEqual(2);

		// first tap: lands on exactly the card that was tapped
		const firstTitle = await tapDiscoverCard(page, ACTIVITY_CARD, 0);
		await page.waitForURL(/\/tabs\/activities\/[^/?#]+/, { timeout: 12_000 });
		await expect(activeContent(page).getByRole('heading', { name: firstTitle })).toBeVisible({
			timeout: 12_000
		});

		// back to discover, tap a DIFFERENT card; it must land on that neighbor, not repeat the first
		await page.goBack().catch(() => {});
		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		const cards = page.locator('#discover-results ion-card', { hasText: ACTIVITY_CARD });
		await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
		const second = cards.nth(1);
		await second.scrollIntoViewIfNeeded();
		await page.waitForTimeout(800);
		const raw = (await second.locator('ion-card-title').first().innerText()).trim();
		const secondTitle = raw.match(ACTIVITY_CARD)?.[0] ?? raw;

		await instrumentRouterPush(page);
		await second.click();

		await page.waitForURL(/\/tabs\/activities\/[^/?#]+/, { timeout: 12_000 });
		const targetPath = new URL(page.url()).pathname;
		await expect(activeContent(page).getByRole('heading', { name: secondTitle })).toBeVisible({
			timeout: 12_000
		});
		await expectNotBlank(page);

		// exactly one navigation fired for this tap (double-nav regression fires two)
		const pushLog: string[] = await page.evaluate(() => (window as any).__pushLog ?? []);
		const hits = pushLog.filter((p) => {
			try {
				return new URL(p, 'http://x').pathname === targetPath;
			} catch {
				return p === targetPath;
			}
		});
		expect(hits.length).toBe(1);
	});
});
