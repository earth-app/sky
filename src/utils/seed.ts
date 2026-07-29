/** djb2-style hash; not cryptographic, just stable across runs, platforms and app versions */
export function hashString(input: string): number {
	let h = 5381;
	for (let i = 0; i < input.length; i++) {
		h = ((h << 5) + h + input.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

/**
 * mulberry32, seeded so a scene rebuilds identically on every launch and a test can assert
 * an exact frame without stubbing `Math.random`.
 *
 * Seed strings are namespaced - callers pass `sky:scene:v1:${id}` - and every subsystem
 * draws from its OWN stream (`sky:scene:v1:${id}:clouds`, `:horizon`, `:celestial`). One
 * shared stream would mean adding a subsystem consumes draws the later ones used to get, so
 * an unrelated feature would silently repaint everything downstream of it; separate streams
 * keep each subsystem stable forever.
 */
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

/** fisher-yates against a supplied rng so the shuffle stays reproducible */
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j] as T, out[i] as T];
	}
	return out;
}
