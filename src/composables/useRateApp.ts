import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { Preferences } from '@capacitor/preferences';

const DAY_MS = 24 * 60 * 60 * 1000;

// engagement thresholds (apple guidance: only after real use, and rarely)
export const RATE_APP_MIN_SESSIONS = 3;
export const RATE_APP_COOLDOWN_DAYS = 60;

const STATE_KEY = 'sky:rate-app:state';

export interface RateAppState {
	sessionCount: number;
	meaningfulAction: boolean;
	lastPromptAt: number | null; // epoch ms of the last prompt shown
	dismissed: boolean; // user said No / No Thanks at least once
	reviewed: boolean; // user chose to review -> never ask again
}

export const RATE_APP_DEFAULT_STATE: RateAppState = {
	sessionCount: 0,
	meaningfulAction: false,
	lastPromptAt: null,
	dismissed: false,
	reviewed: false
};

// pure, deterministic decision: eligible when engaged AND (never prompted OR cooled-down after a
// dismissal) AND not already reviewed. no I/O and no clock - `now` is injected for testability
export function shouldPromptForReview(state: RateAppState, now: number): boolean {
	if (state.reviewed) return false;

	const engaged = state.meaningfulAction || state.sessionCount >= RATE_APP_MIN_SESSIONS;
	if (!engaged) return false;

	if (state.lastPromptAt == null) return true; // engaged + never asked

	// after a dismissal, wait out the cooldown before asking again
	if (!state.dismissed) return false;
	return now - state.lastPromptAt >= RATE_APP_COOLDOWN_DAYS * DAY_MS;
}

// tolerate malformed / partial persisted blobs so a bad write never wedges the prompt
function coerceState(raw: unknown): RateAppState {
	if (!raw || typeof raw !== 'object') return { ...RATE_APP_DEFAULT_STATE };
	const r = raw as Record<string, unknown>;
	return {
		sessionCount:
			typeof r.sessionCount === 'number' && Number.isFinite(r.sessionCount) && r.sessionCount >= 0
				? Math.floor(r.sessionCount)
				: 0,
		meaningfulAction: r.meaningfulAction === true,
		lastPromptAt:
			typeof r.lastPromptAt === 'number' && Number.isFinite(r.lastPromptAt) ? r.lastPromptAt : null,
		dismissed: r.dismissed === true,
		reviewed: r.reviewed === true
	};
}

export function useRateApp() {
	const runtimeConfig = useRuntimeConfig();

	async function loadState(): Promise<RateAppState> {
		try {
			const { value } = await Preferences.get({ key: STATE_KEY });
			if (!value) return { ...RATE_APP_DEFAULT_STATE };
			return coerceState(JSON.parse(value));
		} catch {
			return { ...RATE_APP_DEFAULT_STATE };
		}
	}

	async function saveState(state: RateAppState): Promise<void> {
		try {
			await Preferences.set({ key: STATE_KEY, value: JSON.stringify(state) });
		} catch {
			// best-effort; a lost write just means we re-evaluate next launch
		}
	}

	async function recordSession(): Promise<void> {
		const state = await loadState();
		await saveState({ ...state, sessionCount: state.sessionCount + 1 });
	}

	async function recordMeaningfulAction(): Promise<void> {
		const state = await loadState();
		if (state.meaningfulAction) return;
		await saveState({ ...state, meaningfulAction: true });
	}

	function openReviewUrl(url: string): void {
		if (!url || !import.meta.client) return;
		if (Capacitor.isNativePlatform()) {
			// a top-level nav to an off-origin url: capacitor's WKNavigationDelegate cancels the
			// in-app load and hands it to UIApplication.open -> the external App Store app. this is
			// reliable where window.open is not, since the native dialog already consumed the gesture
			window.location.href = url;
		} else {
			window.open(url, '_blank');
		}
	}

	async function maybePromptForReview(): Promise<void> {
		// only on native store builds; never in test builds (would fire native dialogs in e2e)
		if (!Capacitor.isNativePlatform()) return;
		if (runtimeConfig.public.testBuild) return;

		const state = await loadState();
		const now = Date.now();
		if (!shouldPromptForReview(state, now)) return;

		const first = await Dialog.confirm({
			title: 'Enjoying The Earth App?',
			message: "We'd love to know what you think.",
			okButtonTitle: 'Yes',
			cancelButtonTitle: 'No'
		});

		if (!first.value) {
			// No -> record dismissal + anchor the cooldown, then drop
			await saveState({ ...state, lastPromptAt: now, dismissed: true });
			return;
		}

		const second = await Dialog.confirm({
			title: 'Leave a Review',
			message: 'Would you mind leaving a review?',
			okButtonTitle: 'Review',
			cancelButtonTitle: 'No Thanks'
		});

		if (second.value) {
			openReviewUrl(String(runtimeConfig.public.appStoreReviewUrl || ''));
			// reviewed -> never prompt again
			await saveState({ ...state, lastPromptAt: now, reviewed: true });
		} else {
			await saveState({ ...state, lastPromptAt: now, dismissed: true });
		}
	}

	return {
		loadState,
		saveState,
		recordSession,
		recordMeaningfulAction,
		maybePromptForReview,
		openReviewUrl
	};
}
