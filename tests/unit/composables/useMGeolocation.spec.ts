import { beforeEach, describe, expect, it, vi } from 'vitest';

const geo = vi.hoisted(() => ({
	checkPermissions: vi.fn(),
	requestPermissions: vi.fn(),
	getCurrentPosition: vi.fn(),
	isNative: vi.fn(() => true)
}));

vi.mock('@capacitor/geolocation', () => ({
	Geolocation: {
		checkPermissions: geo.checkPermissions,
		requestPermissions: geo.requestPermissions,
		getCurrentPosition: geo.getCurrentPosition
	}
}));
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: geo.isNative }
}));

import { useMGeolocation } from '~/composables/useMGeolocation';

beforeEach(() => {
	vi.clearAllMocks();
	geo.isNative.mockReturnValue(true);
	geo.checkPermissions.mockResolvedValue({ location: 'granted' });
	geo.getCurrentPosition.mockResolvedValue({
		coords: { latitude: 41.8, longitude: -87.6, accuracy: 5 }
	});
});

describe('useMGeolocation', () => {
	it('populates coordinates and marks ready on success', async () => {
		const g = useMGeolocation();
		const ok = await g.fetchLocation();
		expect(ok).toBe(true);
		expect(g.lat.value).toBeCloseTo(41.8);
		expect(g.lng.value).toBeCloseTo(-87.6);
		expect(g.ready.value).toBe(true);
		expect(g.error.value).toBeNull();
	});

	it('accepts coarse-location grants', async () => {
		geo.checkPermissions.mockResolvedValue({ coarseLocation: 'granted' });
		expect(await useMGeolocation().fetchLocation()).toBe(true);
	});

	it('requests permission when not granted and fails (denied) without reading a fix', async () => {
		geo.checkPermissions.mockResolvedValue({ location: 'denied' });
		geo.requestPermissions.mockResolvedValue({ location: 'denied' });
		const g = useMGeolocation();
		const ok = await g.fetchLocation();
		expect(ok).toBe(false);
		expect(g.ready.value).toBe(false);
		expect(g.error.value).toBeTruthy();
		expect(geo.getCurrentPosition).not.toHaveBeenCalled();
	});

	it('sets an error when the position lookup throws', async () => {
		geo.getCurrentPosition.mockRejectedValue(new Error('no fix'));
		const g = useMGeolocation();
		const ok = await g.fetchLocation();
		expect(ok).toBe(false);
		expect(g.ready.value).toBe(false);
		expect(g.error.value).toBeTruthy();
	});

	describe('centralized primitives', () => {
		it('checkPermissions + requestPermissions delegate to the plugin', async () => {
			geo.checkPermissions.mockResolvedValue({ location: 'prompt' });
			geo.requestPermissions.mockResolvedValue({ location: 'granted' });
			const g = useMGeolocation();

			await expect(g.checkPermissions()).resolves.toEqual({ location: 'prompt' });
			await expect(g.requestPermissions()).resolves.toEqual({ location: 'granted' });
			expect(geo.requestPermissions).toHaveBeenCalledWith({ permissions: ['location'] });
		});

		it('getCurrentPosition forwards options and returns the plugin position', async () => {
			const opts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 };
			const pos = await useMGeolocation().getCurrentPosition(opts);
			expect(geo.getCurrentPosition).toHaveBeenCalledWith(opts);
			expect(pos.coords.latitude).toBeCloseTo(41.8);
		});

		it('ensureLocationGranted returns true on an existing grant without requesting', async () => {
			const ok = await useMGeolocation().ensureLocationGranted();
			expect(ok).toBe(true);
			expect(geo.requestPermissions).not.toHaveBeenCalled();
		});

		it('ensureLocationGranted accepts a coarse grant', async () => {
			geo.checkPermissions.mockResolvedValue({ coarseLocation: 'granted' });
			expect(await useMGeolocation().ensureLocationGranted()).toBe(true);
			expect(geo.requestPermissions).not.toHaveBeenCalled();
		});

		it('ensureLocationGranted requests when not granted and honors the result', async () => {
			geo.checkPermissions.mockResolvedValue({ location: 'prompt' });
			geo.requestPermissions.mockResolvedValue({ location: 'granted' });
			expect(await useMGeolocation().ensureLocationGranted()).toBe(true);
			expect(geo.requestPermissions).toHaveBeenCalledOnce();
		});

		it('ensureLocationGranted returns false when the request is denied', async () => {
			geo.checkPermissions.mockResolvedValue({ location: 'denied' });
			geo.requestPermissions.mockResolvedValue({ location: 'denied' });
			expect(await useMGeolocation().ensureLocationGranted()).toBe(false);
		});

		it('ensureLocationGranted rejects (unwrapped) so callers own the catch', async () => {
			geo.checkPermissions.mockRejectedValue(new Error('permissions api unavailable'));
			await expect(useMGeolocation().ensureLocationGranted()).rejects.toThrow(
				'permissions api unavailable'
			);
		});
	});
});
