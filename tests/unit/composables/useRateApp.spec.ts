import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async () => ({ value: null })),
		set: vi.fn(async () => {}),
		remove: vi.fn(async () => {})
	}
}));

vi.mock('@capacitor/dialog', () => ({
	Dialog: {
		confirm: vi.fn(async () => ({ value: false })),
		alert: vi.fn(async () => {})
	}
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: () => false
	}
}));

import {
	RATE_APP_COOLDOWN_DAYS,
	RATE_APP_DEFAULT_STATE,
	RATE_APP_MIN_SESSIONS,
	type RateAppState,
	shouldPromptForReview
} from '~/composables/useRateApp';

const DAY_MS = 24 * 60 * 60 * 1000;
// fixed clock so all date math is deterministic (never eyeballed)
const NOW = Date.UTC(2026, 6, 1);

function makeState(overrides: Partial<RateAppState> = {}): RateAppState {
	return { ...RATE_APP_DEFAULT_STATE, ...overrides };
}

describe('RATE_APP thresholds', () => {
	it('matches the documented cadence (3 sessions, 60-day cooldown)', () => {
		expect(RATE_APP_MIN_SESSIONS).toBe(3);
		expect(RATE_APP_COOLDOWN_DAYS).toBe(60);
	});
});

describe('shouldPromptForReview', () => {
	it('is not eligible without engagement (no action, below the session threshold)', () => {
		expect(shouldPromptForReview(makeState({ sessionCount: 0 }), NOW)).toBe(false);
		expect(shouldPromptForReview(makeState({ sessionCount: RATE_APP_MIN_SESSIONS - 1 }), NOW)).toBe(
			false
		);
	});

	it('is eligible the first time once sessions reach the threshold', () => {
		expect(shouldPromptForReview(makeState({ sessionCount: RATE_APP_MIN_SESSIONS }), NOW)).toBe(
			true
		);
	});

	it('is eligible the first time a meaningful action happens, even below the session threshold', () => {
		expect(shouldPromptForReview(makeState({ sessionCount: 1, meaningfulAction: true }), NOW)).toBe(
			true
		);
	});

	it('is suppressed within the 60-day window after a dismissal', () => {
		const state = makeState({
			sessionCount: RATE_APP_MIN_SESSIONS,
			dismissed: true,
			lastPromptAt: NOW - (RATE_APP_COOLDOWN_DAYS - 1) * DAY_MS
		});
		expect(shouldPromptForReview(state, NOW)).toBe(false);
	});

	it('is eligible again once the 60-day cooldown has elapsed after a dismissal', () => {
		const state = makeState({
			sessionCount: RATE_APP_MIN_SESSIONS,
			dismissed: true,
			lastPromptAt: NOW - RATE_APP_COOLDOWN_DAYS * DAY_MS
		});
		expect(shouldPromptForReview(state, NOW)).toBe(true);
	});

	it('never prompts again once the user has chosen to review', () => {
		const state = makeState({
			sessionCount: 999,
			meaningfulAction: true,
			reviewed: true,
			dismissed: true,
			lastPromptAt: NOW - 10 * RATE_APP_COOLDOWN_DAYS * DAY_MS
		});
		expect(shouldPromptForReview(state, NOW)).toBe(false);
	});

	it('does not re-prompt after a prompt that was neither dismissed nor reviewed', () => {
		// defensive: a prompt was shown but no dismissal was recorded; stay quiet rather than nag
		const state = makeState({
			sessionCount: RATE_APP_MIN_SESSIONS,
			dismissed: false,
			lastPromptAt: NOW - 2 * RATE_APP_COOLDOWN_DAYS * DAY_MS
		});
		expect(shouldPromptForReview(state, NOW)).toBe(false);
	});
});
