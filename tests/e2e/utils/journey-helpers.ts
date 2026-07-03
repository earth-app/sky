import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export async function gotoTab(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>,
	path: string
): Promise<void> {
	await gotoHydrated(path);
	// the outlet keeps prior pages mounted-but-hidden, so assert the VISIBLE ion-content
	await expect(page.locator('ion-content:visible').first()).toBeVisible({ timeout: 12_000 });
}

export async function expectListHasItems(page: Page, cardSelector: string, min = 1): Promise<void> {
	await expect
		.poll(async () => page.locator(cardSelector).count(), { timeout: 12_000 })
		.toBeGreaterThanOrEqual(min);
}

/** Type into an Ionic searchbar and submit (Enter). */
export async function searchIn(page: Page, searchbarId: string, term: string): Promise<void> {
	const input = page.locator(`#${searchbarId} input`).first();
	await input.click();
	await input.fill(term);
	await input.press('Enter');
}

export async function triggerInfiniteScroll(
	page: Page,
	cardSelector: string
): Promise<{ before: number; after: number }> {
	const before = await page.locator(cardSelector).count();
	// scroll the active ion-content's inner scroll element to the bottom
	await page.evaluate(async () => {
		const content = document.querySelector('ion-content');
		const scrollEl = await (content as any)?.getScrollElement?.();
		if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight });
	});
	await page.waitForTimeout(1500);
	const after = await page.locator(cardSelector).count();
	return { before, after };
}

/** Fill an Ionic text input located by its placeholder. */
export async function fillByPlaceholder(
	page: Page,
	placeholder: string | RegExp,
	value: string
): Promise<void> {
	const field = page.getByPlaceholder(placeholder).first();
	await field.click();
	await field.fill(value);
}

/** Click a button by accessible name (Ionic buttons expose role=button). */
export async function clickButton(page: Page, name: string | RegExp): Promise<void> {
	await page.getByRole('button', { name }).first().click();
}

/**
 * Assert an Ion segment (tabbed control) switched to the labeled segment. Used
 * by the Discover page's Users/Activities/Articles/Prompts/Events segments.
 */
export async function selectSegment(page: Page, label: string | RegExp): Promise<void> {
	const seg = page.locator('ion-segment-button', { hasText: label }).first();
	await seg.click();
	await expect(seg).toHaveAttribute('aria-selected', 'true', { timeout: 6000 });
}

/** Wait for a Capacitor toast containing the partial text to appear. */
export async function expectNativeToast(page: Page, partial: string | RegExp): Promise<void> {
	const matcher = typeof partial === 'string' ? new RegExp(partial, 'i') : partial;
	await expect
		.poll(
			async () => {
				// a success flow often navigates right after toasting, which destroys the
				// execution context mid-evaluate; swallow that and let the poll retry
				try {
					return (await page.evaluate(() => (window as any).__toasts ?? [])) as string[];
				} catch {
					return [] as string[];
				}
			},
			{ timeout: 8000 }
		)
		.toEqual(expect.arrayContaining([expect.stringMatching(matcher)]));
}
