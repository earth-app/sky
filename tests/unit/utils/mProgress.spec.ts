// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	clampFraction,
	DEFAULT_RING_SIZE,
	progressDone,
	progressLabel,
	progressPercent,
	ringGeometry
} from '~/utils/progress';

describe('clampFraction', () => {
	it('passes a mid-range fraction through untouched', () => {
		expect(clampFraction(0.42)).toBe(0.42);
	});

	it('clamps out-of-range input to the 0..1 domain', () => {
		expect(clampFraction(-1)).toBe(0);
		expect(clampFraction(0)).toBe(0);
		expect(clampFraction(1)).toBe(1);
		expect(clampFraction(2.5)).toBe(1);
	});

	it('treats NaN and infinities as zero rather than rendering a broken arc', () => {
		expect(clampFraction(Number.NaN)).toBe(0);
		expect(clampFraction(Number.POSITIVE_INFINITY)).toBe(0);
		expect(clampFraction(Number.NEGATIVE_INFINITY)).toBe(0);
	});
});

describe('progressPercent', () => {
	it('rounds to a whole percent', () => {
		expect(progressPercent(0.333)).toBe(33);
		expect(progressPercent(0.336)).toBe(34);
	});

	it('reports 100 only when the work is actually complete', () => {
		expect(progressPercent(1)).toBe(100);
		expect(progressPercent(1.4)).toBe(100);
		expect(progressPercent(0.999)).toBe(99);
		expect(progressPercent(0.996)).toBe(99);
	});

	it('reports 0 for no progress', () => {
		expect(progressPercent(0)).toBe(0);
		expect(progressPercent(-3)).toBe(0);
		expect(progressPercent(Number.NaN)).toBe(0);
	});
});

describe('progressDone', () => {
	it('converts a fraction into a whole step count', () => {
		expect(progressDone(0, 5)).toBe(0);
		expect(progressDone(0.2, 5)).toBe(1);
		expect(progressDone(0.6, 5)).toBe(3);
		expect(progressDone(1, 5)).toBe(5);
	});

	it('never claims the last step until the fraction reaches 1', () => {
		expect(progressDone(0.9, 5)).toBe(4);
		expect(progressDone(0.99, 100)).toBe(99);
		expect(progressDone(0.4, 1)).toBe(0);
	});

	it('rounds a fractional total and rejects a non-positive one', () => {
		expect(progressDone(0.5, 4.4)).toBe(2);
		expect(progressDone(1, 0)).toBe(0);
		expect(progressDone(1, -5)).toBe(0);
		expect(progressDone(1, Number.NaN)).toBe(0);
	});
});

describe('progressLabel', () => {
	it('reads as a step count when a total is given', () => {
		expect(progressLabel(0.6, 5)).toBe('3 of 5 complete');
		expect(progressLabel(0, 5)).toBe('0 of 5 complete');
		expect(progressLabel(1, 5)).toBe('5 of 5 complete');
	});

	it('falls back to a percent when the total is missing or unusable', () => {
		expect(progressLabel(0.6)).toBe('60% complete');
		expect(progressLabel(0.6, null)).toBe('60% complete');
		expect(progressLabel(0.6, 0)).toBe('60% complete');
		expect(progressLabel(0.6, Number.NaN)).toBe('60% complete');
	});

	it('stays truthful at the edges', () => {
		expect(progressLabel(1)).toBe('100% complete');
		expect(progressLabel(0.999)).toBe('99% complete');
		expect(progressLabel(Number.NaN)).toBe('0% complete');
	});
});

describe('ringGeometry', () => {
	it('defaults to the shared ring size', () => {
		expect(DEFAULT_RING_SIZE).toBe(96);
		expect(ringGeometry(0.5).size).toBe(96);
	});

	it('keeps the whole stroke inside the viewBox', () => {
		const ring = ringGeometry(0.5, 96);
		expect(ring.strokeWidth).toBe(8);
		expect(ring.center).toBe(48);
		expect(ring.radius).toBe(44);
		expect(ring.radius + ring.strokeWidth / 2).toBeLessThanOrEqual(ring.center);
	});

	it('scales the stroke with the ring so a small ring is not a solid disc', () => {
		expect(ringGeometry(0.5, 48).strokeWidth).toBe(4);
		expect(ringGeometry(0.5, 192).strokeWidth).toBe(16);
	});

	it('honours an explicit stroke width but caps it at a quarter of the box', () => {
		expect(ringGeometry(0.5, 96, 14).strokeWidth).toBe(14);
		expect(ringGeometry(0.5, 96, 400).strokeWidth).toBe(24);
		expect(ringGeometry(0.5, 96, 400).radius).toBeGreaterThan(0);
		expect(ringGeometry(0.5, 96, 0.1).strokeWidth).toBe(1);
	});

	it('maps the fraction onto stroke-dashoffset', () => {
		const empty = ringGeometry(0, 96);
		expect(empty.dashOffset).toBeCloseTo(empty.circumference, 6);

		const half = ringGeometry(0.5, 96);
		expect(half.dashOffset).toBeCloseTo(half.circumference / 2, 6);

		const full = ringGeometry(1, 96);
		expect(full.dashOffset).toBeCloseTo(0, 6);
	});

	it('derives the circumference from the inset radius', () => {
		const ring = ringGeometry(0.25, 100);
		expect(ring.circumference).toBeCloseTo(2 * Math.PI * ring.radius, 6);
		expect(ring.dashOffset).toBeCloseTo(ring.circumference * 0.75, 6);
	});

	it('clamps the fraction it exposes to the bar variant', () => {
		expect(ringGeometry(-1, 96).fraction).toBe(0);
		expect(ringGeometry(3, 96).fraction).toBe(1);
		expect(ringGeometry(Number.NaN, 96).fraction).toBe(0);
	});

	it('falls back to the default size for a degenerate size', () => {
		expect(ringGeometry(0.5, 0).size).toBe(DEFAULT_RING_SIZE);
		expect(ringGeometry(0.5, -40).size).toBe(DEFAULT_RING_SIZE);
		expect(ringGeometry(0.5, Number.NaN).size).toBe(DEFAULT_RING_SIZE);
	});

	it('scales the centre type with the ring and floors the caption at a readable size', () => {
		expect(ringGeometry(0.5, 96).valueSize).toBe(31);
		expect(ringGeometry(0.5, 200).valueSize).toBe(64);
		expect(ringGeometry(0.5, 96).labelSize).toBe(12);
		expect(ringGeometry(0.5, 40).labelSize).toBe(9);
	});
});
