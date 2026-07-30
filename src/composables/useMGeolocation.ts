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

	// check then request; true when fine or coarse location is granted.
	// a refusal is NOT re-requested: both platforms re-show the dialog, so the user got asked again
	// the moment anything touched location. callers surface the recovery ui instead
	async function ensureLocationGranted(): Promise<boolean> {
		const current = await checkPermissions();
		if (anyGranted(current.location, current.coarseLocation)) return true;
		if (!shouldRequest(current.location, current.coarseLocation)) return false;
		const req = await requestPermissions();
		return anyGranted(req.location, req.coarseLocation);
	}

	// true once only Settings can turn location back on, so the ui can say so instead of
	// offering a retry that would do nothing
	async function isLocationBlocked(): Promise<boolean> {
		try {
			const current = await checkPermissions();
			if (anyGranted(current.location, current.coarseLocation)) return false;
			return !shouldRequest(current.location, current.coarseLocation);
		} catch {
			return false;
		}
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
		ensureLocationGranted,
		isLocationBlocked
	};
}
