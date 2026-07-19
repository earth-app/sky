import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const prefStore: Record<string, string | null> = {};
const prefSet = vi.fn();

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: prefStore[key] ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			prefStore[key] = value;
			prefSet(key, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			delete prefStore[key];
		})
	}
}));

import {
	metersToNatureMinutes,
	NATURE_MINUTES_SYNC_CAP,
	useNatureMinutes
} from '~/composables/useNatureMinutes';

const creditFn = vi.fn(async (s: { minutes: number }) => ({
	success: true,
	data: { minutes: s.minutes }
}));

function fakeTrails() {
	return {
		natureMinutes: ref(null),
		fetchNatureMinutes: vi.fn(async () => ({ success: true, data: null })),
		creditNatureMinutes: creditFn
	};
}

function fakeHealthKit(overrides: Record<string, unknown> = {}) {
	return {
		isSupported: true,
		isAvailable: vi.fn(async () => true),
		requestAuthorization: vi.fn(async () => true),
		getActivityDistance: vi.fn(async () => ({ distance: 1600, source: 'hk' })),
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	for (const k of Object.keys(prefStore)) delete prefStore[k];
});

describe('metersToNatureMinutes', () => {
	it('converts distance to whole minutes at ~80 m/min', () => {
		expect(metersToNatureMinutes(1600)).toBe(20);
		expect(metersToNatureMinutes(80)).toBe(1);
		expect(metersToNatureMinutes(40)).toBe(1); // rounds up from 0.5
		expect(metersToNatureMinutes(4000)).toBe(50);
	});

	it('returns 0 for zero / negative / non-finite', () => {
		expect(metersToNatureMinutes(0)).toBe(0);
		expect(metersToNatureMinutes(-500)).toBe(0);
		expect(metersToNatureMinutes(NaN)).toBe(0);
	});
});

describe('useNatureMinutes.syncFromHealthKit', () => {
	it('refuses when Apple Health is unsupported', async () => {
		const res = await useNatureMinutes(
			fakeTrails(),
			fakeHealthKit({ isSupported: false })
		).syncFromHealthKit();
		expect(res.success).toBe(false);
		expect(creditFn).not.toHaveBeenCalled();
	});

	it('credits the converted delta and advances the window on success', async () => {
		const res = await useNatureMinutes(fakeTrails(), fakeHealthKit()).syncFromHealthKit();
		expect(creditFn).toHaveBeenCalledWith(
			expect.objectContaining({ kind: 'healthkit', minutes: 20 })
		);
		expect(res.success).toBe(true);
		expect(prefSet).toHaveBeenCalled();
	});

	it('caps a healthkit spike at the single-sync ceiling', async () => {
		const hk = fakeHealthKit({
			getActivityDistance: vi.fn(async () => ({ distance: 10_000_000, source: 'hk' }))
		});
		await useNatureMinutes(fakeTrails(), hk).syncFromHealthKit();
		expect(creditFn).toHaveBeenCalledWith(
			expect.objectContaining({ minutes: NATURE_MINUTES_SYNC_CAP })
		);
	});

	it('does not credit when there is no new distance, but advances the window', async () => {
		const hk = fakeHealthKit({
			getActivityDistance: vi.fn(async () => ({ distance: 0, source: 'hk' }))
		});
		const res = await useNatureMinutes(fakeTrails(), hk).syncFromHealthKit();
		expect(res.success).toBe(false);
		expect(creditFn).not.toHaveBeenCalled();
		expect(prefSet).toHaveBeenCalled();
	});

	it('requests authorization when not available and aborts if denied', async () => {
		const hk = fakeHealthKit({
			isAvailable: vi.fn(async () => false),
			requestAuthorization: vi.fn(async () => false)
		});
		const res = await useNatureMinutes(fakeTrails(), hk).syncFromHealthKit();
		expect(res.success).toBe(false);
		expect(creditFn).not.toHaveBeenCalled();
	});
});
