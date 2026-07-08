// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	computeMoodPercentages,
	hasVotedToday,
	moodMyVoteStorageKey,
	moodTodayUtc,
	moodVotedLatchKey
} from '~/utils/mood';

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

describe('moodVotedLatchKey', () => {
	it("matches useMood's guard format (mood_voted:<topic>:<date>)", () => {
		expect(moodVotedLatchKey('today', '2026-07-06')).toBe('mood_voted:today:2026-07-06');
	});

	it('lowercases and trims the topic so it matches the sanitized request topic', () => {
		expect(moodVotedLatchKey('  Activity-ABC  ', '2026-07-06')).toBe(
			'mood_voted:activity-abc:2026-07-06'
		);
	});

	it('is stable within a UTC day but changes with the date (re-votable next day only)', () => {
		expect(moodVotedLatchKey('today', '2026-07-06')).toBe(moodVotedLatchKey('today', '2026-07-06'));
		expect(moodVotedLatchKey('today', '2026-07-06')).not.toBe(
			moodVotedLatchKey('today', '2026-07-07')
		);
	});
});

describe('hasVotedToday', () => {
	const DATE = '2026-07-06';

	it('is false on an empty store so the first vote of the day is allowed', () => {
		expect(hasVotedToday({}, 'today', DATE)).toBe(false);
	});

	it("is true once today's latch is stored, so a same-day remount stays closed", () => {
		const store = { [moodVotedLatchKey('today', DATE)]: String(Date.now()) };
		expect(hasVotedToday(store, 'today', DATE)).toBe(true);
	});

	it("ignores a prior day's latch (voting reopens the next day)", () => {
		const store = { [moodVotedLatchKey('today', '2026-07-05')]: '123' };
		expect(hasVotedToday(store, 'today', DATE)).toBe(false);
	});

	it('scopes per topic so different activities remain separately votable', () => {
		const store = { [moodVotedLatchKey('activity-a', DATE)]: '123' };
		expect(hasVotedToday(store, 'activity-a', DATE)).toBe(true);
		expect(hasVotedToday(store, 'activity-b', DATE)).toBe(false);
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
