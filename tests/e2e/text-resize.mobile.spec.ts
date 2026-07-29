import type { Page } from '@playwright/test';
import {
	applyTextSpacing,
	collectOverflow,
	measureScaleResponse,
	measureTypography,
	setRootFontSize,
	settleAnimations,
	summarize,
	type OverflowReport,
	type TypographySample
} from './utils/a11y-helpers';
import { suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

/**
 * Text-resize and text-spacing gate at phone width.
 *
 * WCAG 1.4.4 (Resize Text, AA) - text up to 200% without loss of content or
 * functionality. Two levers, because Sky has two: the in-app text-size setting
 * writes `--app-ui-scale` on `<html>`, and browser text zoom grows the root font
 * size that every `--text-*` token is a `rem` multiple of.
 *
 * WCAG 1.4.12 (Text Spacing, AA) - all four user overrides applied at once. It
 * is a no-clipping requirement, not a styling rule: the page may reflow however
 * it likes as long as nothing is lost.
 */

/**
 * `--app-ui-scale` multiplies the `--text-*` tokens in main.css, which is where all of Sky's
 * own type comes from. It cannot reach Ionic's component chrome: `ion-title`, `ion-button`
 * labels, `ion-toggle`/`ion-label` rows, the `ion-textarea` label and `ion-card-content` size
 * themselves in their own component CSS, and slotted text inherits that. Covering them would
 * mean scaling the root `font-size`, which also rescales every rem of padding and reflows the
 * tour spotlight and carousel geometry - a trade-off deliberately not taken. Browser zoom
 * (the second lever below) does reach them, so WCAG 1.4.4 is still satisfied.
 */
const IONIC_CHROME = [
	'ion-title', // 20px, title-default
	'ion-button', // 13-14px per size
	'ion-label', // 16px in an ion-item, 14px in an ion-chip
	'ion-toggle', // 16px
	'ion-textarea', // 16px label-text
	'ion-card-content', // 0.875rem
	'ion-card-title', // 1.25rem, only when the card passes no --text-* class
	'ion-card-subtitle' // 0.875rem, same
];

// app-owned sizes declared as a rem literal instead of a --text-* token, so the in-app setting
// misses them while browser zoom still grows them. one entry per known offender, never a prefix
const REM_LITERALS = [
	'.m-scroll-cue' // MScrollCue.vue: font-size: 0.875rem
];

// the exceptions are enumerated rather than absorbed into a looser threshold, so a NEW
// non-scaling text box anywhere outside these two sets still fails the gate
const SCALE_EXEMPT = [...IONIC_CHROME, ...REM_LITERALS];

// tokens scale exactly 2.00x; the floor only absorbs sub-pixel rounding
const SCALE_FLOOR = 1.9;

interface Surface {
	name: string;
	path: string;
	ready: (page: Page) => Promise<void>;
}

const SURFACES: Surface[] = [
	{
		name: 'dashboard',
		path: '/tabs/dashboard',
		ready: async (page) => {
			await expect(page.getByRole('heading', { name: 'Nature Minutes' })).toBeVisible({
				timeout: 15000
			});
		}
	},
	{
		name: 'discover',
		path: '/tabs/discover',
		ready: async (page) => {
			await expect(page.locator('#discover-search input')).toBeVisible({ timeout: 15000 });
			await expect(page.locator('#discover-results')).toBeVisible({ timeout: 15000 });
		}
	},
	{
		name: 'article detail',
		path: '/tabs/articles/art-1',
		ready: async (page) => {
			await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
				timeout: 15000
			});
		}
	},
	{
		name: 'settings',
		path: '/tabs/settings',
		ready: async (page) => {
			await expect(page.locator('ion-toggle').first()).toBeVisible({ timeout: 15000 });
		}
	},
	{
		name: 'prompt create form',
		path: '/tabs/prompts/new',
		ready: async (page) => {
			await expect(page.locator('ion-textarea').first().locator('textarea')).toBeVisible({
				timeout: 15000
			});
		}
	}
];

// #region assertions

function assertNoOverflow(label: string, r: OverflowReport): void {
	expect
		.soft(
			r.scrollWidth,
			`${label}: the document scrolls horizontally (${r.scrollWidth}px of content in a ${r.clientWidth}px viewport)`
		)
		.toBeLessThanOrEqual(r.clientWidth + 1);
	expect
		.soft(
			r.overflow,
			`${label}: ${r.overflow.length} element(s) bleed past the right edge of the ${r.viewport.width}px viewport:\n${summarize(r.overflow)}`
		)
		.toEqual([]);
}

function assertNoClipping(label: string, r: OverflowReport): void {
	expect
		.soft(
			r.clipped,
			`${label}: ${r.clipped.length}/${r.scanned} elements are shorter than their own text:\n${summarize(r.clipped)}`
		)
		.toEqual([]);
	expect
		.soft(
			r.clippedHidden,
			`${label}: ${r.clippedHidden.length}/${r.scanned} overflow:hidden boxes cut their own text with no clamp or ellipsis to opt in:\n${summarize(r.clippedHidden)}`
		)
		.toEqual([]);
}

async function auditAfterReflow(page: Page, label: string): Promise<void> {
	await settleAnimations(page, label);
	const report = await collectOverflow(page);
	expect(report.scanned, `${label}: the audit measured no elements`).toBeGreaterThan(0);
	assertNoOverflow(label, report);
	assertNoClipping(label, report);
}

/**
 * Open a surface and take the baseline typography. Settling first is not
 * optional: mid-slide the incoming page is parked a full viewport to the right,
 * every rect reads as offstage, and the baseline comes back as zero text boxes.
 */
async function openSurface(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>,
	surface: Surface
): Promise<TypographySample> {
	await gotoTab(page, gotoHydrated, surface.path);
	await surface.ready(page);
	await settleAnimations(page, `${surface.name} (baseline)`);
	const before = await measureTypography(page);
	expect(
		before.textBoxes,
		`${surface.name}: the baseline pass found no onscreen text box to measure`
	).toBeGreaterThan(0);
	return before;
}

// #endregion

test.describe('Text resize and spacing (mobile)', () => {
	test.beforeEach(async ({ context }) => {
		test.slow();
		await installNativeMock(context, { platform: 'ios' });
		// a running tour dims the page and would park real content behind an overlay
		await suppressV060Tours(context);
		await context.addInitScript(() => {
			const w = window as unknown as { __prefs?: Record<string, string> };
			w.__prefs = { ...(w.__prefs ?? {}), hasOpened: 'true' };
		});
	});

	for (const surface of SURFACES) {
		test(`${surface.name} survives 200% text via --app-ui-scale`, async ({
			page,
			gotoHydrated,
			asUser
		}) => {
			skipIfIntegration('measures the mocked surfaces at phone width');
			await asUser({ username: 'txscale' });

			await openSurface(page, gotoHydrated, surface);
			const samples = await measureScaleResponse(page, 2, SCALE_EXEMPT);
			const tokenBased = samples.filter((s) => !s.exempt);
			const stuck = tokenBased
				.filter((s) => s.afterPx < s.beforePx * SCALE_FLOOR)
				.map((s) => `${s.label} -> ${s.beforePx}px stayed ${s.afterPx}px`);

			expect(
				tokenBased.length,
				`${surface.name}: all ${samples.length} onscreen text boxes matched the exception set, so --app-ui-scale was never exercised here`
			).toBeGreaterThan(0);
			expect
				.soft(
					stuck,
					`${surface.name}: ${stuck.length}/${tokenBased.length} token-based text boxes ignored --app-ui-scale: 2, so the in-app text-size setting does not reach them. Either the size is a hardcoded literal (use a --text-* token) or it belongs in the documented exception set at the top of this spec:\n${summarize(stuck, 40)}`
				)
				.toEqual([]);

			await auditAfterReflow(page, `${surface.name} @ --app-ui-scale: 2`);
		});

		test(`${surface.name} survives 200% browser text zoom`, async ({
			page,
			gotoHydrated,
			asUser
		}) => {
			skipIfIntegration('measures the mocked surfaces at phone width');
			await asUser({ username: 'txzoom' });

			const before = await openSurface(page, gotoHydrated, surface);
			// 16px is the UA default, so 32px is exactly 200% for every rem-based token
			await setRootFontSize(page, 32);
			const after = await measureTypography(page);

			expect(after.rootFontPx, 'the root font-size override did not stick').toBe(32);
			expect
				.soft(
					after.medianFontPx,
					`${surface.name}: doubling the root font size did not grow the type (median ${before.medianFontPx}px -> ${after.medianFontPx}px over ${before.textBoxes} text boxes), so the tokens are not rem-based here`
				)
				.toBeGreaterThan(before.medianFontPx * 1.5);

			await auditAfterReflow(page, `${surface.name} @ root font-size 32px`);
		});

		test(`${surface.name} survives the WCAG 1.4.12 text-spacing overrides`, async ({
			page,
			gotoHydrated,
			asUser
		}) => {
			skipIfIntegration('measures the mocked surfaces at phone width');
			await asUser({ username: 'txspacing' });

			await openSurface(page, gotoHydrated, surface);
			await applyTextSpacing(page);
			const after = await measureTypography(page);

			// all four overrides have to be measurable, or the SC was never exercised
			expect
				.soft(
					after.letterSpacingPx,
					`${surface.name}: the 0.12em letter-spacing override never applied to ${after.sample}`
				)
				.toBeCloseTo(after.fontPx * 0.12, 1);
			expect
				.soft(
					after.wordSpacingPx,
					`${surface.name}: the 0.16em word-spacing override never applied to ${after.sample}`
				)
				.toBeCloseTo(after.fontPx * 0.16, 1);
			expect
				.soft(
					after.lineHeightPx,
					`${surface.name}: the 1.5 line-height override never applied to ${after.sample}`
				)
				.toBeCloseTo(after.fontPx * 1.5, 1);

			await auditAfterReflow(page, `${surface.name} @ 1.4.12 text spacing`);
		});
	}

	// without this the whole gate could silently degrade to a no-op (every audit reporting
	// clean because the collector stopped finding anything at all)
	test('the audit catches planted overflow and clipping', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'txselfcheck' });

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('ion-toggle').first()).toBeVisible({ timeout: 15000 });
		await settleAnimations(page, 'self-check');

		await page
			.locator('ion-content:visible')
			.first()
			.evaluate((host) => {
				const box = document.createElement('div');
				// pinned into the viewport; appended at the end of a long page it would sit
				// below the fold and the audit would (correctly) never look at it
				box.setAttribute('style', 'position:fixed;top:100px;left:8px;width:200px;z-index:1');
				box.innerHTML =
					'<div id="planted-bleed" style="width:2000px;height:10px">wide</div>' +
					'<div id="planted-clip" style="width:40px;height:8px;font-size:20px;white-space:nowrap">clipped sentence</div>' +
					'<div id="planted-hidden-clip" style="width:200px;height:12px;font-size:20px;overflow:hidden">two lines of text that will not fit inside twelve pixels</div>' +
					// the sr-only idiom cuts its own text on purpose, so it has to stay OUT of the
					// report - otherwise every visually-hidden heading reads as a clipping defect
					'<span id="planted-sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">announced but not rendered</span>';
				host.appendChild(box);
			});

		const report = await collectOverflow(page);
		expect(report.overflow.join('\n'), 'the overflow audit missed a 2000px-wide box').toContain(
			'div#planted-bleed'
		);
		expect(report.clipped.join('\n'), 'the clipping audit missed an 8px-tall text box').toContain(
			'div#planted-clip'
		);
		expect(
			report.clippedHidden.join('\n'),
			'the clipping audit missed an overflow:hidden box cutting its text'
		).toContain('div#planted-hidden-clip');
		expect(
			[...report.clipped, ...report.clippedHidden].join('\n'),
			'the clipping audit reported an sr-only box, which is a 1px clipped box by design'
		).not.toContain('planted-sr-only');
	});
});
