import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefStore: Record<string, string | null> = {};
const prefSet = vi.fn();
let getThrows = false;
let setThrows = false;

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => {
			if (getThrows) throw new Error('prefs unavailable');
			return { value: prefStore[key] ?? null };
		}),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			if (setThrows) throw new Error('prefs write failed');
			prefStore[key] = value;
			prefSet(key, value);
		})
	}
}));

import {
	DEFAULT_DAILY_CAP,
	DEFAULT_SESSION_CAP,
	feedDayKey,
	parseDailyRecord,
	useFeedSessionCap
} from '~/composables/useFeedSessionCap';

const DAILY_KEY = 'sky:feed-session-cap:daily';

function seedDaily(day: string, count: number) {
	prefStore[DAILY_KEY] = JSON.stringify({ day, count });
}

beforeEach(() => {
	vi.clearAllMocks();
	getThrows = false;
	setThrows = false;
	for (const k of Object.keys(prefStore)) delete prefStore[k];
});

describe('feedDayKey', () => {
	it('formats a stable local yyyy-mm-dd', () => {
		expect(feedDayKey(new Date(2026, 6, 18))).toBe('2026-07-18');
		expect(feedDayKey(new Date(2026, 0, 3))).toBe('2026-01-03');
	});
});

describe('parseDailyRecord', () => {
	it('returns a fresh today-record for null / empty / garbage', () => {
		const today = feedDayKey();
		expect(parseDailyRecord(null)).toEqual({ day: today, count: 0 });
		expect(parseDailyRecord('')).toEqual({ day: today, count: 0 });
		expect(parseDailyRecord('not json')).toEqual({ day: today, count: 0 });
		expect(parseDailyRecord('{"day":123}')).toEqual({ day: today, count: 0 });
		expect(parseDailyRecord('[1,2,3]')).toEqual({ day: today, count: 0 });
	});

	it('parses a valid record and floors / clamps the count', () => {
		expect(parseDailyRecord('{"day":"2026-07-18","count":7}')).toEqual({
			day: '2026-07-18',
			count: 7
		});
		expect(parseDailyRecord('{"day":"2026-07-18","count":7.9}')).toEqual({
			day: '2026-07-18',
			count: 7
		});
		expect(parseDailyRecord('{"day":"2026-07-18","count":-4}')).toEqual({
			day: '2026-07-18',
			count: 0
		});
	});
});

describe('useFeedSessionCap defaults + tunability', () => {
	it('exposes the shipped default ceilings', () => {
		const cap = useFeedSessionCap();
		expect(cap.sessionCap).toBe(DEFAULT_SESSION_CAP);
		expect(cap.dailyCap).toBe(DEFAULT_DAILY_CAP);
	});

	it('honours tunable overrides and clamps them to a sane floor', () => {
		expect(useFeedSessionCap({ sessionCap: 5, dailyCap: 40 }).sessionCap).toBe(5);
		expect(useFeedSessionCap({ sessionCap: 0 }).sessionCap).toBe(1);
		expect(useFeedSessionCap({ dailyCap: -3 }).dailyCap).toBe(1);
	});
});

describe('useFeedSessionCap.load', () => {
	it("hydrates today's persisted count", async () => {
		seedDaily(feedDayKey(), 9);
		const cap = useFeedSessionCap();
		await cap.load();
		expect(cap.dailyCount.value).toBe(9);
		expect(cap.loaded.value).toBe(true);
	});

	it('resets the daily ceiling on a new day and rewrites the record', async () => {
		seedDaily('2000-01-01', 42);
		const cap = useFeedSessionCap();
		await cap.load();
		expect(cap.dailyCount.value).toBe(0);
		expect(prefSet).toHaveBeenCalled();
		expect(JSON.parse(prefStore[DAILY_KEY]!)).toEqual({ day: feedDayKey(), count: 0 });
	});

	it('fails open (loaded, zero count) when Preferences.get throws', async () => {
		getThrows = true;
		const cap = useFeedSessionCap();
		await cap.load();
		expect(cap.dailyCount.value).toBe(0);
		expect(cap.loaded.value).toBe(true);
		expect(cap.capReached.value).toBe(false);
	});
});

describe('useFeedSessionCap.note + capReached reactivity', () => {
	it('adds items to both the session run and the daily ceiling', async () => {
		const cap = useFeedSessionCap();
		await cap.load();
		await cap.note(3);
		await cap.note(2);
		expect(cap.sessionCount.value).toBe(5);
		expect(cap.dailyCount.value).toBe(5);
	});

	it('ignores non-positive / non-finite item counts', async () => {
		const cap = useFeedSessionCap();
		await cap.load();
		await cap.note(0);
		await cap.note(-4);
		await cap.note(Number.NaN);
		expect(cap.sessionCount.value).toBe(0);
		expect(prefSet).not.toHaveBeenCalled();
	});

	it('trips capReached once the session ceiling is hit and reports the reason', async () => {
		const cap = useFeedSessionCap({ sessionCap: 4, dailyCap: 100 });
		await cap.load();
		expect(cap.capReached.value).toBe(false);
		await cap.note(4);
		expect(cap.capReached.value).toBe(true);
		expect(cap.capReason.value).toBe('session');
	});

	it('trips capReached on the daily ceiling and prefers the daily reason', async () => {
		seedDaily(feedDayKey(), 59);
		const cap = useFeedSessionCap({ sessionCap: 100, dailyCap: 60 });
		await cap.load();
		await cap.note(1);
		expect(cap.capReached.value).toBe(true);
		expect(cap.capReason.value).toBe('daily');
	});

	it('never caps before load resolves', async () => {
		const cap = useFeedSessionCap({ sessionCap: 1 });
		await cap.note(5);
		expect(cap.capReached.value).toBe(false); // loaded still false
	});

	it('persists the daily count so a fresh instance same-day resumes it', async () => {
		const a = useFeedSessionCap({ sessionCap: 3, dailyCap: 50 });
		await a.load();
		await a.note(3);
		expect(a.capReached.value).toBe(true);

		const b = useFeedSessionCap({ sessionCap: 3, dailyCap: 50 });
		await b.load();
		expect(b.dailyCount.value).toBe(3);
		expect(b.sessionCount.value).toBe(0); // session is a fresh run
	});

	it('keeps counting even when the persist write fails', async () => {
		setThrows = true;
		const cap = useFeedSessionCap({ sessionCap: 2 });
		await cap.load();
		await cap.note(2);
		expect(cap.sessionCount.value).toBe(2);
		expect(cap.capReached.value).toBe(true);
	});
});

describe('useFeedSessionCap.resetSession + keepBrowsing', () => {
	it('resetSession clears the session run but keeps the daily ceiling', async () => {
		const cap = useFeedSessionCap({ sessionCap: 3, dailyCap: 100 });
		await cap.load();
		await cap.note(3);
		expect(cap.capReached.value).toBe(true);
		cap.resetSession();
		expect(cap.sessionCount.value).toBe(0);
		expect(cap.dailyCount.value).toBe(3);
		expect(cap.capReached.value).toBe(false);
	});

	it('keepBrowsing suppresses the cap for the rest of the session', async () => {
		const cap = useFeedSessionCap({ sessionCap: 2, dailyCap: 100 });
		await cap.load();
		await cap.note(2);
		expect(cap.capReached.value).toBe(true);
		cap.keepBrowsing();
		expect(cap.capReached.value).toBe(false);
		await cap.note(50); // still counting, still suppressed
		expect(cap.capReached.value).toBe(false);
		expect(cap.capReason.value).toBe(null);
	});

	it('resetSession re-arms the cap after a keepBrowsing override', async () => {
		const cap = useFeedSessionCap({ sessionCap: 2, dailyCap: 100 });
		await cap.load();
		await cap.note(2);
		cap.keepBrowsing();
		cap.resetSession();
		await cap.note(2);
		expect(cap.capReached.value).toBe(true);
	});
});
