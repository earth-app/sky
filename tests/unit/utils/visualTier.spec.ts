import { describe, expect, it, vi } from 'vitest';
import {
	blurIsFree,
	COMPOSITE_COST_FREE_MS,
	COMPOSITE_COST_RATIO_FULL,
	COMPOSITE_FULL_MAX_MS,
	COMPOSITE_VETO_MS,
	compositeCostMs,
	compositeCostRatio,
	isCompositeMeasured,
	isDocumentHidden,
	measureComposite,
	medianOf,
	readProbe,
	sampleFrames,
	TIER_FULL_MIN_CORES,
	TIER_FULL_MIN_MEMORY_GB,
	tierFromProbe,
	tierLabel,
	type TierProbe
} from '~/utils/visual-tier';

// real refresh intervals; a healthy panel's median lands exactly on one of these
const HZ_60 = 16.7;
const HZ_120 = 8.3;

// a 120Hz flagship where the blur is free; each case moves exactly one field off it
function probe(overrides: Partial<TierProbe> = {}): TierProbe {
	return {
		cores: 8,
		memoryGb: 8,
		dpr: 3,
		saveData: false,
		baselineMs: HZ_120,
		blurredMs: HZ_120 + 0.2,
		...overrides
	};
}

describe('visual tier thresholds', () => {
	it('pins the documented gates so a tuning change has to be deliberate', () => {
		expect(COMPOSITE_COST_RATIO_FULL).toBe(1.25);
		expect(COMPOSITE_COST_FREE_MS).toBe(2);
		expect(COMPOSITE_FULL_MAX_MS).toBe(18.5);
		expect(COMPOSITE_VETO_MS).toBe(20);
		expect(TIER_FULL_MIN_CORES).toBe(6);
		expect(TIER_FULL_MIN_MEMORY_GB).toBe(4);
	});
});

describe('composite cost arithmetic', () => {
	it('reports the overshoot in ms and as a ratio of the baseline', () => {
		const m = { baselineMs: 16.7, blurredMs: 33.4 };
		expect(compositeCostMs(m)).toBeCloseTo(16.7, 5);
		expect(compositeCostRatio(m)).toBeCloseTo(2, 5);
	});

	it('never divides by a baseline under 1ms', () => {
		expect(compositeCostRatio({ baselineMs: 0.2, blurredMs: 8 })).toBe(8);
	});

	it('knows an untimed window from a timed one', () => {
		expect(isCompositeMeasured({ baselineMs: 8.3, blurredMs: 8.4 })).toBe(true);
		expect(isCompositeMeasured({ baselineMs: 0, blurredMs: 8.4 })).toBe(false);
		expect(isCompositeMeasured({ baselineMs: 8.3, blurredMs: 0 })).toBe(false);
		expect(isCompositeMeasured({ baselineMs: Number.NaN, blurredMs: 8.4 })).toBe(false);
	});

	it('calls a sub-noise-floor cost free even when the ratio is over the limit', () => {
		// 4ms baseline with a 1.5ms cost: ratio 1.375, but only 1.5ms of real work
		expect(blurIsFree({ baselineMs: 4, blurredMs: 5.5 })).toBe(true);
	});

	it('calls a proportionally small cost free even when the absolute ms is larger', () => {
		expect(blurIsFree({ baselineMs: 16.7, blurredMs: 19 })).toBe(true);
		expect(blurIsFree({ baselineMs: 16.7, blurredMs: 33.4 })).toBe(false);
	});
});

describe('tierFromProbe (refresh-relative full)', () => {
	it('lets a 60Hz device where the blur is free reach full', () => {
		// the regression this model exists for: 16.7ms is a healthy panel, not a slow device
		expect(tierFromProbe(probe({ baselineMs: HZ_60, blurredMs: 17.0 }))).toBe('full');
	});

	it('lets a 120Hz device where the blur is free reach full', () => {
		expect(tierFromProbe(probe({ baselineMs: HZ_120, blurredMs: 8.5 }))).toBe('full');
	});

	it('lets a 90Hz device where the blur is free reach full', () => {
		expect(tierFromProbe(probe({ baselineMs: 11.1, blurredMs: 11.3 }))).toBe('full');
	});

	it('denies full when the blur roughly doubles a 60Hz frame', () => {
		// 33.4ms is also past the veto: 30fps under blur is not a glass device
		expect(tierFromProbe(probe({ baselineMs: HZ_60, blurredMs: 33.4 }))).toBe('off');
	});

	it('denies full when the blur roughly doubles a 120Hz frame, without vetoing it', () => {
		// 8.3 -> 16.6 is still 60fps, so the device stays usable at reduced
		expect(tierFromProbe(probe({ baselineMs: HZ_120, blurredMs: 16.6 }))).toBe('reduced');
	});

	it('denies full at the ratio boundary and allows it just inside', () => {
		// baseline 8 keeps the ms floor out of it: 8 * 1.25 = 10 exactly
		expect(tierFromProbe(probe({ baselineMs: 8, blurredMs: 10 }))).toBe('full');
		expect(tierFromProbe(probe({ baselineMs: 8, blurredMs: 10.1 }))).toBe('reduced');
	});

	it('allows a cost exactly on the ms floor', () => {
		expect(tierFromProbe(probe({ baselineMs: 4, blurredMs: 4 + COMPOSITE_COST_FREE_MS }))).toBe(
			'full'
		);
	});

	it('denies full to a free blur on a panel that cannot hold 60fps', () => {
		// blur is free (ratio 1.03) but 19.5ms is ~51fps: not glass material, not slow enough to veto
		expect(tierFromProbe(probe({ baselineMs: 19, blurredMs: 19.5 }))).toBe('reduced');
	});

	it('allows full exactly at the absolute ceiling', () => {
		expect(
			tierFromProbe(probe({ baselineMs: COMPOSITE_FULL_MAX_MS, blurredMs: COMPOSITE_FULL_MAX_MS }))
		).toBe('full');
	});
});

describe('tierFromProbe (spec gates)', () => {
	it('allows exactly the minimum core count', () => {
		expect(tierFromProbe(probe({ cores: TIER_FULL_MIN_CORES }))).toBe('full');
	});

	it('drops to reduced one core under the minimum', () => {
		expect(tierFromProbe(probe({ cores: TIER_FULL_MIN_CORES - 1 }))).toBe('reduced');
	});

	it('allows exactly the minimum reported memory', () => {
		expect(tierFromProbe(probe({ memoryGb: TIER_FULL_MIN_MEMORY_GB }))).toBe('full');
	});

	it('drops to reduced just under the minimum reported memory', () => {
		expect(tierFromProbe(probe({ memoryGb: TIER_FULL_MIN_MEMORY_GB - 0.1 }))).toBe('reduced');
	});
});

describe('tierFromProbe (slow-compositor veto)', () => {
	it('vetoes a device that claims everything but drops frames under blur', () => {
		expect(
			tierFromProbe(probe({ cores: 16, memoryGb: 32, baselineMs: HZ_60, blurredMs: 45 }))
		).toBe('off');
	});

	it('vetoes a device that cannot even animate the unblurred baseline', () => {
		expect(tierFromProbe(probe({ baselineMs: 40, blurredMs: 41 }))).toBe('off');
	});

	it('does not veto a blurred window exactly at the veto threshold', () => {
		expect(tierFromProbe(probe({ baselineMs: HZ_60, blurredMs: COMPOSITE_VETO_MS }))).toBe(
			'reduced'
		);
	});

	it('vetoes a hair over the threshold', () => {
		expect(tierFromProbe(probe({ baselineMs: HZ_60, blurredMs: COMPOSITE_VETO_MS + 0.1 }))).toBe(
			'off'
		);
	});

	it('catches an ios low power mode 30fps cap', () => {
		expect(tierFromProbe(probe({ baselineMs: 33.3, blurredMs: 33.4 }))).toBe('off');
	});

	it('outranks the saveData cap: too slow means off, not reduced', () => {
		expect(tierFromProbe(probe({ saveData: true, baselineMs: HZ_60, blurredMs: 40 }))).toBe('off');
	});
});

describe('tierFromProbe (saveData cap)', () => {
	it('caps a flagship at reduced when the user asked to save data', () => {
		expect(tierFromProbe(probe({ saveData: true }))).toBe('reduced');
	});

	it('caps at reduced with unknown memory and a free blur', () => {
		expect(tierFromProbe(probe({ saveData: true, memoryGb: 0 }))).toBe('reduced');
	});
});

describe('tierFromProbe (unknown memory)', () => {
	it('falls back to the core count when memory is not reported', () => {
		expect(tierFromProbe(probe({ memoryGb: 0 }))).toBe('full');
	});

	it('still needs the cores when memory is not reported', () => {
		expect(tierFromProbe(probe({ memoryGb: 0, cores: TIER_FULL_MIN_CORES - 1 }))).toBe('reduced');
	});

	it('treats a nonsense negative memory reading as unknown', () => {
		expect(tierFromProbe(probe({ memoryGb: -1 }))).toBe('full');
	});

	it('does not let unknown memory bypass the composite gate', () => {
		expect(tierFromProbe(probe({ memoryGb: 0, baselineMs: HZ_120, blurredMs: 20 }))).toBe(
			'reduced'
		);
	});
});

describe('tierFromProbe (resilience)', () => {
	it('ignores dpr entirely', () => {
		expect(tierFromProbe(probe({ dpr: 1 }))).toBe(tierFromProbe(probe({ dpr: 4 })));
	});

	it('lands in reduced when the windows could not be timed', () => {
		expect(tierFromProbe(probe({ baselineMs: 0, blurredMs: 0 }))).toBe('reduced');
		expect(tierFromProbe(probe({ baselineMs: Number.NaN, blurredMs: Number.NaN }))).toBe('reduced');
		expect(tierFromProbe(probe({ baselineMs: HZ_120, blurredMs: 0 }))).toBe('reduced');
	});

	it('never vetoes on an untimed window, however large the other side reads', () => {
		expect(tierFromProbe(probe({ baselineMs: 0, blurredMs: 999 }))).toBe('reduced');
	});

	it('still caps saveData when the windows could not be timed', () => {
		expect(tierFromProbe(probe({ saveData: true, baselineMs: 0, blurredMs: 0 }))).toBe('reduced');
	});

	it('lands in reduced for a zero-core reading', () => {
		expect(tierFromProbe(probe({ cores: 0 }))).toBe('reduced');
	});

	it('does not credit a blurred window that came back faster than the baseline', () => {
		// noise, not a discount; the worst of the two windows still governs
		expect(tierFromProbe(probe({ baselineMs: 22, blurredMs: 21 }))).toBe('off');
	});
});

describe('tierLabel', () => {
	it('labels every tier in title case', () => {
		expect(tierLabel('full')).toBe('Full - Glass and Ambient Motion');
		expect(tierLabel('reduced')).toBe('Reduced - Light Blur');
		expect(tierLabel('off')).toBe('Off - Solid Surfaces');
	});
});

describe('medianOf', () => {
	it('takes the middle of an odd-length set regardless of input order', () => {
		expect(medianOf([9, 1, 5])).toBe(5);
	});

	it('averages the two middles of an even-length set', () => {
		expect(medianOf([1, 2, 3, 10])).toBe(2.5);
	});

	it('returns the only sample of a single-value set', () => {
		expect(medianOf([7])).toBe(7);
	});

	it('returns 0 for an empty set so callers can fall back', () => {
		expect(medianOf([])).toBe(0);
	});

	it('does not mutate the caller array', () => {
		const values = [3, 1, 2];
		medianOf(values);
		expect(values).toEqual([3, 1, 2]);
	});
});

describe('sampleFrames', () => {
	it('runs the callback once per requested frame and returns positive deltas', async () => {
		const onFrame = vi.fn();
		const deltas = await sampleFrames(4, onFrame);

		expect(onFrame).toHaveBeenCalledTimes(4);
		expect(deltas.length).toBeLessThanOrEqual(4);
		for (const delta of deltas) expect(delta).toBeGreaterThan(0);
	});
});

describe('measureComposite', () => {
	it('returns both windows as finite frame times', async () => {
		const m = await measureComposite();
		expect(Number.isFinite(m.baselineMs)).toBe(true);
		expect(Number.isFinite(m.blurredMs)).toBe(true);
		expect(m.baselineMs).toBeGreaterThanOrEqual(0);
		expect(m.blurredMs).toBeGreaterThanOrEqual(0);
	});

	it('removes its offscreen probe element again', async () => {
		const before = document.body.childElementCount;
		await measureComposite();
		expect(document.body.childElementCount).toBe(before);
	});

	it('reports both windows untimed while the webview is hidden', async () => {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		try {
			expect(isDocumentHidden()).toBe(true);
			const m = await measureComposite();
			expect(m).toEqual({ baselineMs: 0, blurredMs: 0 });
			expect(isCompositeMeasured(m)).toBe(false);
		} finally {
			Reflect.deleteProperty(document, 'visibilityState');
		}

		expect(isDocumentHidden()).toBe(false);
	});
});

describe('readProbe', () => {
	it('reads the reported specs and classifies into a real tier', async () => {
		const p = await readProbe();

		expect(Number.isInteger(p.cores)).toBe(true);
		expect(p.cores).toBeGreaterThanOrEqual(0);
		expect(p.memoryGb).toBeGreaterThanOrEqual(0);
		expect(p.dpr).toBeGreaterThan(0);
		expect(typeof p.saveData).toBe('boolean');
		expect(Number.isFinite(p.baselineMs)).toBe(true);
		expect(Number.isFinite(p.blurredMs)).toBe(true);
		expect(['full', 'reduced', 'off']).toContain(tierFromProbe(p));
	});

	it('picks up hardwareConcurrency, deviceMemory and connection.saveData', async () => {
		vi.stubGlobal('navigator', {
			hardwareConcurrency: 4,
			deviceMemory: 2,
			connection: { saveData: true }
		});

		try {
			const p = await readProbe();
			expect(p.cores).toBe(4);
			expect(p.memoryGb).toBe(2);
			expect(p.saveData).toBe(true);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('reports 0 for specs the browser withholds', async () => {
		vi.stubGlobal('navigator', {});

		try {
			const p = await readProbe();
			expect(p.cores).toBe(0);
			expect(p.memoryGb).toBe(0);
			expect(p.saveData).toBe(false);
			expect(p.dpr).toBeGreaterThan(0);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
