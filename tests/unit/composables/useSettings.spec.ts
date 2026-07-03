import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async () => ({ value: null })),
		set: vi.fn(async () => {}),
		remove: vi.fn(async () => {})
	}
}));

import {
	APP_SETTINGS_DEFAULTS,
	formatDistanceUnits,
	toSettingStorageKey
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
