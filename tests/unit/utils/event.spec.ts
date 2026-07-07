// @vitest-environment node
import type { Event } from 'types/event';
import type { User } from 'types/user';
import { describe, expect, it } from 'vitest';
import { attendeeCount, distinctAttendees, isEventPast } from '~/utils/event';

const usr = (id: string): User => ({ id, username: id }) as unknown as User;

const timing = (overrides: Partial<Event['timing']> = {}): Event['timing'] => ({
	has_passed: false,
	is_ongoing: false,
	starts_in: 0,
	is_upcoming: false,
	...overrides
});

const NOW = 1_700_000_000_000;

describe('isEventPast', () => {
	it('is true when the server timing already marks it passed', () => {
		expect(
			isEventPast({ timing: timing({ has_passed: true }), date: NOW + 10_000 } as any, NOW)
		).toBe(true);
	});

	it('uses end_date when present', () => {
		expect(isEventPast({ timing: timing(), date: NOW - 20_000, end_date: NOW - 10_000 }, NOW)).toBe(
			true
		);
		expect(isEventPast({ timing: timing(), date: NOW - 20_000, end_date: NOW + 10_000 }, NOW)).toBe(
			false
		);
	});

	it('falls back to start date when there is no end_date', () => {
		expect(isEventPast({ timing: timing(), date: NOW - 10_000 }, NOW)).toBe(true);
		expect(isEventPast({ timing: timing(), date: NOW + 10_000 }, NOW)).toBe(false);
	});

	it('treats a zero/absent date as not past', () => {
		expect(isEventPast({ timing: timing(), date: 0 }, NOW)).toBe(false);
	});
});

describe('distinctAttendees', () => {
	it('returns null while the list has not loaded', () => {
		expect(distinctAttendees(usr('h'), null)).toBeNull();
		expect(distinctAttendees(usr('h'), undefined)).toBeNull();
	});

	it('puts the host first and dedupes the host out of the server list', () => {
		// server list includes the host again (mantle appends host) -> must not double-count
		const result = distinctAttendees(usr('h'), [usr('h'), usr('a')]);
		expect(result?.map((u) => u.id)).toEqual(['h', 'a']);
	});

	it('dedupes duplicate attendee entries', () => {
		const result = distinctAttendees(usr('h'), [usr('a'), usr('a'), usr('b')]);
		expect(result?.map((u) => u.id)).toEqual(['h', 'a', 'b']);
	});

	it('skips entries without an id', () => {
		const result = distinctAttendees(usr('h'), [{ username: 'x' } as User, usr('a')]);
		expect(result?.map((u) => u.id)).toEqual(['h', 'a']);
	});

	it('works when there is no host yet', () => {
		const result = distinctAttendees(null, [usr('a'), usr('b')]);
		expect(result?.map((u) => u.id)).toEqual(['a', 'b']);
	});
});

describe('attendeeCount', () => {
	it('equals the distinct list length (host + 1 real attendee => 2, not 3)', () => {
		// regression: host counted twice previously produced 3
		expect(attendeeCount(usr('h'), [usr('h'), usr('a')])).toBe(2);
	});

	it('matches the rendered card count exactly', () => {
		const host = usr('h');
		const list = [usr('h'), usr('a'), usr('a'), usr('b')];
		expect(attendeeCount(host, list)).toBe(distinctAttendees(host, list)!.length);
	});

	it('falls back to the server count until the list loads', () => {
		expect(attendeeCount(usr('h'), null, 5)).toBe(5);
		expect(attendeeCount(usr('h'), null)).toBe(0);
	});
});
