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

export function interleaveFeed<T>(buckets: T[][], seed?: number): T[] {
	const rng = makeRng(seed);
	const nonEmpty = buckets.filter((b) => b.length > 0).map((b) => shuffleInPlace([...b], rng));

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
