import { describe, expect, it } from 'vitest';
import { formatDistanceLabel } from '~/utils/geo';

describe('formatDistanceLabel', () => {
	it('shows meters under 1km', () => {
		expect(formatDistanceLabel(0)).toBe('0 m');
		expect(formatDistanceLabel(120)).toBe('120 m');
		expect(formatDistanceLabel(999)).toBe('999 m');
	});

	it('shows kilometers at/over 1km with one decimal', () => {
		expect(formatDistanceLabel(1000)).toBe('1.0 km');
		expect(formatDistanceLabel(1234)).toBe('1.2 km');
		expect(formatDistanceLabel(1500)).toBe('1.5 km');
		expect(formatDistanceLabel(2000)).toBe('2.0 km');
	});

	it('returns empty string for undefined / negative / non-finite', () => {
		expect(formatDistanceLabel(undefined)).toBe('');
		expect(formatDistanceLabel(-5)).toBe('');
		expect(formatDistanceLabel(NaN)).toBe('');
		expect(formatDistanceLabel(Infinity)).toBe('');
	});
});
