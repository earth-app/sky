import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	checkHardBudgets,
	CHROMA_AREA_BUDGET,
	CHROMA_LIMIT,
	collectDeviceShots,
	deviceShotName,
	formatDeviceTable,
	MAX_HERO_REGIONS,
	measureChroma,
	writeDeviceReport,
	type DeviceEvalReport,
	type DeviceScreenReport,
	type PixelMetrics
} from '../e2e/utils/visual-eval';

// quantized keys are (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2); 63 replicates back to 0xff
const WHITE_KEY = (63 << 12) | (63 << 6) | 63;
const RED_KEY = 63 << 12;

function pixels(overrides: Partial<PixelMetrics> = {}): PixelMetrics {
	return {
		width: 1206,
		height: 2622,
		edgeDensity: 0.1,
		contourCongestion: 10,
		figureGroundContrast: 0.2,
		heroRegions: 1,
		heroAreaRatios: [0.2],
		colors: { keys: [WHITE_KEY], counts: [4], sampled: 4 },
		...overrides
	};
}

function frame(name: string, overrides: Partial<DeviceScreenReport> = {}): DeviceScreenReport {
	return {
		name,
		screenshot: `/tmp/maestro-shots/${name}.png`,
		pixels: pixels(),
		chroma: { highChromaRatio: 0.01, maxChroma: 0.2, distinctColors: 12 },
		...overrides
	};
}

function shotDir(): string {
	return mkdtempSync(join(tmpdir(), 'sky-device-shots-'));
}

describe('collectDeviceShots', () => {
	it('returns nothing for a directory maestro never wrote', () => {
		expect(collectDeviceShots(join(tmpdir(), 'sky-device-shots-does-not-exist'))).toEqual([]);
	});

	it('finds nested PNGs, ignores everything else, and sorts them', () => {
		const dir = shotDir();
		mkdirSync(join(dir, 'ios', 'launch'), { recursive: true });
		writeFileSync(join(dir, 'ios', 'launch', 'splash.png'), 'not-a-real-png');
		writeFileSync(join(dir, 'ios', 'launch', 'dashboard.PNG'), 'not-a-real-png');
		writeFileSync(join(dir, 'ios', 'commands.json'), '[]');
		writeFileSync(join(dir, 'ios', 'maestro.log'), 'noise');

		expect(collectDeviceShots(dir)).toEqual([
			join(dir, 'ios/launch/dashboard.PNG'),
			join(dir, 'ios/launch/splash.png')
		]);
	});
});

describe('deviceShotName', () => {
	it('keeps the nesting and drops the extension', () => {
		expect(deviceShotName('/tmp/shots', '/tmp/shots/ios/launch/dashboard.png')).toBe(
			'ios/launch/dashboard'
		);
	});

	it('is case-insensitive about the extension', () => {
		expect(deviceShotName('/tmp/shots', '/tmp/shots/one.PNG')).toBe('one');
	});
});

describe('checkHardBudgets', () => {
	it('passes a frame sitting exactly on both budgets', () => {
		expect(
			checkHardBudgets([
				frame('ok', {
					pixels: pixels({ heroRegions: MAX_HERO_REGIONS }),
					chroma: {
						highChromaRatio: CHROMA_AREA_BUDGET,
						maxChroma: 0.3,
						distinctColors: 9
					}
				})
			])
		).toEqual([]);
	});

	it('flags two heroes, naming the areas so the offender is findable', () => {
		const breaches = checkHardBudgets([
			frame('dashboard', {
				pixels: pixels({ heroRegions: 2, heroAreaRatios: [0.21, 0.09] })
			})
		]);
		expect(breaches).toHaveLength(1);
		expect(breaches[0]).toMatchObject({ screen: 'dashboard', budget: 'hero' });
		expect(breaches[0]!.detail).toContain('0.21');
		expect(breaches[0]!.detail).toContain('0.09');
	});

	it('flags high-chroma paint over the area budget', () => {
		const breaches = checkHardBudgets([
			frame('splash', {
				chroma: { highChromaRatio: 0.25, maxChroma: 0.28, distinctColors: 30 }
			})
		]);
		expect(breaches).toHaveLength(1);
		expect(breaches[0]).toMatchObject({ screen: 'splash', budget: 'chroma' });
		expect(breaches[0]!.detail).toContain('25.0%');
	});

	it('reports both budgets for the same frame', () => {
		const breaches = checkHardBudgets([
			frame('splash', {
				pixels: pixels({ heroRegions: 3, heroAreaRatios: [0.3, 0.2, 0.1] }),
				chroma: { highChromaRatio: 0.4, maxChroma: 0.28, distinctColors: 30 }
			})
		]);
		expect(breaches.map((b) => b.budget)).toEqual(['hero', 'chroma']);
	});
});

describe('measureChroma', () => {
	it('reads a neutral histogram as zero high-chroma area', () => {
		const metrics = measureChroma({ keys: [WHITE_KEY], counts: [10], sampled: 10 });
		expect(metrics.highChromaRatio).toBe(0);
		expect(metrics.maxChroma).toBeLessThan(CHROMA_LIMIT);
		expect(metrics.distinctColors).toBe(1);
	});

	it('counts saturated paint against the budget', () => {
		const metrics = measureChroma({ keys: [WHITE_KEY, RED_KEY], counts: [3, 1], sampled: 4 });
		expect(metrics.highChromaRatio).toBeCloseTo(0.25, 5);
		expect(metrics.maxChroma).toBeGreaterThan(CHROMA_LIMIT);
	});
});

describe('writeDeviceReport', () => {
	it('round-trips the frames without the raw color histogram', () => {
		const dir = shotDir();
		const file = join(dir, 'device-report.json');
		const written = writeDeviceReport(dir, [frame('ios/launch/dashboard')], file);
		expect(written).toBe(file);

		const report = JSON.parse(readFileSync(file, 'utf-8')) as DeviceEvalReport;
		expect(report.shotDir).toBe(dir);
		expect(report.budgets).toEqual({
			chromaLimit: CHROMA_LIMIT,
			chromaAreaBudget: CHROMA_AREA_BUDGET,
			maxHeroRegions: MAX_HERO_REGIONS
		});
		expect(report.frames).toHaveLength(1);
		expect(report.frames[0]!.name).toBe('ios/launch/dashboard');
		expect(report.frames[0]!.pixels).not.toHaveProperty('colors');
		expect(report.frames[0]!.pixels.heroRegions).toBe(1);
	});
});

describe('formatDeviceTable', () => {
	it('prints the frame, its native size and the budget footer', () => {
		const dir = shotDir();
		const file = join(dir, 'device-report.json');
		writeDeviceReport(dir, [frame('ios/launch/dashboard')], file);
		const report = JSON.parse(readFileSync(file, 'utf-8')) as DeviceEvalReport;

		const table = formatDeviceTable(report);
		expect(table).toContain('ios/launch/dashboard');
		expect(table).toContain('1206x2622');
		expect(table).toContain(`max ${MAX_HERO_REGIONS} hero`);
		expect(table).toContain('no DOM, so no complexity budget');
	});
});
