import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prefStore: Record<string, string> = {};
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: prefStore[key] ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			prefStore[key] = value;
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			delete prefStore[key];
		})
	}
}));

const toasts: string[] = [];
vi.mock('@capacitor/toast', () => ({
	Toast: {
		show: vi.fn(async ({ text }: { text: string }) => {
			toasts.push(text);
		})
	}
}));

vi.mock('@capacitor/haptics', () => ({
	Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
	ImpactStyle: { Light: 'LIGHT' },
	NotificationType: { Success: 'SUCCESS' }
}));

vi.mock('@capacitor/local-notifications', () => ({
	LocalNotifications: {
		checkPermissions: vi.fn(async () => ({ display: 'granted' })),
		requestPermissions: vi.fn(async () => ({ display: 'granted' })),
		schedule: vi.fn(async () => {}),
		cancel: vi.fn(async () => {})
	}
}));

// capture the pedometer `measurement` listener so the test can push events
let pedListener: ((m: any) => void) | null = null;
vi.mock('@capgo/capacitor-pedometer', () => ({
	CapacitorPedometer: {
		addListener: vi.fn(async (_event: string, cb: (m: any) => void) => {
			pedListener = cb;
			return { remove: async () => {} };
		}),
		startMeasurementUpdates: vi.fn(async () => {}),
		stopMeasurementUpdates: vi.fn(async () => {}),
		getMeasurement: vi.fn(async () => ({ distance: 0, numberOfSteps: 0 }))
	}
}));

vi.mock('@capacitor/motion', () => ({
	Motion: { addListener: vi.fn(async () => ({ remove: async () => {} })) }
}));

vi.mock('@capacitor/app', () => ({
	App: { addListener: vi.fn(async () => ({ remove: async () => {} })) }
}));

// native bridge: pretend we're on iOS so the wrapper branches run. registerPlugin
// returns a stub that reports the HealthKit / LiveActivity plugins missing
// (UNIMPLEMENTED-equivalent: distance comes purely from the pedometer here).
vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: () => true,
		getPlatform: () => 'ios'
	},
	registerPlugin: () => ({
		isAvailable: async () => ({ available: false }),
		requestAuthorization: async () => ({ granted: false }),
		getActivityDistance: async () => ({ distance: null, source: 'unavailable' }),
		startObserving: async () => ({ started: false }),
		stopObserving: async () => {},
		isSupported: async () => ({ supported: false }),
		start: async () => ({ activityId: '' }),
		update: async () => {},
		end: async () => {},
		addListener: async () => ({ remove: async () => {} })
	})
}));

// quest permissions: grant everything so start() proceeds to attachListeners
vi.mock('~/composables/useQuestPermissions', () => ({
	useQuestPermissions: () => ({ require: async () => true })
}));

import { distanceStorageKey, useDistanceTracker, useHealthKit } from '~/composables/useHealthKit';

const STEP = {
	questId: 'q-dist',
	stepIndex: 0,
	altIndex: 0,
	targetMeters: 100,
	title: 'Walk 100m'
};

// the engine's anti-spoof clamp limits accrual to MAX_SPEED_MPS * elapsed, and
// elapsed comes from Date.now(). drive a controllable clock so a synthetic
// pedometer delta isn't clamped to ~0 by the sub-millisecond real elapsed.
let clock = 1_700_000_000_000;
const realNow = Date.now.bind(Date);
function advance(ms: number) {
	clock += ms;
}

beforeEach(() => {
	for (const k of Object.keys(prefStore)) delete prefStore[k];
	toasts.length = 0;
	pedListener = null;
	clock = 1_700_000_000_000;
	vi.spyOn(Date, 'now').mockImplementation(() => clock);
});

afterEach(() => {
	vi.restoreAllMocks();
	void realNow;
});

describe('distanceStorageKey', () => {
	it('builds a stable per-step key including the alt index', () => {
		expect(distanceStorageKey({ questId: 'q', stepIndex: 2, altIndex: 1 })).toBe(
			'quest_distance:q:2:1'
		);
	});

	it('defaults a missing alt index to 0', () => {
		expect(distanceStorageKey({ questId: 'q', stepIndex: 0 })).toBe('quest_distance:q:0:0');
	});
});

describe('useHealthKit wrapper guards', () => {
	it('reports iOS support and resolves the (unavailable) plugin gracefully', async () => {
		const hk = useHealthKit();
		expect(hk.isSupported).toBe(true);
		// plugin stub reports unavailable -> false, no throw
		await expect(hk.isAvailable()).resolves.toBe(false);
		await expect(hk.requestAuthorization()).resolves.toBe(false);
	});
});

describe('useDistanceTracker gating (Bug 3)', () => {
	it('accrues distance from pedometer events and flips goalReached + auto-pauses at target', async () => {
		const tracker = useDistanceTracker(() => STEP);
		expect(tracker.goalReached.value).toBe(false);

		await tracker.start();
		expect(tracker.isActive.value).toBe(true);
		expect(tracker.tracking.value).toBe(true);
		expect(pedListener).toBeTypeOf('function');

		// the pedometer reports CUMULATIVE distance; the first sample only
		// establishes the baseline (no accrual). advance the clock between
		// samples so the speed clamp (MAX_SPEED_MPS * elapsed) admits the delta.
		advance(1000);
		pedListener!({ distance: 0 }); // baseline
		expect(tracker.progress.value).toBe(0);

		advance(100_000); // 100s -> clamp allows up to ~894m
		pedListener!({ distance: 60 }); // delta 60m
		expect(tracker.progress.value).toBeGreaterThan(0);
		expect(tracker.goalReached.value).toBe(false);

		advance(100_000);
		pedListener!({ distance: 120 }); // delta 60m -> total clamps to the 100m target
		expect(tracker.progress.value).toBe(100);
		expect(tracker.goalReached.value).toBe(true);

		// crossing the goal auto-pauses tracking (the engine calls pause())
		expect(tracker.tracking.value).toBe(false);

		// and surfaces the success toast exactly once, never a `/undefined`
		const goalToast = toasts.find((t) => /goal reached/i.test(t));
		expect(goalToast).toBeTruthy();
		expect(toasts.join('\n')).not.toMatch(/undefined/);

		// clean up the persisted key so other specs start fresh
		await tracker.reset();
	});

	it('caps an implausibly large single jump (anti-spoof speed clamp)', async () => {
		const tracker = useDistanceTracker(() => ({ ...STEP, questId: 'q-cap', targetMeters: 100000 }));
		await tracker.start();
		expect(pedListener).toBeTypeOf('function');
		advance(1000);
		pedListener!({ distance: 0 }); // baseline
		// a 50km jump over ~10s is clamped to MAX_SPEED_MPS (8.9408 m/s) * 10s ~ 89m,
		// so it can't fly to 50km
		advance(10_000);
		pedListener!({ distance: 50000 });
		expect(tracker.progress.value).toBeLessThan(1000);
		await tracker.reset();
	});

	it('reports goalReached straight away when resuming an already-complete step', async () => {
		const ref = { questId: 'q-done', stepIndex: 0, altIndex: 0, targetMeters: 50, title: 'done' };
		// pre-seed a stored state at/over target
		prefStore[distanceStorageKey(ref)] = JSON.stringify({
			progress: 50,
			startedAt: Date.now(),
			version: 1
		});
		const tracker = useDistanceTracker(() => ref);
		await tracker.refreshSnapshot();
		expect(tracker.goalReached.value).toBe(true);
	});
});
