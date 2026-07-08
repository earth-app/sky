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
const UNIT_VALUES = ['imperial', 'metric'] as const;
type ThemeSetting = (typeof THEME_VALUES)[number];
type FontSetting = (typeof FONT_VALUES)[number];
type UnitSetting = (typeof UNIT_VALUES)[number];

export type AppSettings = {
	theme: ThemeSetting;
	scale: string;
	font: FontSetting;
	cardThumbnails: boolean;
	animations: boolean;
	pushNotifications: boolean;
	hapticFeedback: boolean;
	soundEffects: boolean;
	dataSaverMode: boolean;
	preloadContent: boolean;
	offlineMode: boolean;
	units: UnitSetting;
	discoverAutoLoad: boolean;
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
	soundEffects: false,
	dataSaverMode: false,
	preloadContent: true,
	offlineMode: false,
	units: 'imperial',
	discoverAutoLoad: true
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

	if (key === 'units') {
		return (UNIT_VALUES.includes(value as UnitSetting) ? value : fallback) as AppSettings[K];
	}

	return (typeof value === 'boolean' ? value : fallback) as AppSettings[K];
}

export const theme = computed<'light' | 'dark'>(() => useColorMode().value as 'light' | 'dark');

function resolveTheme(theme: ThemeSetting): 'light' | 'dark' {
	if (theme === 'light' || theme === 'dark') return theme;

	if (import.meta.client) {
		if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
			return 'dark';
		}

		if (localStorage.getItem('nuxt-color-mode') === 'dark') {
			return 'dark';
		}
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

	// Sync the native status bar; without this iOS shows a white-on-white status
	// bar in dark mode (or vice versa) until the next app launch.
	void syncStatusBarStyle(appliedTheme);
}

async function syncStatusBarStyle(appliedTheme: 'light' | 'dark') {
	const { Capacitor } = await import('@capacitor/core');
	if (!Capacitor.isNativePlatform()) return;
	try {
		const { StatusBar, Style } = await import('@capacitor/status-bar');
		await StatusBar.setStyle({
			style: appliedTheme === 'dark' ? Style.Dark : Style.Light
		});
	} catch {
		// status bar plugin may not be available on this build, ignore
	}
}

export function toSettingStorageKey(key: AppSettingKey) {
	return `${SETTINGS_KEY_PREFIX}${key}`;
}

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

// unit-aware distance formatter: metric -> m/km, imperial -> ft/mi
export function formatDistanceUnits(meters: number, units: UnitSetting): string {
	if (units === 'imperial') {
		const miles = meters / METERS_PER_MILE;
		if (miles >= 0.1) return `${miles.toFixed(miles >= 10 ? 0 : 2)} mi`;
		return `${Math.round(meters / METERS_PER_FOOT)} ft`;
	}
	if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 2)} km`;
	return `${Math.round(meters)} m`;
}

// reactive units + a formatter bound to the current setting
export function useUnits() {
	const settings = useAppSettingsState();
	const units = computed<UnitSetting>(() => settings.value.units);
	return {
		units,
		formatDistance: (meters: number) => formatDistanceUnits(meters, units.value)
	};
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
				string | boolean;
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

export function usePreferences() {
	const settings = reactive(new Map<string, string>());

	const get = async (key: string) => {
		if (settings.has(key)) {
			return settings.get(key) || '';
		}

		const value = await Preferences.get({ key }).then((result) => result.value || '');
		settings.set(key, value);
		return value;
	};

	const set = async (key: string, value: string) => {
		await Preferences.set({ key, value });
		settings.set(key, value);
	};

	const remove = async (key: string) => {
		await Preferences.remove({ key });
		settings.delete(key);
	};

	return {
		settings,
		get,
		set,
		remove
	};
}

const DEBOUNCE_MS = 600;
const PREF_PREFIX = 'mformdraft';

export interface UseMFormDraftOptions {
	kind: 'article' | 'prompt' | 'event';
	userId?: MaybeRefOrGetter<string | null | undefined>;
	scope?: string;
}

export function useMFormDraft<T extends object>(state: T, opts: UseMFormDraftOptions) {
	const prefKey = computed(() => {
		const uid = opts.userId !== undefined ? toValue(opts.userId) : null;
		const userSegment = uid ? `:user:${uid}` : '';
		const scopeSegment = opts.scope ? `:${opts.scope}` : '';
		return `${PREF_PREFIX}:${opts.kind}${userSegment}${scopeSegment}`;
	});

	const draft = useFormDraft(state, opts);

	if (import.meta.client) {
		onMounted(async () => {
			try {
				const lsKey = `earth-app:draft:${opts.kind}${
					opts.userId !== undefined && toValue(opts.userId) ? `:user:${toValue(opts.userId)}` : ''
				}${opts.scope ? `:${opts.scope}` : ''}`;
				if (window.localStorage.getItem(lsKey)) return;
				const { value } = await Preferences.get({ key: prefKey.value });
				if (value) window.localStorage.setItem(lsKey, value);
			} catch {
				// best-effort
			}
		});

		let debounce: ReturnType<typeof setTimeout> | null = null;
		const stop = watch(
			() => JSON.stringify(state),
			(serialized) => {
				if (debounce) clearTimeout(debounce);
				debounce = setTimeout(() => {
					void Preferences.set({ key: prefKey.value, value: serialized }).catch(() => {});
				}, DEBOUNCE_MS);
			}
		);

		onBeforeUnmount(() => {
			if (debounce) clearTimeout(debounce);
			stop();
		});
	}

	return {
		...draft,
		clear: async () => {
			draft.clear();
			try {
				await Preferences.remove({ key: prefKey.value });
			} catch {
				// best-effort
			}
		}
	};
}

// offline storage queue

const STORAGE_KEY = 'sky:offline-mutation-queue-v1';
const MAX_ATTEMPTS = 5;

export type MMutationKind =
	'mark-read' | 'mark-all-read' | 'dismiss-onboarding' | 'mark-notification-delete';

export interface QueuedMMutation {
	id: string;
	kind: MMutationKind;
	payload?: Record<string, unknown>;
	attempts: number;
	enqueuedAt: number;
}

type Dispatcher = (m: QueuedMMutation) => Promise<boolean>;

const dispatchers = new Map<MMutationKind, Dispatcher>();
export const pendingMMutations = ref<QueuedMMutation[]>([]);
let queueInitialized = false;
let replaying = false;

async function persistQueue() {
	try {
		await Preferences.set({
			key: STORAGE_KEY,
			value: JSON.stringify(pendingMMutations.value)
		});
	} catch {
		// best-effort; the in-memory queue still replays this session
	}
}

async function loadQueue(): Promise<QueuedMMutation[]> {
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (!value) return [];
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function enqueue(kind: MMutationKind, payload?: Record<string, unknown>) {
	const entry: QueuedMMutation = {
		id: `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
		kind,
		payload,
		attempts: 0,
		enqueuedAt: Date.now()
	};
	pendingMMutations.value = [...pendingMMutations.value, entry];
	void persistQueue();
}

function removeQueued(id: string) {
	pendingMMutations.value = pendingMMutations.value.filter((m) => m.id !== id);
	void persistQueue();
}

export function registerMMutationDispatcher(kind: MMutationKind, fn: Dispatcher) {
	dispatchers.set(kind, fn);
}

export async function replayPendingMMutations() {
	if (replaying) return;
	// caller (network watcher) gates on isOffline; we just guard double-entry
	if (pendingMMutations.value.length === 0) return;
	replaying = true;
	try {
		const snapshot = [...pendingMMutations.value];
		for (const entry of snapshot) {
			const dispatcher = dispatchers.get(entry.kind);
			if (!dispatcher) continue;
			try {
				const ok = await dispatcher(entry);
				if (ok) {
					removeQueued(entry.id);
				} else {
					entry.attempts += 1;
					if (entry.attempts >= MAX_ATTEMPTS) removeQueued(entry.id);
					else void persistQueue();
				}
			} catch {
				entry.attempts += 1;
				if (entry.attempts >= MAX_ATTEMPTS) removeQueued(entry.id);
				else void persistQueue();
			}
		}
	} finally {
		replaying = false;
	}
}

export async function runOrQueueM<T>(
	kind: MMutationKind,
	payload: Record<string, unknown> | undefined,
	executor: () => Promise<T>
): Promise<{ executed: boolean; queued: boolean; result?: T }> {
	if (isOffline.value) {
		enqueue(kind, payload);
		return { executed: false, queued: true };
	}
	try {
		const result = await executor();
		return { executed: true, queued: false, result };
	} catch (e: unknown) {
		const err = e as { message?: string; name?: string; code?: string; statusCode?: number };
		const msg = String(err?.message || err?.name || '').toLowerCase();
		const looksLikeNetwork =
			msg.includes('network') ||
			msg.includes('fetch') ||
			msg.includes('failed to fetch') ||
			err?.code === 'ECONNREFUSED' ||
			err?.statusCode === 0;
		if (looksLikeNetwork) {
			enqueue(kind, payload);
			return { executed: false, queued: true };
		}
		throw e;
	}
}

export async function initMOfflineQueue(): Promise<() => void> {
	if (queueInitialized) return () => {};
	queueInitialized = true;
	pendingMMutations.value = await loadQueue();

	const stop = watch(
		() => isOffline.value,
		(offline, wasOffline) => {
			if (wasOffline && !offline) void replayPendingMMutations();
		}
	);

	// also replay on init if we happen to be online with leftover items
	if (!isOffline.value) void replayPendingMMutations();

	return () => {
		stop();
		queueInitialized = false;
	};
}
