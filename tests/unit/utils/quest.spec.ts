// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { filterQuests, questCountText } from '~/utils/quest';

describe('filterQuests', () => {
	const catalog = [
		{ id: 'city_explorer', title: 'City Explorer', description: 'Walk the block' },
		{ id: 'sky_report', title: 'Sky Report', description: 'Look up' },
		{ id: 'runner', title: 'Runner', description: 'Go for a jog' }
	];

	it('drops the active quest so it is not rendered twice', () => {
		const shown = filterQuests(catalog, '', 'sky_report');
		expect(shown.map((quest) => quest.id)).toEqual(['city_explorer', 'runner']);
	});

	it('keeps the whole catalog when nothing is active or searched', () => {
		expect(filterQuests(catalog)).toHaveLength(3);
		expect(filterQuests(catalog, '   ', null)).toHaveLength(3);
	});

	it('matches id, title, and description case-insensitively', () => {
		expect(filterQuests(catalog, 'CITY').map((q) => q.id)).toEqual(['city_explorer']);
		expect(filterQuests(catalog, 'jog').map((q) => q.id)).toEqual(['runner']);
		expect(filterQuests(catalog, 'sky_rep').map((q) => q.id)).toEqual(['sky_report']);
	});

	it('applies the active-quest exclusion together with the search term', () => {
		expect(filterQuests(catalog, 'look up', 'sky_report')).toEqual([]);
	});

	it('tolerates missing lists and partial entries', () => {
		expect(filterQuests(null)).toEqual([]);
		expect(filterQuests(undefined, 'x')).toEqual([]);
		expect(filterQuests([{}], 'anything')).toEqual([]);
		expect(filterQuests([{}], '')).toHaveLength(1);
	});
});

describe('questCountText', () => {
	it('stays terse when nothing is held back', () => {
		expect(questCountText(36, 36)).toBe('36 shown');
	});

	it('names the total whenever the list is filtered', () => {
		expect(questCountText(35, 36)).toBe('35 of 36 shown');
		expect(questCountText(0, 36)).toBe('0 of 36 shown');
	});

	it('never claims a total below what is shown', () => {
		expect(questCountText(36, 35)).toBe('36 shown');
		expect(questCountText(5, Number.NaN)).toBe('5 shown');
	});

	it('floors fractional or negative inputs', () => {
		expect(questCountText(-3, 10)).toBe('0 of 10 shown');
		expect(questCountText(2.7, 10.2)).toBe('2 of 10 shown');
	});
});
