import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// MInfoCardGroup is a hand-rolled translateX carousel. the dashboard feed decides group-vs-single
// with Math.random(), so it can't be shaped deterministically; instead drive the testBuild
// widget-harness (?group=1), which renders a fixed 3-slide MInfoCardGroup with a tap counter.
// this is the same harness pattern report.spec.ts + widget-interactive.spec.ts already use.
const HARNESS = '/__test__/widget-harness?group=1';

const dot = (page: Page, n: number) => page.locator(`button[aria-label="Go to slide ${n}"]`);
const nextArrow = (page: Page) => page.locator('[aria-label="Next slide"]');
const prevArrow = (page: Page) => page.locator('[aria-label="Previous slide"]');

async function openGroupHarness(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>
): Promise<void> {
	await gotoHydrated(HARNESS);
	await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });
	await expect(page.getByTestId('info-card-group')).toBeVisible({ timeout: 12_000 });
	// dots only render after calculateSlides() measures totalSlides > 1 with a > 0 viewport width,
	// so a visible dot also guarantees slideWidth is set (the drag threshold depends on it)
	await expect(dot(page, 1)).toBeVisible({ timeout: 12_000 });
}

test.describe('MInfoCardGroup carousel', () => {
	test.beforeEach(async ({ context, asUser }) => {
		await installNativeMock(context, { platform: 'ios' });
		await asUser({ username: 'carouseluser' });
	});

	test('the Next arrow advances the active dot', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await expect(dot(page, 1)).toHaveClass(/w-4/);
		await expect(dot(page, 1)).toHaveClass(/bg-primary/);

		await nextArrow(page).click();

		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(dot(page, 2)).toHaveClass(/bg-primary/);
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
	});

	test('the dot buttons jump straight to a specific slide', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await dot(page, 3).click();
		await expect(dot(page, 3)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
	});

	test('the Prev arrow steps back to the previous slide', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await nextArrow(page).click();
		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });

		// a slide change holds a 300ms transition lock that drops a second nav; let it clear
		await page.waitForTimeout(350);
		await prevArrow(page).click();
		await expect(dot(page, 1)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(dot(page, 2)).not.toHaveClass(/w-4/);
	});

	// THE REGRESSION: on a non-first slide, tapping an interactive child used to fire the track's
	// mousedown/mouseup drag handlers (the child only @click.stop) and snap back to slide 1. it now
	// must be a no-op for the carousel while the child's own click still runs.
	test('tapping a button inside the active card does not snap back to the first slide', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await nextArrow(page).click();
		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });

		const secondCard = page.getByTestId('info-card-slide').nth(1);
		const tapCount = page.getByTestId('tap-count');
		await expect(tapCount).toHaveText('0');

		// the visible (second) card's own action button; a tap here bubbles mousedown/mouseup to
		// the track, which is exactly the drag path the fix has to neutralize
		await secondCard.locator('ion-button').first().click();

		// the child's click fired ...
		await expect(tapCount).toHaveText('1', { timeout: 8000 });
		// ... and the carousel stayed on slide 2 (pre-fix this snapped back to slide 1)
		await expect(dot(page, 2)).toHaveClass(/w-4/);
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
		await expect(secondCard).toBeVisible();
	});

	test('a plain tap on a non-first card (no drag) never changes the slide', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await nextArrow(page).click();
		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });

		// click the card body away from its button (header region); no cursor movement => a tap
		const secondCard = page.getByTestId('info-card-slide').nth(1);
		await secondCard.click({ position: { x: 15, y: 12 } });

		await expect(dot(page, 2)).toHaveClass(/w-4/);
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
		// the card body has no link, so the tap must not have hit its action button either
		await expect(page.getByTestId('tap-count')).toHaveText('0');
	});

	test('a real horizontal drag past the threshold pages forward', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await expect(dot(page, 1)).toHaveClass(/w-4/);

		const track = page.getByTestId('info-card-track');
		const box = await track.boundingBox();
		if (!box) throw new Error('carousel track has no bounding box');

		const y = box.y + box.height / 2;
		// drag left ~70% of the track width; the paging threshold is a quarter-slide (~box.width/4)
		await page.mouse.move(box.x + box.width * 0.8, y);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.1, y, { steps: 12 });
		await page.mouse.up();

		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });
		// a drag produces no click, so the card's action button must not have fired
		await expect(page.getByTestId('tap-count')).toHaveText('0');
	});

	test('arrows disable at both ends (no wrap without loop)', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		// first slide: Prev disabled (the aria-label resolves to ionic's inner native button, which
		// carries the `disabled` attribute; the button-disabled class sits on the ion-button host)
		await expect(dot(page, 1)).toHaveClass(/w-4/);
		await expect(prevArrow(page)).toBeDisabled();

		// jump to the last slide: Next disabled
		await dot(page, 3).click();
		await expect(dot(page, 3)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(nextArrow(page)).toBeDisabled();
	});
});
