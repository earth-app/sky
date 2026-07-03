import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prefsGet } = vi.hoisted(() => ({
	prefsGet: vi.fn(async (_: { key: string }) => ({ value: null as string | null }))
}));
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: prefsGet,
		set: vi.fn(async () => {}),
		remove: vi.fn(async () => {})
	}
}));

import {
	isOfflineModePreferred,
	networkOffline,
	offlineModeEnabled
} from '~/composables/useNetwork';

// keep navigator.onLine true unless a test flips it (jsdom/happy-dom defaults vary)
function setOnline(value: boolean) {
	Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('isOfflineModePreferred', () => {
	beforeEach(() => {
		offlineModeEnabled.value = false;
		networkOffline.value = false;
		setOnline(true);
		prefsGet.mockResolvedValue({ value: null });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('is false online with offline mode off and no stored preference', async () => {
		await expect(isOfflineModePreferred()).resolves.toBe(false);
	});

	it('short-circuits true when the reactive offline-mode flag is set', async () => {
		offlineModeEnabled.value = true;
		await expect(isOfflineModePreferred()).resolves.toBe(true);
		// short-circuit means we never touched Preferences
		expect(prefsGet).not.toHaveBeenCalled();
	});

	it('short-circuits true when the network is flagged offline', async () => {
		networkOffline.value = true;
		await expect(isOfflineModePreferred()).resolves.toBe(true);
		expect(prefsGet).not.toHaveBeenCalled();
	});

	it('trusts navigator.onLine=false before network status is applied', async () => {
		setOnline(false);
		await expect(isOfflineModePreferred()).resolves.toBe(true);
		expect(prefsGet).not.toHaveBeenCalled();
	});

	it('reads the offline-mode preference when nothing else forces offline', async () => {
		prefsGet.mockResolvedValue({ value: 'true' });
		await expect(isOfflineModePreferred()).resolves.toBe(true);
		expect(prefsGet).toHaveBeenCalledWith({ key: 'app.setting.offlineMode' });
	});

	it('accepts the JSON-stringified true form the setter writes', async () => {
		prefsGet.mockResolvedValue({ value: JSON.stringify(true) });
		await expect(isOfflineModePreferred()).resolves.toBe(true);
	});

	it('is false when the stored preference is anything but true', async () => {
		prefsGet.mockResolvedValue({ value: 'false' });
		await expect(isOfflineModePreferred()).resolves.toBe(false);
	});

	it('swallows a Preferences failure and defaults to online', async () => {
		prefsGet.mockRejectedValue(new Error('prefs unavailable'));
		await expect(isOfflineModePreferred()).resolves.toBe(false);
	});
});
