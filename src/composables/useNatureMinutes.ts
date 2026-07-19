import { Preferences } from '@capacitor/preferences';
import type { NatureMinutes, TrailResult } from 'types/trails';

// deterministic walking pace; ~80 m/min (4.8 km/h) turns healthkit distance into outdoor minutes
export const NATURE_MINUTES_PACE_M_PER_MIN = 80;
// sane single-sync ceiling so a bad healthkit spike can't dump hundreds of minutes at once
export const NATURE_MINUTES_SYNC_CAP = 180;
const LAST_CREDITED_KEY = 'sky:nature-minutes-last-credited-at';

// pure: meters -> whole outdoor minutes (belongs in code, not latent space)
export function metersToNatureMinutes(meters: number): number {
	if (!Number.isFinite(meters) || meters <= 0) return 0;
	return Math.round(meters / NATURE_MINUTES_PACE_M_PER_MIN);
}

function startOfToday(): number {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

// deps are injectable so this is testable without mocking nuxt auto-imports; defaults wire the
// real inherited crust composables (which now hit mantle2 directly, web + native)
export function useNatureMinutes(trails = useTrails(), healthKit = useHealthKit()) {
	const { natureMinutes, fetchNatureMinutes, creditNatureMinutes } = trails;
	const { isSupported, isAvailable, requestAuthorization, getActivityDistance } = healthKit;
	const syncing = ref(false);

	async function getLastCreditedAt(): Promise<number> {
		try {
			const { value } = await Preferences.get({ key: LAST_CREDITED_KEY });
			const n = value ? Number(value) : NaN;
			return Number.isFinite(n) ? n : startOfToday();
		} catch {
			return startOfToday();
		}
	}

	async function setLastCreditedAt(t: number): Promise<void> {
		try {
			await Preferences.set({ key: LAST_CREDITED_KEY, value: String(t) });
		} catch {
			// best-effort; a missed write just re-credits the same window next time (capped + deduped server-side)
		}
	}

	// read new healthkit distance since the last credit, convert to minutes, credit only the delta
	async function syncFromHealthKit(): Promise<TrailResult<NatureMinutes>> {
		if (syncing.value) return { success: false, error: 'A sync is already in progress.' };
		if (!isSupported) return { success: false, error: 'Apple Health is only available on iOS.' };

		syncing.value = true;
		try {
			const available = await isAvailable();
			if (!available) {
				const granted = await requestAuthorization();
				if (!granted) return { success: false, error: 'Apple Health access was not granted.' };
			}

			const since = await getLastCreditedAt();
			const now = Date.now();
			if (now <= since) return { success: false, error: 'No new outdoor time to credit yet.' };

			const res = await getActivityDistance(since, now);
			const meters = res?.distance ?? 0;
			const minutes = Math.min(NATURE_MINUTES_SYNC_CAP, metersToNatureMinutes(meters));
			if (minutes <= 0) {
				// nothing to credit, but advance the window so we don't re-scan it
				await setLastCreditedAt(now);
				return { success: false, error: 'No new outdoor distance to credit yet.' };
			}

			const credit = await creditNatureMinutes({
				kind: 'healthkit',
				minutes,
				at: new Date().toISOString()
			});
			if (credit.success) await setLastCreditedAt(now);
			return credit;
		} finally {
			syncing.value = false;
		}
	}

	return {
		natureMinutes,
		syncing,
		healthKitSupported: isSupported,
		fetchNatureMinutes,
		creditNatureMinutes,
		syncFromHealthKit
	};
}
