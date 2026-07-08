import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

const FIRST_PAGE = 25;

async function activitiesResultCount(page: Page): Promise<number> {
	const el = page.getByText(/activities\s*-\s*\d+\s*results/i).first();
	const raw = (await el.textContent().catch(() => '')) ?? '';
	const match = raw.replace(/\s+/g, ' ').match(/-\s*(\d+)\s*results/i);
	return match ? Number(match[1]) : -1;
}

async function scrollToBottom(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const results = document.querySelector('#discover-results');
		const content = (results?.closest('ion-content') ??
			document.querySelector('ion-content')) as any;
		const scrollEl = await content?.getScrollElement?.();
		if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight });
	});
}

async function enterActivitySearch(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>,
	asUser: (overrides?: Record<string, any>) => Promise<Record<string, any>>
): Promise<void> {
	await asUser();
	await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');
	await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });

	const input = page.locator('#discover-search input').first();
	await input.click();
	await input.fill('Sample');
	await input.press('Enter');

	// wait for the search page's summary, then let the first page fully settle
	await expect(page.getByText(/activities\s*-\s*\d+\s*results/i)).toBeVisible({ timeout: 15_000 });
	await expect.poll(() => activitiesResultCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
	await page.waitForTimeout(1500);
}

test.describe('Discover auto-load on scroll', () => {
	test('auto-loads the next page on scroll when the setting is on (default)', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the seeded mock catalog pagination');

		// no seeding: discoverAutoLoad defaults to true, so this also proves the default is ON
		await enterActivitySearch(page, gotoHydrated, asUser);

		// the explicit Load More control stays present alongside auto-load
		await expect(page.locator('#discover-results ion-button').last()).toBeVisible();

		// scrolling (no click) must pull the next page; > FIRST_PAGE means a second page loaded
		let count = FIRST_PAGE;
		for (let i = 0; i < 5; i += 1) {
			await scrollToBottom(page);
			await page.waitForTimeout(1200);
			count = await activitiesResultCount(page);
			if (count > FIRST_PAGE) break;
		}
		expect(count).toBeGreaterThan(FIRST_PAGE);
	});

	test('does not auto-load on scroll when the setting is off, but Load More still works', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the seeded mock catalog pagination');

		// seed the setting OFF before boot; @capacitor/preferences (web) mirrors values under the
		// CapacitorStorage. prefix, JSON-serialized, which app.vue reads on settings init
		await page.addInitScript(() => {
			try {
				window.localStorage.setItem('CapacitorStorage.app.setting.discoverAutoLoad', 'false');
			} catch {
				// localStorage unavailable in this context; ignore
			}
		});

		await enterActivitySearch(page, gotoHydrated, asUser);
		const before = await activitiesResultCount(page);
		expect(before).toBeGreaterThan(0);

		// scrolling to the bottom must NOT load a new page (auto-load is off)
		for (let i = 0; i < 3; i += 1) {
			await scrollToBottom(page);
			await page.waitForTimeout(900);
		}
		expect(await activitiesResultCount(page)).toBe(before);

		// the explicit Load More button still fetches the next page
		await page
			.locator('#discover-results ion-button')
			.last()
			.click()
			.catch(() => {});
		await expect
			.poll(() => activitiesResultCount(page), { timeout: 15_000 })
			.toBeGreaterThan(before);
	});
});
