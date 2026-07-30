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

/**
 * Decide whether the post-OAuth username step should open.
 *
 * The pending flag is durable, so once it reads true the step is owed to the user. Auth is the
 * part that is not settled yet: `currentUser` transiently nulls right after an OAuth hydrate, and
 * deciding on that one snapshot dropped the step permanently because nothing re-checks it.
 */
export async function shouldOpenUsernamePrompt(options: {
	/** true when the durable oauth-signup flag is set */
	readPending: () => Promise<boolean>;
	hasUser: () => boolean;
	/** resolve once a user appears, or on timeout; only consulted when there is none yet */
	waitForUser: () => Promise<void>;
}): Promise<boolean> {
	const { readPending, hasUser, waitForUser } = options;

	let pending = false;
	try {
		pending = await readPending();
	} catch {
		// a failed read must not block a returning user, so treat it as not-pending
		return false;
	}
	if (!pending) return false;

	if (!hasUser()) await waitForUser();
	return hasUser();
}
