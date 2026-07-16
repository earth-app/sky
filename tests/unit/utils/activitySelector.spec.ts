// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type ActivitySelectorItem, filterActivityItems } from '~/utils/activitySelector';

const item = (
	value: string,
	label: string,
	extra: Partial<ActivitySelectorItem> = {}
): ActivitySelectorItem => ({ value, label, icon: 'mdi:test', ...extra });

const CATALOG: ActivitySelectorItem[] = [
	item('yoga', 'Yoga'),
	item('jogging', 'Jogging'),
	item('sea-kayaking', 'Sea Kayaking'),
	item('HOBBY', 'Hobby', { isActivityType: true })
];

describe('filterActivityItems', () => {
	it('returns the full list when the query is empty or whitespace', () => {
		expect(filterActivityItems(CATALOG, '', null)).toHaveLength(4);
		expect(filterActivityItems(CATALOG, '   ', new Set())).toHaveLength(4);
	});

	it('matches real activities by a label substring', () => {
		const res = filterActivityItems(CATALOG, 'kayak', null);
		expect(res.map((r) => r.value)).toEqual(['sea-kayaking']);
	});

	it('is case-insensitive and trims the query', () => {
		const res = filterActivityItems(CATALOG, '  YOGA ', null);
		expect(res.map((r) => r.value)).toEqual(['yoga']);
	});

	it('surfaces a server alias/description match whose label lacks the query (the lock regression)', () => {
		// "run" is not in "Jogging"'s label, but the server matched it via an alias; trust the set
		const serverMatches = new Set(['jogging']);
		const res = filterActivityItems(CATALOG, 'run', serverMatches);
		expect(res.map((r) => r.value)).toContain('jogging');
	});

	it('without a server set, a non-label query finds nothing (proves the old client-only path was the bug)', () => {
		const res = filterActivityItems(CATALOG, 'run', null);
		expect(res).toHaveLength(0);
	});

	it('keeps the label fallback when the server returned nothing (e.g. stale/offline)', () => {
		// empty server set must not hide a locally-known label match
		const res = filterActivityItems(CATALOG, 'yoga', new Set());
		expect(res.map((r) => r.value)).toEqual(['yoga']);
	});

	it('filters activity types by label only, never by the server set (types are client-only)', () => {
		// a server set that (wrongly) includes the type id must not force-show it for a non-label query
		const serverMatches = new Set(['HOBBY']);
		expect(filterActivityItems(CATALOG, 'run', serverMatches).map((r) => r.value)).not.toContain(
			'HOBBY'
		);
		// but a label match on the type still works
		expect(filterActivityItems(CATALOG, 'hobb', null).map((r) => r.value)).toEqual(['HOBBY']);
	});
});
