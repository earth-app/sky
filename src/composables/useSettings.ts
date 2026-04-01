import { Preferences } from '@capacitor/preferences';

const cache = reactive(new Map<string, unknown>());

const SETTINGS_KEY_PREFIX = 'app.setting.';
const THEME_VALUES = ['system', 'light', 'dark'] as const;
const FONT_VALUES = [
	'system',
	'inter',
	'roboto',
	'times-new-roman',
	'open-sans',
	'noto-sans',
	'segoe-ui'
] as const;
type ThemeSetting = (typeof THEME_VALUES)[number];
type FontSetting = (typeof FONT_VALUES)[number];

export type AppSettings = {
	theme: ThemeSetting;
	scale: string;
	font: FontSetting;
	cardThumbnails: boolean;
	animations: boolean;
	pushNotifications: boolean;
	hapticFeedback: boolean;
	dataSaverMode: boolean;
	preloadContent: boolean;
	offlineMode: boolean;
};

export type AppSettingKey = keyof AppSettings;

export const APP_SETTINGS_DEFAULTS: AppSettings = {
	theme: 'system',
	scale: '1',
	font: 'system',
	cardThumbnails: true,
	animations: true,
	pushNotifications: true,
	hapticFeedback: true,
	dataSaverMode: false,
	preloadContent: true,
	offlineMode: false
};

function parseStoredValue(raw: string | null): unknown | null {
	if (raw === null) return null;

	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function coerceScale(value: unknown): AppSettings['scale'] {
	if (typeof value !== 'string') return APP_SETTINGS_DEFAULTS.scale;

	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed)) return APP_SETTINGS_DEFAULTS.scale;

	return String(Math.min(1.5, Math.max(0.6, parsed))) as AppSettings['scale'];
}

function coerceSetting<K extends AppSettingKey>(key: K, value: unknown): AppSettings[K] {
	const fallback = APP_SETTINGS_DEFAULTS[key];

	if (key === 'theme') {
		return (THEME_VALUES.includes(value as ThemeSetting) ? value : fallback) as AppSettings[K];
	}

	if (key === 'font') {
		return (FONT_VALUES.includes(value as FontSetting) ? value : fallback) as AppSettings[K];
	}

	if (key === 'scale') {
		return coerceScale(value) as AppSettings[K];
	}

	return (typeof value === 'boolean' ? value : fallback) as AppSettings[K];
}

function resolveTheme(theme: ThemeSetting): 'light' | 'dark' {
	if (theme === 'light' || theme === 'dark') return theme;

	if (import.meta.client && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}

	return 'light';
}

function fontFamilyFor(font: FontSetting) {
	switch (font) {
		case 'inter':
			return 'Inter, system-ui, sans-serif';
		case 'roboto':
			return 'Roboto, system-ui, sans-serif';
		case 'open-sans':
			return '"Open Sans", system-ui, sans-serif';
		case 'noto-sans':
			return '"Noto Sans", system-ui, sans-serif';
		case 'segoe-ui':
			return '"Segoe UI", system-ui, sans-serif';
		case 'times-new-roman':
			return '"Times New Roman", system-ui, sans-serif';
		default:
			return '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
	}
}

export function applyAppSettingsToDocument(settings: AppSettings) {
	if (!import.meta.client) return;

	const root = document.documentElement;
	const appliedTheme = resolveTheme(settings.theme);
	const appFontFamily = fontFamilyFor(settings.font);

	root.classList.remove('light', 'dark');
	root.classList.add(appliedTheme);
	root.classList.toggle('animations-disabled', !settings.animations);

	root.style.setProperty('--app-ui-scale', coerceScale(settings.scale));
	root.style.setProperty('--app-font-family', appFontFamily);
	root.style.setProperty('--ion-font-family', appFontFamily);

	// Keep Nuxt color-mode pre-hydration in sync on next launch.
	try {
		localStorage.setItem('nuxt-color-mode', settings.theme);
	} catch {
		// Ignore storage errors.
	}
}

export function toSettingStorageKey(key: AppSettingKey) {
	return `${SETTINGS_KEY_PREFIX}${key}`;
}

export function useSettings() {
	const get = async <T = unknown>(
		key: string,
		defaultValue: T | null = null
	): Promise<T | null> => {
		if (cache.has(key)) {
			return cache.get(key) as T;
		}

		const value = await Preferences.get({ key });
		if (value.value !== null) {
			const parsedValue = parseStoredValue(value.value);
			cache.set(key, parsedValue);
			return parsedValue as T;
		}

		return defaultValue;
	};

	const set = async (key: string, value: unknown) => {
		cache.set(key, value);
		await Preferences.set({ key, value: JSON.stringify(value) });
	};

	const remove = async (key: string) => {
		cache.delete(key);
		await Preferences.remove({ key });
	};

	const clear = async () => {
		cache.clear();
		await Preferences.clear();
	};

	return { cache, get, set, remove, clear };
}

export function useAppSettingsState() {
	return useState<AppSettings>('app-settings-state', () => ({ ...APP_SETTINGS_DEFAULTS }));
}

export function useAppSettings() {
	const settings = useAppSettingsState();
	const initialized = useState<boolean>('app-settings-initialized', () => false);
	const { get, set, remove } = useSettings();

	const init = async () => {
		if (initialized.value) {
			applyAppSettingsToDocument(settings.value);
			return settings.value;
		}

		const nextSettings = { ...APP_SETTINGS_DEFAULTS } as AppSettings;
		for (const key of Object.keys(APP_SETTINGS_DEFAULTS) as AppSettingKey[]) {
			const raw = await get<unknown>(toSettingStorageKey(key), APP_SETTINGS_DEFAULTS[key]);
			(nextSettings as Record<AppSettingKey, string | boolean>)[key] = coerceSetting(key, raw) as
				| string
				| boolean;
		}

		settings.value = nextSettings;
		initialized.value = true;
		applyAppSettingsToDocument(settings.value);

		return settings.value;
	};

	const setValue = async <K extends AppSettingKey>(key: K, value: AppSettings[K]) => {
		const nextValue = coerceSetting(key, value);
		settings.value = {
			...settings.value,
			[key]: nextValue
		};

		await set(toSettingStorageKey(key), nextValue);
		applyAppSettingsToDocument(settings.value);
	};

	const resetToDefaults = async () => {
		for (const key of Object.keys(APP_SETTINGS_DEFAULTS) as AppSettingKey[]) {
			await remove(toSettingStorageKey(key));
		}

		settings.value = { ...APP_SETTINGS_DEFAULTS };
		initialized.value = true;
		applyAppSettingsToDocument(settings.value);
	};

	return {
		settings,
		initialized,
		init,
		setValue,
		resetToDefaults
	};
}
