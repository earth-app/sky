import { Capacitor } from '@capacitor/core';
import { Geolocation, type PositionOptions } from '@capacitor/geolocation';

// device location for trailmarks (leave/find notes at where you actually are);
// the crust useQuestGeolocation no-ops on native, so mobile uses the capacitor plugin
export function useMGeolocation() {
	const lat = ref<number | null>(null);
	const lng = ref<number | null>(null);
	const accuracy = ref<number | null>(null);
	const error = ref<string | null>(null);
	const locating = ref(false);

	const ready = computed(() => lat.value !== null && lng.value !== null);

	// sole wrappers over the plugin; every other sky caller routes through these
	function checkPermissions() {
		return Geolocation.checkPermissions();
	}

	function requestPermissions() {
		return Geolocation.requestPermissions({ permissions: ['location'] });
	}

	function getCurrentPosition(options?: PositionOptions) {
		return Geolocation.getCurrentPosition(options);
	}

	// check then request; true when fine or coarse location is granted
	async function ensureLocationGranted(): Promise<boolean> {
		const current = await checkPermissions();
		if (current.location === 'granted' || current.coarseLocation === 'granted') return true;
		const req = await requestPermissions();
		return req.location === 'granted' || req.coarseLocation === 'granted';
	}

	async function ensurePermission(): Promise<boolean> {
		try {
			// web + native both go through the plugin; web resolves via the permissions api
			return await ensureLocationGranted();
		} catch {
			// some web contexts throw on checkPermissions; let getCurrentPosition prompt instead
			return !Capacitor.isNativePlatform();
		}
	}

	async function fetchLocation(): Promise<boolean> {
		error.value = null;
		locating.value = true;
		try {
			const granted = await ensurePermission();
			if (!granted) {
				error.value = 'Location access is needed to find notes near you.';
				return false;
			}
			const pos = await getCurrentPosition({
				enableHighAccuracy: true,
				timeout: 12_000,
				maximumAge: 30_000
			});
			lat.value = pos.coords.latitude;
			lng.value = pos.coords.longitude;
			accuracy.value = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null;
			return true;
		} catch (e) {
			console.warn('[geolocation] getCurrentPosition failed:', e);
			error.value = 'We could not detect your location. Check that location services are on.';
			return false;
		} finally {
			locating.value = false;
		}
	}

	return {
		lat,
		lng,
		accuracy,
		error,
		locating,
		ready,
		fetchLocation,
		checkPermissions,
		requestPermissions,
		getCurrentPosition,
		ensureLocationGranted
	};
}
