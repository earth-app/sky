import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
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

export function isCameraCancelError(error: unknown): boolean {
	if (!error) return false;
	const code = (error as { code?: string }).code;
	const message = String((error as { message?: string }).message || error);
	return (
		code === 'OS-PLUG-CAMR-0006' ||
		code === 'OS-PLUG-CAMR-0020' ||
		/cancel|canceled|cancelled/i.test(message)
	);
}

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
			// routed through the sole geolocation plugin owner
			return await useMGeolocation().ensureLocationGranted();
		} catch (e) {
			console.error('Location permission check failed:', e);
			return false;
		}
	}

	async function ensureMicrophone(): Promise<boolean> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			stream.getTracks().forEach((t) => t.stop());
			return true;
		} catch (e) {
			console.error('Microphone permission request failed:', e);
			return false;
		}
	}

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

	async function ensureMotion(): Promise<boolean> {
		try {
			const current = await CapacitorPedometer.checkPermissions();
			let granted = anyGranted(current.activityRecognition);
			if (!granted) {
				// a refusal is final until Settings changes it; re-requesting only re-shows the
				// dialog at a user who already declined
				if (!shouldRequest(current.activityRecognition)) return false;
				const req = await CapacitorPedometer.requestPermissions();
				granted = anyGranted(req.activityRecognition);
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

	async function ensure(permission: QuestPermission): Promise<boolean> {
		return CHECKS[permission]();
	}

	async function prime(permission: QuestPermission): Promise<boolean> {
		return PRIMES[permission]();
	}

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

	// true once only Settings can turn motion back on, so the ui can keep the refusal on screen
	// with instructions instead of pretending the step is startable
	async function isMotionBlocked(): Promise<boolean> {
		try {
			const current = await CapacitorPedometer.checkPermissions();
			if (anyGranted(current.activityRecognition)) return false;
			return !shouldRequest(current.activityRecognition);
		} catch {
			return false;
		}
	}

	return {
		labels: PERMISSION_LABELS,
		ensure,
		prime,
		require,
		notifyDenied,
		isMotionBlocked
	};
}
