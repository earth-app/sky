import type { Page } from '@playwright/test';
import { expect, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

// ionic segment buttons keep their value as a JS property, not an html attribute, so read it live
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

async function clickSegmentByValue(page: Page, value: string): Promise<void> {
	const handle = await page.evaluateHandle((v) => {
		const seg = document.querySelector('#discover-segments');
		const btns = Array.from(seg?.querySelectorAll('ion-segment-button') ?? []);
		return btns.find((b) => (b as any).value === v) ?? null;
	}, value);
	const el = handle.asElement();
	if (el) await el.click();
}

test.describe('Discover tab', () => {
	test('renders the default shuffled results feed', async ({ page, gotoHydrated, asUser }) => {
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover');

		await expect(page.locator('#discover-search input')).toBeVisible();
		await expect(page.locator('#discover-results')).toBeVisible();
		// the mixed feed streams in Ion cards from the seeded catalog
		await expect
			.poll(async () => page.locator('#discover-results ion-card').count(), { timeout: 15_000 })
			.toBeGreaterThan(0);
	});

	test('pins the activities segment via ?tab and shows a results summary', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		await asUser();
		// route-pinned segment reveals the selector + the "Activities - N Results" summary
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');

		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		// ionic stores the segment value as a property (not a reflected attr) and marks the
		// active one with .segment-button-checked, so assert the checked button IS activity
		await expect
			.poll(() => segmentButtonValue(page, '.segment-button-checked'), { timeout: 8000 })
			.toBe('activity');
		await expect(page.getByText(/activities\s*-\s*\d+\s*results/i)).toBeVisible({
			timeout: 15_000
		});
	});

	test('switches the pinned segment to users', async ({ page, gotoHydrated, asUser }) => {
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');
		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });

		// icon-only segment buttons carry value as a property; click the user one, then assert
		// it became the checked segment
		await clickSegmentByValue(page, 'user');
		await expect
			.poll(() => segmentButtonValue(page, '.segment-button-checked'), { timeout: 8000 })
			.toBe('user');
		await expect(page.getByText(/users\s*-\s*\d+\s*results/i)).toBeVisible({ timeout: 15_000 });
	});

	test('search updates the results summary label', async ({ page, gotoHydrated, asUser }) => {
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover');

		const input = page.locator('#discover-search input').first();
		await input.click();
		await input.fill('Activity');
		await input.press('Enter');

		// typing enters search mode which reveals the segment selector + summary
		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/-\s*\d+\s*results/i).first()).toBeVisible({ timeout: 15_000 });
	});

	test('infinite scroll grows the activities stream or reports no more content', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		await asUser();
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');
		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		await expect
			.poll(async () => page.locator('#discover-results ion-card').count(), { timeout: 15_000 })
			.toBeGreaterThan(0);

		const before = await page.locator('#discover-results ion-card').count();
		// discover paginates via an explicit load-more control, not IonInfiniteScroll
		const loadMore = page.getByRole('button', { name: /no more content/i });
		for (let i = 0; i < 4; i += 1) {
			const done = await loadMore.isVisible().catch(() => false);
			if (done) break;
			await page.evaluate(async () => {
				const content = document.querySelector('ion-content');
				const scrollEl = await (content as any)?.getScrollElement?.();
				if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight });
			});
			await page
				.locator('#discover-results ion-button:not([disabled])')
				.first()
				.click()
				.catch(() => {});
			await page.waitForTimeout(1200);
		}

		const after = await page.locator('#discover-results ion-card').count();
		const exhausted = await loadMore.isVisible().catch(() => false);
		expect(after > before || exhausted).toBeTruthy();
	});
});
