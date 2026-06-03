import { Capacitor, registerPlugin } from '@capacitor/core';

// Local Capacitor plugin defined in ios/App/App/HealthKitDistancePlugin.swift.
// iOS only; on every other platform we register a stub that resolves to no-op
// values so callers can use it unconditionally.
interface HealthKitDistancePlugin {
	isAvailable(): Promise<{ available: boolean }>;
	requestAuthorization(): Promise<{ granted: boolean }>;
	getActivityDistance(options: {
		start: number;
		end: number;
	}): Promise<{ distance: number | null; source: string; workoutCount?: number }>;
}

const Native = registerPlugin<HealthKitDistancePlugin>('HealthKitDistance', {
	// Web/Android fallback: no health data available.
	web: () =>
		Promise.resolve({
			isAvailable: async () => ({ available: false }),
			requestAuthorization: async () => ({ granted: false }),
			getActivityDistance: async () => ({ distance: null, source: 'unavailable' })
		} as HealthKitDistancePlugin)
});

let authorizationPromise: Promise<boolean> | null = null;

export function useHealthKit() {
	const isSupported = Capacitor.getPlatform() === 'ios';

	async function isAvailable(): Promise<boolean> {
		if (!isSupported) return false;
		try {
			const { available } = await Native.isAvailable();
			return !!available;
		} catch (e) {
			console.error('[healthkit] isAvailable failed:', e);
			return false;
		}
	}

	// Cache the in-flight auth request so concurrent callers (e.g. the distance
	// step opening + a resume-time sync racing to ask) collapse into a single
	// system prompt instead of stacking up.
	async function requestAuthorization(): Promise<boolean> {
		if (!isSupported) return false;
		if (authorizationPromise) return authorizationPromise;
		authorizationPromise = (async () => {
			try {
				const { granted } = await Native.requestAuthorization();
				return !!granted;
			} catch (e) {
				console.error('[healthkit] requestAuthorization failed:', e);
				return false;
			} finally {
				// Allow re-prompt on next call after this one resolves; HealthKit
				// silently no-ops once the user has decided, so re-asking is cheap.
				setTimeout(() => {
					authorizationPromise = null;
				}, 0);
			}
		})();
		return authorizationPromise;
	}

	async function getActivityDistance(
		startMs: number,
		endMs: number
	): Promise<{ distance: number | null; source: string; workoutCount?: number } | null> {
		if (!isSupported) return null;
		try {
			return await Native.getActivityDistance({ start: startMs, end: endMs });
		} catch (e) {
			console.error('[healthkit] getActivityDistance failed:', e);
			return null;
		}
	}

	return {
		isSupported,
		isAvailable,
		requestAuthorization,
		getActivityDistance
	};
}
