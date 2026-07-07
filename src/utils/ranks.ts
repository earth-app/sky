import type { AccountType } from 'types/user';

// account levels in ascending order of privilege (mirrors ocean AccountType.values())
export const ACCOUNT_TYPES: readonly AccountType[] = [
	'FREE',
	'PRO',
	'WRITER',
	'ORGANIZER',
	'ADMINISTRATOR'
] as const;

// single-word enum -> Title Case label (FREE -> Free, ADMINISTRATOR -> Administrator)
export function accountTypeLabel(type: AccountType): string {
	return type
		.split('_')
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
		.join(' ');
}
