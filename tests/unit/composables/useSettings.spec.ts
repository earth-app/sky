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
	applyAppSettingsToDocument,
	formatDistanceUnits,
	toSettingStorageKey,
	useAppSettings,
	useSettings,
	type AppSettings
} from '~/composables/useSettings';
import { resetVisualTierState, useVisualTier } from '~/composables/useVisualTier';

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

describe('visualEffects setting', () => {
	function glassClasses(): string[] {
		return ['glass-full', 'glass-reduced', 'glass-off'].filter((c) =>
			document.documentElement.classList.contains(c)
		);
	}

	function settingsWith(
		visualEffects: AppSettings['visualEffects'],
		extra: Partial<AppSettings> = {}
	) {
		return { ...APP_SETTINGS_DEFAULTS, visualEffects, ...extra };
	}

	beforeEach(() => {
		store.clear();
		useSettings().cache.clear();
		resetVisualTierState();
		document.documentElement.classList.remove('glass-full', 'glass-reduced', 'glass-off');
		// force init() to re-read storage instead of short-circuiting on a previous test's state
		useAppSettings().initialized.value = false;
		vi.clearAllMocks();
	});

	it('defaults to auto', () => {
		expect(APP_SETTINGS_DEFAULTS.visualEffects).toBe('auto');
	});

	it('round-trips an explicit tier through persistence', async () => {
		const settings = useSettings();
		await settings.set(toSettingStorageKey('visualEffects'), 'reduced');

		expect(prefsSet).toHaveBeenCalledWith({
			key: 'app.setting.visualEffects',
			value: '"reduced"'
		});

		settings.cache.clear();
		const readBack = await settings.get<string>(toSettingStorageKey('visualEffects'));
		expect(readBack).toBe('reduced');
	});

	it('writes the resolved tier as a single glass class on <html>', () => {
		applyAppSettingsToDocument(settingsWith('full'));
		expect(glassClasses()).toEqual(['glass-full']);

		applyAppSettingsToDocument(settingsWith('off'));
		expect(glassClasses()).toEqual(['glass-off']);

		applyAppSettingsToDocument(settingsWith('reduced'));
		expect(glassClasses()).toEqual(['glass-reduced']);
	});

	it('falls back to the measured default while auto has nothing measured yet', () => {
		applyAppSettingsToDocument(settingsWith('auto'));
		expect(glassClasses()).toEqual(['glass-reduced']);
	});

	it('uses the measured tier for auto', () => {
		useVisualTier().measuredTier.value = 'full';
		applyAppSettingsToDocument(settingsWith('auto'));
		expect(glassClasses()).toEqual(['glass-full']);
	});

	it('caps an explicit full at reduced under data saver mode', () => {
		applyAppSettingsToDocument(settingsWith('full', { dataSaverMode: true }));
		expect(glassClasses()).toEqual(['glass-reduced']);
	});

	it('keeps the animations toggle independent of the glass tier', () => {
		applyAppSettingsToDocument(settingsWith('full', { animations: false }));
		expect(glassClasses()).toEqual(['glass-full']);
		expect(document.documentElement.classList.contains('animations-disabled')).toBe(true);
		expect(useVisualTier().policy.value.ambient).toBe(false);
	});

	it('falls back to the default when the stored value is invalid', async () => {
		store.set('app.setting.visualEffects', JSON.stringify('sparkles'));
		const { init, settings } = useAppSettings();
		await init();

		expect(settings.value.visualEffects).toBe('auto');
		expect(glassClasses()).toEqual(['glass-reduced']);
	});

	it('coerces an invalid write back to the default', async () => {
		const { setValue, settings } = useAppSettings();
		await setValue('visualEffects', 'sparkles' as AppSettings['visualEffects']);

		expect(settings.value.visualEffects).toBe('auto');
		expect(store.get('app.setting.visualEffects')).toBe('"auto"');
	});
});

describe('ambientScenes + translucency settings', () => {
	function glassClasses(): string[] {
		return ['glass-full', 'glass-reduced', 'glass-off'].filter((c) =>
			document.documentElement.classList.contains(c)
		);
	}

	function hasClass(name: string): boolean {
		return document.documentElement.classList.contains(name);
	}

	function settingsWith(extra: Partial<AppSettings> = {}): AppSettings {
		return { ...APP_SETTINGS_DEFAULTS, ...extra };
	}

	beforeEach(() => {
		store.clear();
		useSettings().cache.clear();
		resetVisualTierState();
		document.documentElement.classList.remove(
			'glass-full',
			'glass-reduced',
			'glass-off',
			'ambient-disabled',
			'glass-disabled'
		);
		useAppSettings().initialized.value = false;
		vi.clearAllMocks();
	});

	it('both default to true, so a fresh install gets the full visual treatment', () => {
		expect(APP_SETTINGS_DEFAULTS.ambientScenes).toBe(true);
		expect(APP_SETTINGS_DEFAULTS.translucency).toBe(true);
	});

	// the emulator's software renderer loses gralloc handles under the 30fps canvas and
	// backdrop-filter, stops painting, and every maestro flow that reaches the dashboard times out
	it('forces both off in a native test build without touching the stored preference', () => {
		const settings = settingsWith({ ambientScenes: true, translucency: true });
		const cfg = useRuntimeConfig();
		const previous = cfg.public.nativeTest;
		cfg.public.nativeTest = true;
		try {
			applyAppSettingsToDocument(settings);
			expect(hasClass('ambient-disabled')).toBe(true);
			expect(hasClass('glass-disabled')).toBe(true);
			// the user's own choice is untouched, so the settings screen still reflects it
			expect(settings.ambientScenes).toBe(true);
			expect(settings.translucency).toBe(true);
		} finally {
			cfg.public.nativeTest = previous;
		}
	});

	it('leaves both on outside a native test build', () => {
		applyAppSettingsToDocument(settingsWith({ ambientScenes: true, translucency: true }));
		expect(hasClass('ambient-disabled')).toBe(false);
		expect(hasClass('glass-disabled')).toBe(false);
	});

	it('round-trips false through persistence as the JSON form the reader expects', async () => {
		const settings = useSettings();
		await settings.set(toSettingStorageKey('ambientScenes'), false);
		await settings.set(toSettingStorageKey('translucency'), false);

		expect(store.get('app.setting.ambientScenes')).toBe('false');
		expect(store.get('app.setting.translucency')).toBe('false');

		settings.cache.clear();
		expect(await settings.get<boolean>(toSettingStorageKey('ambientScenes'))).toBe(false);
		expect(await settings.get<boolean>(toSettingStorageKey('translucency'))).toBe(false);
	});

	it('writes no disabling class while both are on', () => {
		applyAppSettingsToDocument(settingsWith());

		expect(hasClass('ambient-disabled')).toBe(false);
		expect(hasClass('glass-disabled')).toBe(false);
	});

	it('writes ambient-disabled on <html> and takes the scene out of the shared policy', () => {
		applyAppSettingsToDocument(settingsWith({ ambientScenes: false, visualEffects: 'full' }));

		expect(hasClass('ambient-disabled')).toBe(true);
		expect(useVisualTier().policy.value.scenes).toBe(false);
		// the tier is untouched, so translucency is unaffected by the scene switch
		expect(glassClasses()).toEqual(['glass-full']);
	});

	it('writes glass-disabled on <html> and forces the glass-off branch at any tier', () => {
		applyAppSettingsToDocument(settingsWith({ translucency: false, visualEffects: 'full' }));

		expect(hasClass('glass-disabled')).toBe(true);
		expect(glassClasses()).toEqual(['glass-off']);
		// motion is a separate switch; killing glass must not kill the scene
		expect(useVisualTier().policy.value.scenes).toBe(true);
	});

	it('clears both classes again when the settings come back on', () => {
		applyAppSettingsToDocument(
			settingsWith({ ambientScenes: false, translucency: false, visualEffects: 'full' })
		);
		expect(hasClass('ambient-disabled')).toBe(true);
		expect(hasClass('glass-disabled')).toBe(true);

		applyAppSettingsToDocument(settingsWith({ visualEffects: 'full' }));
		expect(hasClass('ambient-disabled')).toBe(false);
		expect(hasClass('glass-disabled')).toBe(false);
		expect(glassClasses()).toEqual(['glass-full']);
	});

	it('falls back to the default when the stored value is invalid', async () => {
		store.set('app.setting.ambientScenes', JSON.stringify('nope'));
		store.set('app.setting.translucency', JSON.stringify(3));
		const { init, settings } = useAppSettings();
		await init();

		expect(settings.value.ambientScenes).toBe(true);
		expect(settings.value.translucency).toBe(true);
		expect(hasClass('ambient-disabled')).toBe(false);
		expect(hasClass('glass-disabled')).toBe(false);
	});

	it('coerces an invalid write back to the default', async () => {
		const { setValue, settings } = useAppSettings();
		await setValue('ambientScenes', 'yes' as unknown as boolean);

		expect(settings.value.ambientScenes).toBe(true);
		expect(store.get('app.setting.ambientScenes')).toBe('true');
	});

	it('reads a stored false back through init and applies it', async () => {
		store.set('app.setting.ambientScenes', JSON.stringify(false));
		store.set('app.setting.translucency', JSON.stringify(false));
		const { init, settings } = useAppSettings();
		await init();

		expect(settings.value.ambientScenes).toBe(false);
		expect(settings.value.translucency).toBe(false);
		expect(hasClass('ambient-disabled')).toBe(true);
		expect(hasClass('glass-disabled')).toBe(true);
		expect(glassClasses()).toEqual(['glass-off']);
	});
});
