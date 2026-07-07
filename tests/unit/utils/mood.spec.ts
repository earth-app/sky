// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeMoodPercentages, moodMyVoteStorageKey, moodTodayUtc } from '~/utils/mood';

const EMOJIS = ['😍', '😊', '🤔', '😐', '😟', '😤'] as const;

describe('moodTodayUtc', () => {
	it('formats a fixed instant as a zero-padded UTC yyyy-mm-dd', () => {
		expect(moodTodayUtc(new Date('2026-07-06T12:00:00Z'))).toBe('2026-07-06');
		expect(moodTodayUtc(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02');
	});

	it('buckets by UTC, not local time, across a late-evening instant', () => {
		// 2026-07-06T23:30Z is still the 6th in UTC regardless of the runner's timezone
		expect(moodTodayUtc(new Date('2026-07-06T23:30:00Z'))).toBe('2026-07-06');
	});
});

describe('moodMyVoteStorageKey', () => {
	it('namespaces by normalized topic and date', () => {
		expect(moodMyVoteStorageKey('today', '2026-07-06')).toBe('mood_myvote:today:2026-07-06');
	});

	it('lowercases and trims the topic so it matches the sanitized request topic', () => {
		expect(moodMyVoteStorageKey('  Activity-ABC  ', '2026-07-06')).toBe(
			'mood_myvote:activity-abc:2026-07-06'
		);
	});
});

describe('computeMoodPercentages', () => {
	it('returns 0 for every emoji when nobody has voted (sparse case)', () => {
		expect(computeMoodPercentages(undefined, 0, EMOJIS)).toEqual({
			'😍': 0,
			'😊': 0,
			'🤔': 0,
			'😐': 0,
			'😟': 0,
			'😤': 0
		});
	});

	it('renders a lone vote as a clean 100% and the rest 0%', () => {
		const pct = computeMoodPercentages({ '😍': 1 }, 1, EMOJIS);
		expect(pct['😍']).toBe(100);
		expect(pct['😊']).toBe(0);
	});

	it('rounds to whole percents', () => {
		const pct = computeMoodPercentages({ '😍': 1, '😊': 2 }, 3, EMOJIS);
		expect(pct['😍']).toBe(33);
		expect(pct['😊']).toBe(67);
	});

	it('handles a mixed aggregate (7/3 of 10)', () => {
		const pct = computeMoodPercentages({ '😍': 7, '😊': 3 }, 10, EMOJIS);
		expect(pct['😍']).toBe(70);
		expect(pct['😊']).toBe(30);
	});

	it('never divides by zero even if counts are present but total is 0', () => {
		expect(computeMoodPercentages({ '😍': 5 }, 0, EMOJIS)['😍']).toBe(0);
	});
});
