import { describe, expect, it } from 'vitest';
import {
	MAX_SPEED_MPS,
	acceptSyncedDistance,
	plausibleCeilingMeters
} from '../../../src/utils/distance';

const MIN = 60_000;

describe('plausibleCeilingMeters', () => {
	it('scales with session length, not poll interval', () => {
		expect(plausibleCeilingMeters(MIN)).toBeCloseTo(MAX_SPEED_MPS * 60, 3);
		expect(plausibleCeilingMeters(60 * MIN)).toBeCloseTo(MAX_SPEED_MPS * 3600, 3);
	});

	it('carries the distance already credited before this session', () => {
		expect(plausibleCeilingMeters(MIN, 1000)).toBeCloseTo(1000 + MAX_SPEED_MPS * 60, 3);
	});

	it('never returns less than the base for a zero or nonsense elapsed', () => {
		for (const elapsed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(plausibleCeilingMeters(elapsed, 250)).toBe(250);
		}
		expect(plausibleCeilingMeters(0, -50)).toBe(0);
	});
});

describe('acceptSyncedDistance', () => {
	const base = { currentMeters: 0, baseMeters: 0, elapsedMs: 60 * MIN };

	it('accepts a real apple watch workout that lands in one sync', () => {
		// 5km after an hour open is ~1.4 m/s; entirely plausible
		expect(acceptSyncedDistance({ ...base, candidateMeters: 5000 })).toBe(5000);
	});

	// the integrity case: the merge path took max(healthkit, pedometer) and trusted it, so one
	// absurd reading could jump straight to the goal and complete a quest step
	it('clamps an impossible spike to the session ceiling', () => {
		const accepted = acceptSyncedDistance({ ...base, candidateMeters: 5_000_000 });
		expect(accepted).toBeCloseTo(MAX_SPEED_MPS * 3600, 3);
		expect(accepted).toBeLessThan(5_000_000);
	});

	it('rejects a spike outright when the session just started', () => {
		// two minutes in, 50km is not reachable
		const accepted = acceptSyncedDistance({
			...base,
			elapsedMs: 2 * MIN,
			candidateMeters: 50_000
		});
		expect(accepted).toBeCloseTo(MAX_SPEED_MPS * 120, 3);
	});

	it('never moves backwards, so a stale or reset sensor cannot erase progress', () => {
		expect(acceptSyncedDistance({ ...base, currentMeters: 900, candidateMeters: 100 })).toBe(900);
		expect(acceptSyncedDistance({ ...base, currentMeters: 900, candidateMeters: -5 })).toBe(900);
	});

	it('ignores a non-finite candidate rather than poisoning progress', () => {
		for (const candidate of [Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				acceptSyncedDistance({ ...base, currentMeters: 120, candidateMeters: candidate })
			).toBe(120);
		}
	});

	// healthkit syncing WHILE the pedometer credits live: the caller already takes the max of the
	// two, so the same total must not be added twice
	it('is idempotent when the same total syncs again', () => {
		const first = acceptSyncedDistance({ ...base, candidateMeters: 2000 });
		const second = acceptSyncedDistance({ ...base, currentMeters: first, candidateMeters: 2000 });
		expect(second).toBe(first);
	});

	it('keeps credit already earned when the ceiling is lower than current progress', () => {
		// a resumed session can carry more progress than this window alone could explain
		const accepted = acceptSyncedDistance({
			currentMeters: 9000,
			baseMeters: 0,
			elapsedMs: MIN,
			candidateMeters: 9500
		});
		expect(accepted).toBe(9000);
	});
});
