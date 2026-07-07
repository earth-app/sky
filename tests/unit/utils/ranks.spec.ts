// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TYPES, accountTypeLabel } from '~/utils/ranks';

describe('ACCOUNT_TYPES', () => {
	it('lists all five account levels in ascending privilege order', () => {
		expect(ACCOUNT_TYPES).toEqual(['FREE', 'PRO', 'WRITER', 'ORGANIZER', 'ADMINISTRATOR']);
	});
});

describe('accountTypeLabel', () => {
	it('title-cases each single-word enum value', () => {
		expect(accountTypeLabel('FREE')).toBe('Free');
		expect(accountTypeLabel('PRO')).toBe('Pro');
		expect(accountTypeLabel('WRITER')).toBe('Writer');
		expect(accountTypeLabel('ORGANIZER')).toBe('Organizer');
		expect(accountTypeLabel('ADMINISTRATOR')).toBe('Administrator');
	});

	it('title-cases each word of an underscore-separated value', () => {
		expect(accountTypeLabel('SUPER_ADMIN' as any)).toBe('Super Admin');
	});
});
