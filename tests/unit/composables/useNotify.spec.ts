import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastCalls: Array<{ text: string; duration?: string }> = [];
vi.mock('@capacitor/toast', () => ({
	Toast: {
		show: vi.fn(async (opts: { text: string; duration?: string }) => {
			toastCalls.push(opts);
		})
	}
}));

import {
	extractServerMessage,
	formatApiError,
	looksLikeRawHttpError,
	showErrorToast,
	showInfoToast
} from '~/composables/useNotify';

beforeEach(() => {
	toastCalls.length = 0;
});

describe('looksLikeRawHttpError', () => {
	it('flags a bracketed status string', () => {
		expect(looksLikeRawHttpError('[404] /api/v2/users/current')).toBe(true);
	});

	it('flags any string containing an /api/ path', () => {
		expect(looksLikeRawHttpError('fetch failed at /api/foo')).toBe(true);
	});

	it('does not flag a clean human message', () => {
		expect(looksLikeRawHttpError('Your session expired.')).toBe(false);
	});

	it('returns false for empty input', () => {
		expect(looksLikeRawHttpError('')).toBe(false);
	});
});

describe('formatApiError', () => {
	it('returns the fallback for nullish error', () => {
		expect(formatApiError(null, 'fallback copy')).toBe('fallback copy');
	});

	it('passes through a clean human string unchanged', () => {
		expect(formatApiError('That username is taken.')).toBe('That username is taken.');
	});

	it('maps a bracketed status string to the friendly status fallback', () => {
		expect(formatApiError('[404] /api/v2/users/bob')).toBe(
			'We could not find what you were looking for.'
		);
	});

	it('maps a 429 bracketed string to the rate-limit copy', () => {
		expect(formatApiError('[429] /v2/users/login')).toBe(
			'You are doing that too often. Please slow down and try again.'
		);
	});

	it('prefers a clean server message from error.data.message', () => {
		const err = { statusCode: 400, data: { message: 'Custom backend message' } };
		expect(formatApiError(err)).toBe('Custom backend message');
	});

	it('reads a string error.data body', () => {
		const err = { status: 409, data: 'Already exists' };
		expect(formatApiError(err)).toBe('Already exists');
	});

	it('falls back to status copy when only a status code is present', () => {
		const err = { statusCode: 401 };
		expect(formatApiError(err)).toBe('You need to sign in to continue.');
	});

	it('extracts a status embedded in error.message and uses status copy', () => {
		// raw-http-shaped message => sanitized; numeric 503 in the message => status copy
		const err = { message: '[503] /api/foo failed' };
		expect(formatApiError(err)).toBe('The service is temporarily unavailable. Please try again.');
	});

	it('never surfaces a raw server message that itself looks like a raw http error', () => {
		const err = { statusCode: 500, data: { message: '[500] /api/v2/whatever' } };
		// the raw-looking server message is rejected, status copy wins
		expect(formatApiError(err)).toBe('Something went wrong on our end. Please try again shortly.');
	});

	it('uses the supplied fallback for an unknown shape', () => {
		expect(formatApiError({}, 'nope')).toBe('nope');
	});

	it('extractServerMessage is an alias of formatApiError', () => {
		expect(extractServerMessage).toBe(formatApiError);
	});
});

describe('showErrorToast', () => {
	it('shows the formatted message and returns it', async () => {
		const text = await showErrorToast('[404] /api/v2/x');
		expect(text).toBe('We could not find what you were looking for.');
		expect(toastCalls).toHaveLength(1);
		expect(toastCalls[0]!.text).toBe('We could not find what you were looking for.');
		expect(toastCalls[0]!.duration).toBe('long');
	});

	it('never shows a raw bracketed status to the user', async () => {
		await showErrorToast('[400] /api/v2/prompts');
		expect(toastCalls[0]!.text).not.toMatch(/\[\d{3}\]/);
		expect(toastCalls[0]!.text).not.toContain('/api/');
	});
});

describe('showInfoToast', () => {
	it('shows a short info toast', async () => {
		await showInfoToast('Saved!');
		expect(toastCalls).toHaveLength(1);
		expect(toastCalls[0]!.text).toBe('Saved!');
		expect(toastCalls[0]!.duration).toBe('short');
	});

	it('no-ops on empty text', async () => {
		await showInfoToast('');
		expect(toastCalls).toHaveLength(0);
	});
});
