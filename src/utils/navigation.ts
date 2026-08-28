/**
 * Drive a navigation until the router has actually left the current route.
 *
 * `vue-router`'s `push` **resolves** with a `NavigationFailure` (aborted / cancelled /
 * duplicated) instead of rejecting, so awaiting it proves nothing about where the app ended up.
 * A caller that only watches for a thrown error treats a dropped navigation as a success, and a
 * one-shot guard around that await strands the user on the route they started from.
 *
 * @returns whether the app landed, so the caller can release its own guard when it did not
 */
export async function navigateUntilLanded(options: {
	/** perform one navigation attempt; may resolve with a failure rather than throwing */
	navigate: () => Promise<unknown>;
	/** true once the router reports a route the caller considers arrived */
	landed: () => boolean;
	attempts?: number;
	retryMs?: number;
	sleep?: (ms: number) => Promise<void>;
	onError?: (error: unknown, attempt: number) => void;
}): Promise<boolean> {
	const {
		navigate,
		landed,
		attempts = 3,
		retryMs = 150,
		sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
		onError
	} = options;

	// a caller that is already where it wants to be must not navigate again; vue-router would
	// report that as a duplicated failure and it would read as a dropped attempt
	if (landed()) return true;

	const total = Math.max(1, attempts);
	for (let attempt = 1; attempt <= total; attempt++) {
		try {
			await navigate();
		} catch (error) {
			onError?.(error, attempt);
		}
		if (landed()) return true;
		if (attempt < total) await sleep(retryMs);
	}

	return false;
}

/**
 * Maps a crust path onto the route sky actually has.
 *
 * These rules are deliberately the same ones `useDeepLinkRouting.resolveDeepLink` applies, and that
 * composable delegates here so the two cannot drift. Both are needed: a universal link arrives as a
 * URL and a notification arrives as a stored path, but they must land in the same place.
 *
 * The notification path used to prefix `/tabs/` blindly, which is how tapping the staged-activities
 * push did nothing at all - `/tabs/admin` did not exist.
 */
const LINK_MAP: { match: RegExp; to: (path: string, query: string) => string }[] = [
	// the whole admin suite is one surface here
	{ match: /^\/admin(\/|$)/, to: () => '/tabs/admin' },
	// crust nests quests under the profile; sky gives them their own tab
	{ match: /^\/profile\/quests(\/|$)/, to: (_path, query) => `/tabs/quests${query}` },
	// sky has top-level /profile routes, so these pass through unprefixed
	{ match: /^\/profile(\/|$)/, to: (path, query) => `${path}${query}` }
];

export function notificationRoute(link: string | null | undefined): string | null {
	if (!link) return null;
	if (link.startsWith('http')) return link;

	const [rawPath = '', rawQuery = ''] = link.split('?');
	const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
	const query = rawQuery ? `?${rawQuery}` : '';

	for (const { match, to } of LINK_MAP) {
		if (match.test(path)) return to(path, query);
	}

	return `/tabs${path}${query}`;
}
