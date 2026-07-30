// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
	shouldOpenUsernamePrompt,
	usernameFromEmail,
	usernameHasWhitespace
} from '~/utils/username';

describe('usernameHasWhitespace', () => {
	it('flags a username with an internal space', () => {
		expect(usernameHasWhitespace('john doe')).toBe(true);
	});

	it('flags tabs and leading/trailing whitespace', () => {
		expect(usernameHasWhitespace('john\tdoe')).toBe(true);
		expect(usernameHasWhitespace(' johndoe')).toBe(true);
		expect(usernameHasWhitespace('johndoe ')).toBe(true);
	});

	it('accepts a clean username', () => {
		expect(usernameHasWhitespace('john_doe-1.0')).toBe(false);
	});

	it('treats empty/nullish input as no whitespace', () => {
		expect(usernameHasWhitespace('')).toBe(false);
		expect(usernameHasWhitespace(null)).toBe(false);
		expect(usernameHasWhitespace(undefined)).toBe(false);
	});
});

describe('usernameFromEmail', () => {
	it('derives the local-part before the @', () => {
		expect(usernameFromEmail('cooldude78@example.com')).toBe('cooldude78');
	});

	it('trims surrounding whitespace on the local-part', () => {
		expect(usernameFromEmail('  spaced@example.com')).toBe('spaced');
	});

	it('returns the whole value when there is no @', () => {
		expect(usernameFromEmail('nodomain')).toBe('nodomain');
	});

	it('returns an empty string for empty/nullish input', () => {
		expect(usernameFromEmail('')).toBe('');
		expect(usernameFromEmail(null)).toBe('');
		expect(usernameFromEmail(undefined)).toBe('');
	});
});

describe('shouldOpenUsernamePrompt', () => {
	const opts = (over: Partial<Parameters<typeof shouldOpenUsernamePrompt>[0]> = {}) => ({
		readPending: async () => true,
		hasUser: () => true,
		waitForUser: async () => {},
		...over
	});

	it('opens when the flag is pending and a user is already there', async () => {
		const waitForUser = vi.fn(async () => {});
		expect(await shouldOpenUsernamePrompt(opts({ waitForUser }))).toBe(true);
		// no wait when the user is already resolved
		expect(waitForUser).not.toHaveBeenCalled();
	});

	it('stays closed when the flag is not pending, without waiting on auth', async () => {
		const waitForUser = vi.fn(async () => {});
		const open = await shouldOpenUsernamePrompt(
			opts({ readPending: async () => false, hasUser: () => false, waitForUser })
		);
		expect(open).toBe(false);
		expect(waitForUser).not.toHaveBeenCalled();
	});

	// the regression: currentUser transiently nulls right after an oauth hydrate, and deciding on
	// that snapshot dropped the step permanently because nothing re-checked it
	it('waits out a transient null user and still opens', async () => {
		let present = false;
		const open = await shouldOpenUsernamePrompt(
			opts({
				hasUser: () => present,
				waitForUser: async () => {
					present = true;
				}
			})
		);
		expect(open).toBe(true);
	});

	it('gives up when the user never arrives', async () => {
		const open = await shouldOpenUsernamePrompt(
			opts({ hasUser: () => false, waitForUser: async () => {} })
		);
		expect(open).toBe(false);
	});

	it('treats a failed preferences read as not-pending so a returning user is never blocked', async () => {
		const open = await shouldOpenUsernamePrompt(
			opts({
				readPending: async () => {
					throw new Error('preferences unavailable');
				}
			})
		);
		expect(open).toBe(false);
	});
});
