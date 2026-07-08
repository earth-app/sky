import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

type SegmentType = 'user' | 'activity' | 'article' | 'prompt' | 'event';

const SEARCH = 'Sample';
const SEGMENTS: { seg: SegmentType; label: string; count: number }[] = [
	{ seg: 'user', label: 'users', count: 0 },
	{ seg: 'article', label: 'articles', count: 12 },
	{ seg: 'prompt', label: 'prompts', count: 15 },
	{ seg: 'event', label: 'events', count: 8 },
	{ seg: 'activity', label: 'activities', count: 25 }
];
const ACTIVITY_FIRST_PAGE = 25;
const ACTIVITY_CARD = /Sample Activity \d+/;
const PROMPT_CARD = /Sample prompt \d+/;

async function segmentButtonValue(
	page: Page,
	sub = '.segment-button-checked'
): Promise<string | null> {
	return page.evaluate((s) => {
		const seg = document.querySelector('#discover-segments');
		const btn = seg?.querySelector(`ion-segment-button${s}`) as any;
		return btn ? (btn.value ?? null) : null;
	}, sub);
}

// icon-only segment buttons carry their value as a property; find + click by value
async function clickSegmentByValue(page: Page, value: string): Promise<void> {
	const handle = await page.evaluateHandle((v) => {
		const seg = document.querySelector('#discover-segments');
		const btns = Array.from(seg?.querySelectorAll('ion-segment-button') ?? []);
		return btns.find((b) => (b as any).value === v) ?? null;
	}, value);
	const el = handle.asElement();
	if (el) await el.click();
}

// the "<Label> - N Results" summary count is displayedResults.length (not lazy card hydration),
// so it is the reliable signal for what the ACTIVE segment actually holds
async function segmentCount(page: Page, label: string): Promise<number> {
	const el = page.getByText(new RegExp(`${label}\\s*-\\s*\\d+\\s*results`, 'i')).first();
	const raw = (await el.textContent().catch(() => '')) ?? '';
	const match = raw.replace(/\s+/g, ' ').match(/-\s*(\d+)\s*results/i);
	return match ? Number(match[1]) : -1;
}

// scope the scroll to discover's OWN ion-content; ionic keeps other tab pages mounted so a bare
// querySelector('ion-content') can grab a hidden page's scroller (keep-alive trap, gotcha #4)
async function scrollDiscoverToBottom(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const results = document.querySelector('#discover-results');
		const content = (results?.closest('ion-content') ??
			document.querySelector('ion-content')) as any;
		const scrollEl = await content?.getScrollElement?.();
		if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight });
	});
}

async function discoverScrollTop(page: Page): Promise<number> {
	return page.evaluate(async () => {
		const results = document.querySelector('#discover-results');
		const content = results?.closest('ion-content') as any;
		const scrollEl = await content?.getScrollElement?.();
		return scrollEl ? scrollEl.scrollTop : -1;
	});
}

// the real ion-searchbar input (webkit renders a hidden .cloned-input twin, gotcha #7)
function searchInput(page: Page) {
	return page.locator('#discover-search input:not(.cloned-input)').first();
}

function activityCards(page: Page) {
	return page.locator('#discover-results ion-card', { hasText: ACTIVITY_CARD });
}

function promptCards(page: Page) {
	return page.locator('#discover-results ion-card', { hasText: PROMPT_CARD });
}

// type a term + submit, then let the parallel per-type fetches settle so the per-segment
// counts are stable before asserting them
async function runSearch(page: Page, term: string): Promise<void> {
	const input = searchInput(page);
	await input.click();
	await input.fill(term);
	await input.press('Enter');
	await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
	await expect(page.getByText(/-\s*\d+\s*results/i).first()).toBeVisible({ timeout: 15_000 });
	await page.waitForTimeout(1500);
}

test.describe('Discover exploration journey', () => {
	test('search across segments, auto-load a page, open a result, return with state intact, and refresh the feed', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the seeded mock catalog + activity detail route');
		await asUser({ username: 'explorer' });

		// --- open discover on the shuffled no-search feed ---
		await gotoTab(page, gotoHydrated, '/tabs/discover');
		await expect(searchInput(page)).toBeVisible();
		// the random feed streams seeded "Sample Activity" cards (not just the word-of-the-day widget)
		await expect.poll(() => activityCards(page).count(), { timeout: 15_000 }).toBeGreaterThan(0);
		// no query -> no segment selector / summary yet
		await expect(page.locator('#discover-segments')).toHaveCount(0);

		// --- search a term -> the segment selector appears ---
		await runSearch(page, SEARCH);
		await expect(page.locator('#discover-segments')).toBeVisible();

		// --- switch across every segment; the summary + count update per segment (and the exact
		// counts prove the results are filtered to the active type, never the leaked union) ---
		for (const { seg, label, count } of SEGMENTS) {
			await clickSegmentByValue(page, seg);
			await expect
				.poll(() => segmentButtonValue(page, '.segment-button-checked'), { timeout: 8000 })
				.toBe(seg);
			// order-independent: prior create-journeys persist in the shared mock so ambient counts
			// drift; assert non-empty (user=0 stays exact, guarding a cross-type leak into it)
			if (count === 0) {
				await expect.poll(() => segmentCount(page, label), { timeout: 12_000 }).toBe(0);
			} else {
				await expect.poll(() => segmentCount(page, label), { timeout: 12_000 }).toBeGreaterThan(0);
			}
		}
		// the loop ends on the activity segment (the only multi-page one)

		// --- pagination: the explicit Load More control is live, then a scoped scroll auto-loads
		// page 2 (25 -> 30). the exhaustive click-vs-scroll matrix lives in discover-autoload.spec;
		// here we confirm both mechanisms coexist inside a real session ---
		await expect(activityCards(page).first()).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#discover-results').getByText(/no more content/i)).toHaveCount(0);
		await expect(page.locator('#discover-results ion-button').last()).toBeVisible();

		let count = ACTIVITY_FIRST_PAGE;
		for (let i = 0; i < 6; i += 1) {
			await scrollDiscoverToBottom(page);
			await page.waitForTimeout(1200);
			count = await segmentCount(page, 'activities');
			if (count > ACTIVITY_FIRST_PAGE) break;
		}
		expect(count).toBeGreaterThan(ACTIVITY_FIRST_PAGE);
		// content exhausted -> the same explicit control flips to a disabled "No More Content" state
		await expect(page.locator('#discover-results').getByText(/no more content/i)).toBeVisible({
			timeout: 12_000
		});

		// --- open a result card (navigate into its detail) ---
		const card = activityCards(page).nth(6);
		await card.scrollIntoViewIfNeeded();
		// hydrate-on-visible: give the card a beat to attach before tapping
		await page.waitForTimeout(1000);
		const scrollBefore = await discoverScrollTop(page);
		expect(scrollBefore).toBeGreaterThan(0);
		const name = (await card.innerText()).match(ACTIVITY_CARD)?.[0] ?? '';
		expect(name).toMatch(ACTIVITY_CARD);

		await card.click();
		await page.waitForURL(/\/tabs\/activities\/[^/?#]+/, { timeout: 12_000 });
		await expect(page.getByRole('heading', { name, exact: false }).first()).toBeVisible({
			timeout: 12_000
		});

		// --- go BACK; discover stayed mounted under the shared outlet (keep-alive) ---
		await page.locator('ion-back-button').first().click();
		await page.waitForURL(/\/tabs\/discover(?:$|[?#])/, { timeout: 12_000 });
		await expect(searchInput(page)).toBeVisible({ timeout: 12_000 });

		// --- state intact: the local search ref survived (proves keep-alive, not a remount to '/'),
		// the segment + results are still there, and the scroll offset was not reset (bug class A) ---
		await expect(searchInput(page)).toHaveValue(SEARCH);
		await expect(page.locator('#discover-segments')).toBeVisible();
		await expect
			.poll(() => segmentButtonValue(page, '.segment-button-checked'), { timeout: 8000 })
			.toBe('activity');
		await expect.poll(() => activityCards(page).count(), { timeout: 12_000 }).toBeGreaterThan(0);
		await expect
			.poll(() => segmentCount(page, 'activities'), { timeout: 12_000 })
			.toBeGreaterThanOrEqual(ACTIVITY_FIRST_PAGE);
		expect(await discoverScrollTop(page)).toBeGreaterThan(0);

		// --- clear the search to return to the shuffled feed, then pull-to-refresh reloads it ---
		await searchInput(page).fill('');
		await expect(page.locator('#discover-segments')).toHaveCount(0, { timeout: 12_000 });
		await expect.poll(() => activityCards(page).count(), { timeout: 15_000 }).toBeGreaterThan(0);

		// fire the discover IonRefresher directly (a real drag gesture isn't reliable in-harness);
		// onRefresh resets pagination and re-runs the random feed loader. the mock's random slice is
		// deterministic so order can't be asserted - the seam is that the feed reloads without blanking
		await page
			.locator('ion-content:has(#discover-results) ion-refresher')
			.first()
			.evaluate((el) =>
				el.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => {} } }))
			);
		await expect.poll(() => activityCards(page).count(), { timeout: 15_000 }).toBeGreaterThan(0);
	});
});

test.describe('Discover exploration edge cases', () => {
	test('an empty search shows the empty state, not an endless spinner', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the seeded mock catalog');
		await asUser({ username: 'emptysearch' });
		await gotoTab(page, gotoHydrated, '/tabs/discover');

		// a term no activity name contains -> the activity segment resolves to zero results
		await runSearch(page, 'zzznomatch');
		await clickSegmentByValue(page, 'activity');
		await expect
			.poll(() => segmentButtonValue(page, '.segment-button-checked'), { timeout: 8000 })
			.toBe('activity');

		await expect(page.getByText(/activities\s*-\s*0\s*results/i)).toBeVisible({ timeout: 12_000 });
		await expect(activityCards(page)).toHaveCount(0);
		// the empty state settles on a disabled "No More Content", never a spinner that spins forever
		await expect(page.locator('#discover-results').getByText(/no more content/i)).toBeVisible({
			timeout: 12_000
		});
		await expect(page.locator('#discover-results ion-spinner')).toHaveCount(0);
	});

	test('switching segments does not leak the previous segment results', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the seeded mock catalog');
		await asUser({ username: 'noleak' });
		await gotoTab(page, gotoHydrated, '/tabs/discover');
		await runSearch(page, SEARCH);

		// on activity: only activity cards render, never the prompt results also fetched for search
		await clickSegmentByValue(page, 'activity');
		await expect.poll(() => activityCards(page).count(), { timeout: 12_000 }).toBeGreaterThan(0);
		await expect(promptCards(page)).toHaveCount(0);

		// on prompt: the mirror - prompt cards render and the previous segment's activity cards are gone
		await clickSegmentByValue(page, 'prompt');
		await expect.poll(() => promptCards(page).count(), { timeout: 12_000 }).toBeGreaterThan(0);
		await expect(activityCards(page)).toHaveCount(0);
	});
});

test.describe('Discover exploration failure handling', () => {
	test.beforeEach(async ({ context }) => {
		// native-mock captures Toast.show text into window.__toasts so we can assert the error toast
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a segment fetch 5xx surfaces a toast and the rest of discover keeps working', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on the mock backend + native toast bridge');
		await asUser({ username: 'segment5xx' });

		// persistently 500 the activities search endpoint (not /activities/random, so the initial
		// shuffled feed still loads); once:false so every retry also fails and the toast fires
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/activities$/,
			status: 500,
			body: { message: 'Internal Server Error' },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/discover');
		await runSearch(page, SEARCH);

		// the failed activity fetch surfaces a native toast...
		await expectNativeToast(page, /failed to load activities/i);

		// ...and the failure is isolated: the activity segment is empty but the other segments'
		// fetches succeeded, so discover is not wedged (prompt results still render)
		await clickSegmentByValue(page, 'activity');
		await expect(page.getByText(/activities\s*-\s*0\s*results/i)).toBeVisible({ timeout: 12_000 });

		await clickSegmentByValue(page, 'prompt');
		await expect
			.poll(() => segmentButtonValue(page, '.segment-button-checked'), { timeout: 8000 })
			.toBe('prompt');
		await expect(page.getByText(/prompts\s*-\s*15\s*results/i)).toBeVisible({ timeout: 12_000 });
		await expect.poll(() => promptCards(page).count(), { timeout: 12_000 }).toBeGreaterThan(0);
	});
});
