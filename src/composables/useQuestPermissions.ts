import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { Geolocation } from '@capacitor/geolocation';
import { Toast } from '@capacitor/toast';
import { CapacitorPedometer } from '@capgo/capacitor-pedometer';

export type QuestPermission = 'camera' | 'location' | 'record' | 'motion' | 'healthkit';

const PERMISSION_LABELS: Record<QuestPermission, string> = {
	camera: 'Camera',
	location: 'Location',
	record: 'Microphone',
	motion: 'Motion & Fitness',
	healthkit: 'Apple Health'
};

const PERMISSION_REASONS: Record<QuestPermission, string> = {
	camera: 'take photos for this quest step',
	location: 'verify your location for this quest step',
	record: 'record audio for this quest step',
	motion: 'measure the distance you cover for this quest step',
	healthkit: 'read your workout distance from Apple Health'
};

type DeviceMotionEventStatic = {
	requestPermission?: () => Promise<'granted' | 'denied' | 'prompt'>;
};

export function useQuestPermissions() {
	async function ensureCamera(): Promise<boolean> {
		try {
			const current = await Camera.checkPermissions();
			if (current.camera === 'granted') return true;
			const req = await Camera.requestPermissions({ permissions: ['camera'] });
			return req.camera === 'granted';
		} catch (e) {
			console.error('Camera permission check failed:', e);
			return false;
		}
	}

	async function ensureLocation(): Promise<boolean> {
		try {
			const current = await Geolocation.checkPermissions();
			if (current.location === 'granted' || current.coarseLocation === 'granted') return true;
			const req = await Geolocation.requestPermissions({ permissions: ['location'] });
			return req.location === 'granted' || req.coarseLocation === 'granted';
		} catch (e) {
			console.error('Location permission check failed:', e);
			return false;
		}
	}

	async function ensureMicrophone(): Promise<boolean> {
		// No Capacitor mic plugin; getUserMedia triggers the OS prompt through the
		// webview on native and the browser on web. Stop the stream immediately so we
		// do not hold the mic open.
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			stream.getTracks().forEach((t) => t.stop());
			return true;
		} catch (e) {
			console.error('Microphone permission request failed:', e);
			return false;
		}
	}

	// DeviceMotion (the webview accelerometer used by @capacitor/motion) requires an
	// explicit grant on iOS 13+, requested from a user gesture. Older iOS, Android,
	// and desktop expose it without a prompt, where requestPermission is absent.
	async function ensureDeviceMotion(): Promise<boolean> {
		const evt =
			typeof DeviceMotionEvent !== 'undefined'
				? (DeviceMotionEvent as unknown as DeviceMotionEventStatic)
				: undefined;
		if (!evt || typeof evt.requestPermission !== 'function') return true;
		try {
			return (await evt.requestPermission()) === 'granted';
		} catch (e) {
			console.error('DeviceMotion permission request failed:', e);
			return false;
		}
	}

	// Distance tracking needs both the native pedometer (CoreMotion on iOS /
	// ACTIVITY_RECOGNITION on Android) and the webview accelerometer.
	async function ensureMotion(): Promise<boolean> {
		try {
			const current = await CapacitorPedometer.checkPermissions();
			let granted = current.activityRecognition === 'granted';
			if (!granted) {
				const req = await CapacitorPedometer.requestPermissions();
				granted = req.activityRecognition === 'granted';
			}
			if (!granted) return false;
		} catch (e) {
			console.error('Pedometer permission check failed:', e);
			return false;
		}
		return ensureDeviceMotion();
	}

	// HealthKit is iOS-only. On other platforms we resolve `true` so the calling
	// flow doesn't gate on it; Android/web simply skips the HealthKit-backed
	// distance source and falls back to pedometer + runner GPS like before.
	async function ensureHealthKit(): Promise<boolean> {
		if (Capacitor.getPlatform() !== 'ios') return true;
		try {
			const { isAvailable, requestAuthorization } = useHealthKit();
			// plugin missing (UNIMPLEMENTED) or no health data -> don't block or prompt;
			// distance still accrues from the pedometer. only a real grant/deny gates here.
			if (!(await isAvailable())) return true;
			return await requestAuthorization();
		} catch (e) {
			console.error('HealthKit authorization request failed:', e);
			return true;
		}
	}

	const CHECKS: Record<QuestPermission, () => Promise<boolean>> = {
		camera: ensureCamera,
		location: ensureLocation,
		record: ensureMicrophone,
		motion: ensureMotion,
		healthkit: ensureHealthKit
	};

	// Same as ensureMotion but skips DeviceMotionEvent.requestPermission(), which
	// iOS 13+ refuses to fulfill outside of a user gesture. Used to pre-warm the
	// native CMPedometer prompt on step open; the webview accelerometer grant has
	// to wait for the actual Start Tracking tap.
	async function primeMotion(): Promise<boolean> {
		try {
			const current = await CapacitorPedometer.checkPermissions();
			if (current.activityRecognition === 'granted') return true;
			const req = await CapacitorPedometer.requestPermissions();
			return req.activityRecognition === 'granted';
		} catch (e) {
			console.error('Pedometer permission prime failed:', e);
			return false;
		}
	}

	const PRIMES: Record<QuestPermission, () => Promise<boolean>> = {
		camera: ensureCamera,
		location: ensureLocation,
		record: ensureMicrophone,
		motion: primeMotion,
		healthkit: ensureHealthKit
	};

	/** Check + request a single permission without surfacing any UI. */
	async function ensure(permission: QuestPermission): Promise<boolean> {
		return CHECKS[permission]();
	}

	/**
	 * Pre-warm the OS prompt for a permission when a step opens, so the user
	 * sees the dialog as soon as the step UI mounts instead of after they tap
	 * the action button. Motion specifically uses a variant that defers the
	 * iOS DeviceMotionEvent grant (which requires a user gesture) until the
	 * actual Start Tracking tap.
	 */
	async function prime(permission: QuestPermission): Promise<boolean> {
		return PRIMES[permission]();
	}

	/**
	 * Consistent denial UX: a blocking alert that makes clear the quest step cannot
	 * be completed without the permission and points the user to device settings.
	 */
	async function notifyDenied(permission: QuestPermission): Promise<void> {
		const label = PERMISSION_LABELS[permission];
		const message = `${label} access is required to ${PERMISSION_REASONS[permission]}. This quest step can't be completed until you allow it in your device settings.`;
		try {
			await Dialog.alert({ title: `${label} Access Needed`, message, buttonTitle: 'OK' });
		} catch {
			// Dialog plugin can be unavailable in some web environments; fall back to a toast.
			try {
				await Toast.show({ text: message, duration: 'long' });
			} catch {
				// swallow; best-effort notification
			}
		}
	}

	/**
	 * Check + request a permission; on denial, surface the denial dialog (unless
	 * suppressed) and return false so the caller can halt the flow.
	 */
	async function require(
		permission: QuestPermission,
		options: { notify?: boolean } = {}
	): Promise<boolean> {
		const granted = await ensure(permission);
		if (!granted && options.notify !== false) {
			await notifyDenied(permission);
		}
		return granted;
	}

	return {
		labels: PERMISSION_LABELS,
		ensure,
		prime,
		require,
		notifyDenied
	};
}
