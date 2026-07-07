export const OAUTH_USERNAME_PROMPT_KEY = 'sky:oauth-username-prompt-pending';
export const USERNAME_NO_SPACES_MESSAGE = 'Username cannot contain spaces';

// derive the default onboarding username placeholder from an email local-part
export function usernameFromEmail(email: string | null | undefined): string {
	if (!email) return '';
	const at = email.indexOf('@');
	const local = at === -1 ? email : email.slice(0, at);
	return local.trim();
}

// no-whitespace guard mirrored from crust's usernameSchema
export function usernameHasWhitespace(value: string | null | undefined): boolean {
	if (!value) return false;
	return /\s/.test(value);
}
