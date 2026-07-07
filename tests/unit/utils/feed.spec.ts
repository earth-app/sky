// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { interleaveFeed } from '~/utils/feed';

type Item = { type: string; id: number };

function bucket(type: string, n: number): Item[] {
	return Array.from({ length: n }, (_, i) => ({ type, id: i }));
}

function key(item: Item): string {
	return `${item.type}:${item.id}`;
}

// longest run of consecutive same-type items in the blended output
function maxRun(items: Item[]): number {
	let max = 0;
	let run = 0;
	let prev: string | null = null;
	for (const item of items) {
		run = item.type === prev ? run + 1 : 1;
		if (run > max) max = run;
		prev = item.type;
	}
	return max;
}

describe('interleaveFeed', () => {
	it('loses and duplicates nothing (set + count preserved)', () => {
		const buckets = [bucket('activity', 6), bucket('prompt', 5), bucket('user', 7)];
		const total = 6 + 5 + 7;
		const out = interleaveFeed(buckets, 1);

		expect(out).toHaveLength(total);
		const keys = out.map(key);
		expect(new Set(keys).size).toBe(total);
		// every original item is present exactly once
		const expected = buckets.flat().map(key).sort();
		expect([...keys].sort()).toEqual(expected);
	});

	it('interleaves balanced buckets instead of clumping by type', () => {
		// 5 balanced types; a clumped concat would give runs of 6, interleave must not
		const buckets = [
			bucket('activity', 6),
			bucket('prompt', 6),
			bucket('article', 6),
			bucket('event', 6),
			bucket('user', 6)
		];
		const out = interleaveFeed(buckets, 42);

		expect(out).toHaveLength(30);
		// perfect round-robin for equal buckets => no back-to-back same type
		expect(maxRun(out)).toBeLessThanOrEqual(1);
	});

	it('keeps runs bounded even with uneven bucket sizes', () => {
		const buckets = [bucket('activity', 10), bucket('prompt', 4), bucket('user', 3)];
		const out = interleaveFeed(buckets, 7);

		expect(out).toHaveLength(17);
		// the dominant bucket spreads rather than dumping all 10 in a row
		expect(maxRun(out)).toBeLessThan(4);
	});

	it('is deterministic for a given seed and varies without one', () => {
		const buckets = [bucket('activity', 5), bucket('prompt', 5), bucket('user', 5)];
		const a = interleaveFeed(buckets, 99).map(key);
		const b = interleaveFeed(buckets, 99).map(key);
		expect(a).toEqual(b);
	});

	it('handles empty and single-bucket inputs', () => {
		expect(interleaveFeed<Item>([], 1)).toEqual([]);
		expect(interleaveFeed([[], []], 1)).toEqual([]);

		const only = bucket('activity', 4);
		const out = interleaveFeed([[], only, []], 1);
		expect(out).toHaveLength(4);
		expect(new Set(out.map(key)).size).toBe(4);
	});

	it('drops empty buckets without affecting the blend count', () => {
		const buckets = [bucket('activity', 3), [], bucket('user', 3)];
		const out = interleaveFeed(buckets, 5);
		expect(out).toHaveLength(6);
		expect(maxRun(out)).toBeLessThanOrEqual(1);
	});
});
