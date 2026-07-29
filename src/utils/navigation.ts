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
