// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashString, seededRandom, seededShuffle } from '~/utils/seed';

const NS = 'sky:scene:v1:earth';

function take(rng: () => number, count: number): number[] {
	return Array.from({ length: count }, () => rng());
}

describe('hashString', () => {
	it('returns the djb2 offset basis for an empty string', () => {
		expect(hashString('')).toBe(5381);
	});

	it('is stable for a fixed input', () => {
		expect(hashString('a')).toBe(177670);
		expect(hashString(NS)).toBe(1850945709);
	});

	it('is never negative, even for inputs that overflow int32', () => {
		const long = 'sky:scene:v1:'.repeat(64);
		expect(hashString(long)).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(hashString(long))).toBe(true);
	});

	it('separates inputs that differ by one character', () => {
		expect(hashString(`${NS}:clouds`)).not.toBe(hashString(`${NS}:cloudt`));
	});
});

describe('seededRandom', () => {
	it('matches the mulberry32 vectors for seed 1', () => {
		expect(take(seededRandom(1), 4)).toEqual([
			0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741
		]);
	});

	it('stays inside [0, 1)', () => {
		const rng = seededRandom(hashString(NS));
		for (const value of take(rng, 500)) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it('replays the same sequence for the same seed', () => {
		expect(take(seededRandom(99), 8)).toEqual(take(seededRandom(99), 8));
	});

	it('diverges for a different seed', () => {
		expect(take(seededRandom(99), 8)).not.toEqual(take(seededRandom(100), 8));
	});

	it('gives each namespaced subsystem an independent stream', () => {
		// the whole point of the namespace convention: draining one stream cannot shift another
		const clouds = seededRandom(hashString(`${NS}:clouds`));
		const horizon = seededRandom(hashString(`${NS}:horizon`));
		expect(clouds()).toBeCloseTo(0.09152516210451722, 12);
		take(clouds, 50);
		expect(horizon()).toBeCloseTo(0.4568625786341727, 12);

		// and a stream created after the sibling was drained still starts where it always did
		expect(seededRandom(hashString(`${NS}:horizon`))()).toBeCloseTo(0.4568625786341727, 12);
	});

	it('does not collide across subsystem names for one scene seed', () => {
		const first = ['clouds', 'horizon', 'ridge', 'celestial', 'moon'].map((subsystem) =>
			seededRandom(hashString(`${NS}:${subsystem}`))()
		);
		expect(new Set(first).size).toBe(first.length);
	});
});

describe('seededShuffle', () => {
	it('is a permutation of the input', () => {
		const items = [1, 2, 3, 4, 5, 6, 7, 8];
		const out = seededShuffle(items, seededRandom(42));
		expect([...out].sort((a, b) => a - b)).toEqual(items);
	});

	it('matches the fixed vector for seed 42', () => {
		expect(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRandom(42))).toEqual([
			3, 8, 2, 1, 7, 6, 4, 5
		]);
	});

	it('never mutates the source array', () => {
		const items = ['a', 'b', 'c', 'd'];
		seededShuffle(items, seededRandom(7));
		expect(items).toEqual(['a', 'b', 'c', 'd']);
	});

	it('handles empty and single-item inputs', () => {
		expect(seededShuffle([], seededRandom(1))).toEqual([]);
		expect(seededShuffle(['only'], seededRandom(1))).toEqual(['only']);
	});
});
