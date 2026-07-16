// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { POLL_VOTE_TTL_MS, isPollVoteFresh } from '~/utils/poll';

// fixed "now" so the window math is deterministic regardless of the runner's clock
const NOW_MS = Date.UTC(2026, 6, 15, 12, 0, 0); // 2026-07-15T12:00:00Z
const NOW_SECONDS = Math.floor(NOW_MS / 1000);

describe('POLL_VOTE_TTL_MS', () => {
	it('is a 24-hour window', () => {
		expect(POLL_VOTE_TTL_MS).toBe(24 * 60 * 60 * 1000);
	});
});

describe('isPollVoteFresh', () => {
	it('treats a vote cast right now (unix seconds) as fresh', () => {
		expect(isPollVoteFresh(NOW_SECONDS, POLL_VOTE_TTL_MS, NOW_MS)).toBe(true);
	});

	it('treats a vote from an hour ago as fresh', () => {
		const anHourAgo = NOW_SECONDS - 60 * 60;
		expect(isPollVoteFresh(anHourAgo, POLL_VOTE_TTL_MS, NOW_MS)).toBe(true);
	});

	it('treats a vote just inside the 24h window as fresh', () => {
		const justInside = NOW_SECONDS - (24 * 60 * 60 - 1);
		expect(isPollVoteFresh(justInside, POLL_VOTE_TTL_MS, NOW_MS)).toBe(true);
	});

	it('expires a vote exactly at the 24h boundary (regression: poll never reopened)', () => {
		const exactlyOneDay = NOW_SECONDS - 24 * 60 * 60;
		expect(isPollVoteFresh(exactlyOneDay, POLL_VOTE_TTL_MS, NOW_MS)).toBe(false);
	});

	it('expires a several-days-old vote so the poll can be answered again', () => {
		const threeDaysAgo = NOW_SECONDS - 3 * 24 * 60 * 60;
		expect(isPollVoteFresh(threeDaysAgo, POLL_VOTE_TTL_MS, NOW_MS)).toBe(false);
	});

	it('accepts a voted_at that is already in milliseconds (unit drift guard)', () => {
		// a millisecond timestamp from an hour ago must still read as fresh, not far-future
		const anHourAgoMs = NOW_MS - 60 * 60 * 1000;
		expect(isPollVoteFresh(anHourAgoMs, POLL_VOTE_TTL_MS, NOW_MS)).toBe(true);
		const fourDaysAgoMs = NOW_MS - 4 * 24 * 60 * 60 * 1000;
		expect(isPollVoteFresh(fourDaysAgoMs, POLL_VOTE_TTL_MS, NOW_MS)).toBe(false);
	});

	it('returns false for missing / zero / negative timestamps', () => {
		expect(isPollVoteFresh(undefined, POLL_VOTE_TTL_MS, NOW_MS)).toBe(false);
		expect(isPollVoteFresh(null, POLL_VOTE_TTL_MS, NOW_MS)).toBe(false);
		expect(isPollVoteFresh(0, POLL_VOTE_TTL_MS, NOW_MS)).toBe(false);
		expect(isPollVoteFresh(-100, POLL_VOTE_TTL_MS, NOW_MS)).toBe(false);
	});

	it('defaults now to Date.now() when omitted', () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		expect(isPollVoteFresh(nowSeconds)).toBe(true);
		expect(isPollVoteFresh(nowSeconds - 10 * 24 * 60 * 60)).toBe(false);
	});
});
