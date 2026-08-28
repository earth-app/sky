// mulberry32; deterministic when a seed is passed, else Math.random
function makeRng(seed?: number): () => number {
	if (seed === undefined) return Math.random;

	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// fisher-yates, in place
function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = arr[i]!;
		arr[i] = arr[j]!;
		arr[j] = tmp;
	}
	return arr;
}

// stable partition: demoted items keep their relative order but sink behind everything else
function sinkDemoted<T>(items: T[], demote: (item: T) => boolean): T[] {
	const keep: T[] = [];
	const sunk: T[] = [];
	for (const item of items) (demote(item) ? sunk : keep).push(item);
	return keep.concat(sunk);
}

/**
 * Blend per-type buckets into one feed.
 *
 * `demote` sinks items to the back of their own bucket before striding, so stale content (an event
 * that already ended) lands late in the feed instead of leading a discovery surface.
 */
export function interleaveFeed<T>(
	buckets: T[][],
	seed?: number,
	demote?: (item: T) => boolean
): T[] {
	const rng = makeRng(seed);
	const nonEmpty = buckets
		.filter((b) => b.length > 0)
		.map((b) => {
			const shuffled = shuffleInPlace([...b], rng);
			return demote ? sinkDemoted(shuffled, demote) : shuffled;
		});

	if (nonEmpty.length === 0) return [];
	if (nonEmpty.length === 1) return nonEmpty[0]!;

	// shuffle bucket order so equal-stride ties dont always favor the same type
	shuffleInPlace(nonEmpty, rng);

	type Slot = { item: T; pos: number; order: number };
	const slots: Slot[] = [];
	let order = 0;

	for (const bucket of nonEmpty) {
		const len = bucket.length;
		for (let i = 0; i < len; i += 1) {
			// even stride in (0,1): bigger buckets get tighter spacing so they spread out
			slots.push({ item: bucket[i]!, pos: (i + 0.5) / len, order: order++ });
		}
	}

	slots.sort((a, b) => a.pos - b.pos || a.order - b.order);
	return slots.map((s) => s.item);
}

/** a carousel is only worth its chrome (arrows, dots, counter) once there is a second slide */
export const MIN_GROUP_ITEMS = 2;

export function shouldGroup<T>(
	items: readonly T[] | null | undefined,
	intended: boolean = true
): boolean {
	if (!intended || !Array.isArray(items)) return false;

	return items.length >= MIN_GROUP_ITEMS;
}

export interface CaughtUpQuestCta {
	label: string;
	questId: string;
	/** the daily-quest chip is only marked tapped when the daily quest is what got opened */
	daily: boolean;
}

/**
 * Which quest the end-of-feed card should offer.
 *
 * An unfinished quest wins: sending someone to a second quest while one is open is the one thing the
 * calmest card in the app should not do.
 */
export function caughtUpQuestCta(
	currentQuestId: string | null | undefined,
	dailyQuestId: string | null | undefined
): CaughtUpQuestCta | null {
	if (currentQuestId) return { label: 'Continue Quest', questId: currentQuestId, daily: false };
	if (dailyQuestId) return { label: "Today's Quest", questId: dailyQuestId, daily: true };

	return null;
}
