import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';
import {
	AIM_BASELINES,
	CHROMA_AREA_BUDGET,
	formatTable,
	MAX_HERO_REGIONS,
	measureChroma,
	measurePixels,
	measureScreen,
	REPORT_FILE,
	writeReport,
	type ScreenReport,
	type VisualEvalReport
} from './utils/visual-eval';

/**
 * Visual-quality gate. Screens are captured to /tmp/sky-visual-eval/ (never the
 * repo), reduced to numbers, and judged on two hard budgets - one hero per
 * screen, high-chroma paint under 5% of the viewport. The AIM pixel metrics and
 * the complexity budget are recorded as a trend, because their absolute values
 * depend on the kernel and the rasterizer.
 */

interface Screen {
	name: string;
	path: string;
	ready: (page: Page) => Promise<void>;
}

const SCREENS: Screen[] = [
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
			await expect(page.locator('#discover-results')).toBeVisible({ timeout: 15000 });
		}
	},
	{
		name: 'quests',
		path: '/tabs/quests',
		ready: async (page) => {
			await expect(
				page
					.getByText(/daily explorer/i)
					.filter({ visible: true })
					.first()
			).toBeVisible({ timeout: 15000 });
		}
	},
	{
		name: 'quest detail',
		path: '/tabs/quests/q-1',
		ready: async (page) => {
			await expect(page.locator('#quest-button')).toBeVisible({ timeout: 15000 });
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
		name: 'downloads',
		path: '/tabs/downloads',
		ready: async (page) => {
			await expect(page.getByText(/no downloads yet/i)).toBeVisible({ timeout: 15000 });
		}
	}
];

interface SyntheticRect {
	color: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Render a synthetic PNG in-browser so the kernel can be checked against known input. */
async function synthesizePng(page: Page, rects: SyntheticRect[]): Promise<Buffer> {
	const dataUrl = await page.evaluate((shapes) => {
		const canvas = document.createElement('canvas');
		canvas.width = 412;
		canvas.height = 900;
		const ctx = canvas.getContext('2d')!;
		for (const shape of shapes) {
			ctx.fillStyle = shape.color;
			ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
		}
		return canvas.toDataURL('image/png');
	}, rects);
	return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

const WHITE_FIELD: SyntheticRect = { color: '#ffffff', x: 0, y: 0, w: 412, h: 900 };

test.describe('Visual quality metrics (mobile)', () => {
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

	test('measures every screen and keeps the hero + chroma budgets', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		test.setTimeout(240_000);
		await asUser({ username: 'visualeval' });

		const screens: ScreenReport[] = [];
		for (const screen of SCREENS) {
			await gotoTab(page, gotoHydrated, screen.path);
			await screen.ready(page);
			screens.push(await measureScreen(page, context, screen.name, screen.path));
		}

		const file = writeReport(screens);
		const report = JSON.parse(readFileSync(file, 'utf-8')) as VisualEvalReport;
		const table = formatTable(report);
		await test.info().attach('visual-eval', { body: table, contentType: 'text/plain' });
		if (process.env.VISUAL_EVAL_QUIET !== '1') {
			console.log(
				`\n${table}\n\nreport: ${REPORT_FILE}\nscreenshots: ${SCREENS.length} in /tmp/sky-visual-eval\n`
			);
		}

		for (const s of screens) {
			// a degenerate capture (blank page, failed decode) would make every budget pass
			expect(
				s.pixels.edgeDensity,
				`${s.name}: the capture has no edges at all, so it is probably blank`
			).toBeGreaterThan(0.001);
			expect(
				s.complexity.textGroupCount,
				`${s.name}: the complexity pass found no text groups`
			).toBeGreaterThan(0);

			expect
				.soft(
					s.pixels.heroRegions,
					`${s.name}: ${s.pixels.heroRegions} salient regions at 120px wide (areas ${s.pixels.heroAreaRatios.join(', ')}). More than ${MAX_HERO_REGIONS} means no hero - at a 500ms glance a viewer only resolves global structure, so competing regions read as none.`
				)
				.toBeLessThanOrEqual(MAX_HERO_REGIONS);

			expect
				.soft(
					s.chroma.highChromaRatio,
					`${s.name}: high-chroma paint (OKLCH C > 0.12) covers ${(s.chroma.highChromaRatio * 100).toFixed(1)}% of the viewport, over the ${(CHROMA_AREA_BUDGET * 100).toFixed(0)}% accent budget (max C on screen ${s.chroma.maxChroma.toFixed(3)})`
				)
				.toBeLessThanOrEqual(CHROMA_AREA_BUDGET);
		}
	});

	// the metrics are only worth reporting if the kernel measures what it claims to
	test('the metric kernel matches known synthetic input', async ({ page, context }) => {
		skipIfIntegration('runs the pixel kernel, not the app');
		await page.setContent('<div id="synth"></div>');

		const single = await measurePixels(
			context,
			await synthesizePng(page, [WHITE_FIELD, { color: '#000000', x: 40, y: 100, w: 332, h: 300 }])
		);
		expect(single.width, 'the kernel decoded the wrong width').toBe(412);
		expect(single.heroRegions, 'one black block on white should be exactly one hero').toBe(1);
		expect(
			single.figureGroundContrast,
			'pure black against pure white should be near-maximum figure-ground contrast'
		).toBeGreaterThan(0.9);
		expect(single.edgeDensity, 'the block outline should register as edges').toBeGreaterThan(0);
		expect(
			measureChroma(single.colors).highChromaRatio,
			'a greyscale image must contain no high-chroma pixels'
		).toBe(0);

		const multi = await measurePixels(
			context,
			await synthesizePng(page, [
				WHITE_FIELD,
				{ color: '#000000', x: 20, y: 40, w: 160, h: 160 },
				{ color: '#000000', x: 20, y: 380, w: 160, h: 160 },
				{ color: '#000000', x: 20, y: 700, w: 160, h: 160 }
			])
		);
		expect(multi.heroRegions, 'three separated blocks should count as three regions').toBe(3);

		const red = measureChroma(
			(
				await measurePixels(
					context,
					await synthesizePng(page, [WHITE_FIELD, { color: '#ff0000', x: 0, y: 0, w: 412, h: 450 }])
				)
			).colors
		);
		expect(
			red.highChromaRatio,
			'half the frame in pure red should read as ~50% area'
		).toBeGreaterThan(0.45);
		expect(red.highChromaRatio).toBeLessThan(0.55);
		expect(red.maxChroma, 'pure red should sit around OKLCH C 0.25').toBeGreaterThan(0.2);
	});

	test('the AIM baselines stay pinned to the published values', async () => {
		// a silent baseline edit would turn the trend into noise
		expect(AIM_BASELINES).toEqual({
			edgeDensity: 0.115,
			contourCongestion: 11.165,
			figureGroundContrast: 0.206
		});
	});
});
