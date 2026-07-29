import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastCalls: Array<{ text: string; duration?: string }> = [];
vi.mock('@capacitor/toast', () => ({
	Toast: {
		show: vi.fn(async (opts: { text: string; duration?: string }) => {
			toastCalls.push(opts);
		})
	}
}));

import { Toast } from '@capacitor/toast';
import {
	clearMToasts,
	dismissMToast,
	enqueueMToast,
	extractServerMessage,
	formatApiError,
	looksLikeRawHttpError,
	MAX_VISIBLE_TOASTS,
	mToastHostReady,
	mToasts,
	registerMToastHost,
	showErrorToast,
	showInfoToast,
	showSuccessToast,
	showToast,
	showWarningToast
} from '~/composables/useNotify';

// every test starts with no in-app host, so the default route is the native fallback
let releaseHost: (() => void) | null = null;

function mountHost() {
	releaseHost = registerMToastHost();
}

function unmountHost() {
	releaseHost?.();
	releaseHost = null;
}

beforeEach(() => {
	toastCalls.length = 0;
	clearMToasts();
});

afterEach(() => {
	unmountHost();
	clearMToasts();
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

describe('native fallback', () => {
	it('uses the native plugin when no in-app host is mounted', async () => {
		await showInfoToast('No host here.');
		expect(mToasts.value).toHaveLength(0);
		expect(toastCalls).toEqual([{ text: 'No host here.', duration: 'short' }]);
	});

	it('defaults warning to long and success to short', async () => {
		await showWarningToast('Careful.');
		await showSuccessToast('Done.');
		expect(toastCalls).toEqual([
			{ text: 'Careful.', duration: 'long' },
			{ text: 'Done.', duration: 'short' }
		]);
	});

	it('honours an explicit duration override', async () => {
		await showInfoToast('Read this one.', { duration: 'long' });
		expect(toastCalls[0]!.duration).toBe('long');
	});

	it('swallows a rejecting plugin instead of throwing into the caller', async () => {
		vi.mocked(Toast.show).mockRejectedValueOnce(new Error('bridge not ready'));
		const text = await showErrorToast('[500] /api/v2/x');
		expect(text).toBe('Something went wrong on our end. Please try again shortly.');
		expect(toastCalls).toHaveLength(0);
	});

	it('swallows a rejecting plugin on the info path too', async () => {
		vi.mocked(Toast.show).mockRejectedValueOnce(new Error('bridge not ready'));
		await expect(showInfoToast('Saved!')).resolves.toBeUndefined();
	});

	it('recovers on the next call after a plugin failure', async () => {
		vi.mocked(Toast.show).mockRejectedValueOnce(new Error('bridge not ready'));
		await showInfoToast('Dropped.');
		await showInfoToast('Delivered.');
		expect(toastCalls).toEqual([{ text: 'Delivered.', duration: 'short' }]);
	});
});

describe('in-app toast surface', () => {
	it('tracks mounted hosts and releases idempotently', () => {
		expect(mToastHostReady.value).toBe(false);

		const release = registerMToastHost();
		expect(mToastHostReady.value).toBe(true);

		release();
		release();
		expect(mToastHostReady.value).toBe(false);
	});

	it('queues in-app and never touches the native plugin', async () => {
		mountHost();
		await showInfoToast('Word saved.');

		expect(toastCalls).toHaveLength(0);
		expect(mToasts.value).toHaveLength(1);
		expect(mToasts.value[0]).toMatchObject({ severity: 'info', text: 'Word saved.' });
		expect(mToasts.value[0]!.dwellMs).toBeGreaterThan(0);
	});

	it('routes every severity sibling to the queue', async () => {
		mountHost();
		await showInfoToast('One.');
		await showSuccessToast('Two.');
		await showWarningToast('Three.');
		await showToast('error', 'Four.');

		expect(toastCalls).toHaveLength(0);
		expect(mToasts.value.map((toast) => toast.severity)).toEqual([
			'info',
			'success',
			'warning',
			'error'
		]);
	});

	it('formats an error, queues it, and still returns the copy', async () => {
		mountHost();
		const text = await showErrorToast('[404] /api/v2/x');

		expect(text).toBe('We could not find what you were looking for.');
		expect(mToasts.value[0]!.severity).toBe('error');
		expect(mToasts.value[0]!.text).toBe(text);
		expect(mToasts.value[0]!.text).not.toMatch(/\[\d{3}\]/);
	});

	it('dwells longer on an error than on an info toast', async () => {
		mountHost();
		await showErrorToast('Something broke.');
		await showInfoToast('Just a note.');

		expect(mToasts.value[0]!.dwellMs).toBeGreaterThan(mToasts.value[1]!.dwellMs);
	});

	it('carries a title and an inline action onto the queued toast', async () => {
		const handler = vi.fn();
		mountHost();
		await showInfoToast('Answer kept for later.', {
			title: 'Draft Saved',
			action: { label: 'Undo', handler }
		});

		expect(mToasts.value[0]!.title).toBe('Draft Saved');
		expect(mToasts.value[0]!.action?.label).toBe('Undo');
		expect(handler).not.toHaveBeenCalled();
	});

	it('dedupes a repeat while the first copy is still queued', async () => {
		mountHost();
		await showInfoToast('Word saved.');
		await showInfoToast('Word saved.');

		expect(mToasts.value).toHaveLength(1);
	});

	it('shows the same copy again once the first was dismissed', async () => {
		mountHost();
		await showInfoToast('Word saved.');
		dismissMToast(mToasts.value[0]!.id);
		await showInfoToast('Word saved.');

		expect(mToasts.value).toHaveLength(1);
	});

	it('keeps the same copy at a different severity as its own toast', async () => {
		mountHost();
		await showInfoToast('Heads up.');
		await showWarningToast('Heads up.');

		expect(mToasts.value.map((toast) => toast.severity)).toEqual(['info', 'warning']);
	});

	it('caps the queue and evicts the oldest waiting toast, never a visible one', async () => {
		mountHost();
		for (let i = 0; i < 8; i++) await showInfoToast(`Message ${i}`);

		expect(mToasts.value.length).toBeLessThanOrEqual(5);
		expect(mToasts.value.slice(0, MAX_VISIBLE_TOASTS).map((toast) => toast.text)).toEqual([
			'Message 0',
			'Message 1'
		]);
		expect(mToasts.value.at(-1)!.text).toBe('Message 7');
	});

	it('dismisses by id and clears the whole queue', async () => {
		mountHost();
		await showInfoToast('One.');
		await showInfoToast('Two.');

		dismissMToast(mToasts.value[0]!.id);
		expect(mToasts.value.map((toast) => toast.text)).toEqual(['Two.']);

		clearMToasts();
		expect(mToasts.value).toHaveLength(0);
	});

	it('no-ops on empty text for every sibling', async () => {
		mountHost();
		await showInfoToast('');
		await showSuccessToast('');
		await showWarningToast('');
		await showToast('error', '');

		expect(mToasts.value).toHaveLength(0);
		expect(toastCalls).toHaveLength(0);
	});

	it('drops the queue and reverts to native once the last host unmounts', async () => {
		mountHost();
		await showInfoToast('First.');
		expect(toastCalls).toHaveLength(0);

		unmountHost();
		expect(mToasts.value).toHaveLength(0);

		await showInfoToast('Second.');
		expect(toastCalls).toEqual([{ text: 'Second.', duration: 'short' }]);
	});

	it('falls back to native while the app is backgrounded', async () => {
		const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden'
		});

		try {
			mountHost();
			await showInfoToast('Backgrounded.');

			expect(mToasts.value).toHaveLength(0);
			expect(toastCalls).toEqual([{ text: 'Backgrounded.', duration: 'short' }]);
		} finally {
			if (original) Object.defineProperty(document, 'visibilityState', original);
			else delete (document as unknown as Record<string, unknown>).visibilityState;
		}
	});

	it('enqueueMToast reports the miss so callers can fall back', () => {
		expect(enqueueMToast('info', 'No host.')).toBeNull();

		mountHost();
		const queued = enqueueMToast('info', 'Host is up.');
		expect(queued).not.toBeNull();
		expect(mToasts.value[0]!.id).toBe(queued!.id);
	});

	it('dispatches earth-app:toast for the in-app path only', async () => {
		const seen: Array<{ severity: string; text: string }> = [];
		const onToast = (event: Event) =>
			seen.push((event as CustomEvent<{ severity: string; text: string }>).detail);
		window.addEventListener('earth-app:toast', onToast);

		try {
			mountHost();
			await showSuccessToast('Synced your outdoor time.');

			unmountHost();
			await showSuccessToast('Native only.');
		} finally {
			window.removeEventListener('earth-app:toast', onToast);
		}

		expect(seen).toEqual([
			{ id: expect.any(Number), severity: 'success', text: 'Synced your outdoor time.' }
		]);
		expect(toastCalls).toEqual([{ text: 'Native only.', duration: 'short' }]);
	});
});

// the host is Playwright's job to render; these lock the contract the review called out,
// so nobody re-hardcodes a z-index the way the badge ribbon did
describe('MToast host contract', () => {
	// cwd-relative on purpose: under the nuxt environment import.meta.url is an http url
	const SOURCE = readFileSync('src/components/MToast.vue', 'utf8');

	it('stacks on the documented z-index scale, never a bare number', () => {
		expect(SOURCE).toContain('z-index: var(--m-z-toast)');
		expect(SOURCE).not.toMatch(/z-index:\s*\d/);
	});

	it('anchors clear of the offline banner and the badge ribbon at the top', () => {
		expect(SOURCE).toMatch(/bottom:\s*calc\(env\(safe-area-inset-bottom/);
		expect(SOURCE).not.toMatch(/\n\ttop:/);
	});

	it('labels both controls and keeps them as IonButton', () => {
		expect(SOURCE).toContain('aria-label="Dismiss"');
		expect(SOURCE).toContain(':aria-label="toast.action.label"');
		expect(SOURCE).not.toContain('<UButton');
	});

	it('exposes the queue as a live region that escalates for errors', () => {
		expect(SOURCE).toContain(`:role="assertive ? 'alert' : 'status'"`);
		expect(SOURCE).toContain(`:aria-live="assertive ? 'assertive' : 'polite'"`);
	});

	it('gates motion on the os query AND the in-app animations setting', () => {
		expect(SOURCE).toContain(`useMediaQuery('(prefers-reduced-motion: reduce)')`);
		expect(SOURCE).toContain('!appSettings.value.animations');
	});

	it('draws tone from the ionic role variables, not a raw tailwind palette', () => {
		expect(SOURCE).toContain('var(--ion-color-danger)');
		expect(SOURCE).not.toMatch(/bg-(red|amber|green|blue)-\d/);
	});
});
