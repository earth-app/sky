// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shouldShowJourneyToast } from '~/utils/journey';

describe('shouldShowJourneyToast', () => {
	it('shows the toast on a real increment with a finite count', () => {
		expect(shouldShowJourneyToast({ success: true, data: { count: 6, incremented: true } })).toBe(
			true
		);
	});

	it('suppresses the toast when the count did not change (incremented:false)', () => {
		expect(shouldShowJourneyToast({ success: true, data: { count: 6, incremented: false } })).toBe(
			false
		);
	});

	it('suppresses the toast when incremented is missing', () => {
		expect(shouldShowJourneyToast({ success: true, data: { count: 6 } })).toBe(false);
	});

	it('suppresses the toast on a non-finite / absent count even if incremented', () => {
		expect(shouldShowJourneyToast({ success: true, data: { count: NaN, incremented: true } })).toBe(
			false
		);
		expect(shouldShowJourneyToast({ success: true, data: { incremented: true } })).toBe(false);
	});

	it('suppresses the toast on a failed request', () => {
		expect(
			shouldShowJourneyToast({
				success: false,
				message: 'nope',
				data: { count: 6, incremented: true }
			})
		).toBe(false);
		expect(shouldShowJourneyToast({ success: true })).toBe(false);
	});

	it('treats null/undefined defensively', () => {
		expect(shouldShowJourneyToast(null)).toBe(false);
		expect(shouldShowJourneyToast(undefined)).toBe(false);
		expect(shouldShowJourneyToast({ success: true, data: null })).toBe(false);
	});
});
