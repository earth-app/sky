// feed polls rotate daily, so a vote only locks the widget for a day; after that the same poll
// can be answered again. the server keeps the vote for 30 days, so the expiry is enforced client-side.
// mirrors crust's isPollVoteFresh (usePoll.ts) which sky can't import from the vendored tarball yet
export const POLL_VOTE_TTL_MS = 24 * 60 * 60 * 1000;

export function isPollVoteFresh(
	votedAt: number | null | undefined,
	ttlMs: number = POLL_VOTE_TTL_MS,
	now: number = Date.now()
): boolean {
	if (!votedAt || votedAt <= 0) return false;
	// server stores unix seconds; guard against a value already in milliseconds
	const votedAtMs = votedAt > 1e12 ? votedAt : votedAt * 1000;
	return now - votedAtMs < ttlMs;
}
