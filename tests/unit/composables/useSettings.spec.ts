import { beforeEach, describe, expect, it, vi } from 'vitest';

// stateful Map-backed Preferences mock so persistence can actually round-trip
const { store, prefsGet, prefsSet, prefsRemove, prefsClear } = vi.hoisted(() => {
	const store = new Map<string, string>();
	return {
		store,
		prefsGet: vi.fn(async ({ key }: { key: string }) => ({
			value: store.has(key) ? store.get(key)! : null
		})),
		prefsSet: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			store.set(key, value);
		}),
		prefsRemove: vi.fn(async ({ key }: { key: string }) => {
			store.delete(key);
		}),
		prefsClear: vi.fn(async () => {
			store.clear();
		})
	};
});

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: prefsGet,
		set: prefsSet,
		remove: prefsRemove,
		clear: prefsClear
	}
}));

import {
	APP_SETTINGS_DEFAULTS,
	formatDistanceUnits,
	toSettingStorageKey,
	useSettings
} from '~/composables/useSettings';

describe('toSettingStorageKey', () => {
	it('namespaces a setting key under the app.setting. prefix', () => {
		expect(toSettingStorageKey('units')).toBe('app.setting.units');
		expect(toSettingStorageKey('theme')).toBe('app.setting.theme');
	});
});

describe('APP_SETTINGS_DEFAULTS', () => {
	it('defaults units to imperial', () => {
		expect(APP_SETTINGS_DEFAULTS.units).toBe('imperial');
	});
});

describe('formatDistanceUnits (imperial)', () => {
	it('renders feet below a tenth of a mile', () => {
		// 50m ~ 164 ft
		expect(formatDistanceUnits(50, 'imperial')).toBe('164 ft');
	});

	it('renders 2-decimal miles between 0.1 and 10 mi', () => {
		// 1609.344m = exactly 1 mile
		expect(formatDistanceUnits(1609.344, 'imperial')).toBe('1.00 mi');
	});

	it('renders whole miles at or above 10 mi', () => {
		// 16093.44m = 10 miles
		expect(formatDistanceUnits(16093.44, 'imperial')).toBe('10 mi');
	});

	it('switches to feet exactly under the 0.1 mi threshold', () => {
		// 0.09 mi -> feet
		const meters = 0.09 * 1609.344;
		expect(formatDistanceUnits(meters, 'imperial')).toMatch(/ ft$/);
	});
});

describe('formatDistanceUnits (metric)', () => {
	it('renders meters below 1km', () => {
		expect(formatDistanceUnits(500, 'metric')).toBe('500 m');
	});

	it('renders 2-decimal km between 1 and 10 km', () => {
		expect(formatDistanceUnits(1500, 'metric')).toBe('1.50 km');
	});

	it('renders whole km at or above 10 km', () => {
		expect(formatDistanceUnits(10000, 'metric')).toBe('10 km');
	});

	it('rounds sub-kilometer meters', () => {
		expect(formatDistanceUnits(999.6, 'metric')).toBe('1000 m');
	});
});

describe('discoverAutoLoad setting', () => {
	beforeEach(() => {
		store.clear();
		// drop the module-level write-through cache so reads hit storage, not memory
		useSettings().cache.clear();
		vi.clearAllMocks();
	});

	it('defaults to true', () => {
		expect(APP_SETTINGS_DEFAULTS.discoverAutoLoad).toBe(true);
	});

	it('round-trips false through persistence as the JSON form the reader expects', async () => {
		const settings = useSettings();
		await settings.set(toSettingStorageKey('discoverAutoLoad'), false);

		// persisted to storage exactly as the getter's parser expects
		expect(prefsSet).toHaveBeenCalledWith({
			key: 'app.setting.discoverAutoLoad',
			value: 'false'
		});
		expect(store.get('app.setting.discoverAutoLoad')).toBe('false');

		// clear the cache so the read comes from storage, not the write-through map
		settings.cache.clear();
		const readBack = await settings.get<boolean>(toSettingStorageKey('discoverAutoLoad'));
		expect(readBack).toBe(false);
	});

	it('reads a stored true value back as a boolean', async () => {
		const settings = useSettings();
		store.set('app.setting.discoverAutoLoad', JSON.stringify(true));
		const readBack = await settings.get<boolean>(toSettingStorageKey('discoverAutoLoad'));
		expect(readBack).toBe(true);
	});
});
