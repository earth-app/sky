// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { usernameFromEmail, usernameHasWhitespace } from '~/utils/username';

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
