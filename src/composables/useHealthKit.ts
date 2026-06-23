import { App, type AppState } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Motion, type AccelListenerEvent } from '@capacitor/motion';
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { CapacitorPedometer, type Measurement } from '@capgo/capacitor-pedometer';

interface HealthKitDistancePlugin {
	isAvailable(): Promise<{ available: boolean }>;
	requestAuthorization(): Promise<{ granted: boolean }>;
	getActivityDistance(options: {
		start: number;
		end: number;
	}): Promise<{ distance: number | null; source: string; workoutCount?: number }>;
	startObserving(): Promise<{ started: boolean }>;
	stopObserving(): Promise<void>;
	addListener(
		eventName: 'healthKitUpdate',
		listenerFunc: () => void
	): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<HealthKitDistancePlugin>('HealthKitDistance', {
	web: () =>
		Promise.resolve({
			isAvailable: async () => ({ available: false }),
			requestAuthorization: async () => ({ granted: false }),
			getActivityDistance: async () => ({ distance: null, source: 'unavailable' }),
			startObserving: async () => ({ started: false }),
			stopObserving: async () => {},
			addListener: async () => ({ remove: async () => {} })
		} as unknown as HealthKitDistancePlugin)
});

let authorizationPromise: Promise<boolean> | null = null;
let healthKitUnavailable = false;
const healthKitGranted = ref<boolean | null>(null);

function isUnimplemented(e: unknown): boolean {
	return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'UNIMPLEMENTED';
}

function markHealthKitUnavailable() {
	if (healthKitUnavailable) return;
	healthKitUnavailable = true;
	healthKitGranted.value = false;
	console.warn(
		'[healthkit] native plugin not registered (UNIMPLEMENTED): using pedometer only; add HealthKitDistancePlugin.swift to the App target and rebuild'
	);
}

export function useHealthKit() {
	const isSupported = Capacitor.getPlatform() === 'ios';

	async function isAvailable(): Promise<boolean> {
		if (!isSupported || healthKitUnavailable) return false;
		try {
			const { available } = await Native.isAvailable();
			return !!available;
		} catch (e) {
			if (isUnimplemented(e)) markHealthKitUnavailable();
			else console.error('[healthkit] isAvailable failed:', e);
			return false;
		}
	}

	// collapse concurrent callers into a single system prompt
	async function requestAuthorization(): Promise<boolean> {
		if (!isSupported || healthKitUnavailable) {
			healthKitGranted.value = false;
			return false;
		}
		if (authorizationPromise) return authorizationPromise;
		authorizationPromise = (async () => {
			try {
				const { granted } = await Native.requestAuthorization();
				healthKitGranted.value = !!granted;
				return !!granted;
			} catch (e) {
				if (isUnimplemented(e)) markHealthKitUnavailable();
				else console.error('[healthkit] requestAuthorization failed:', e);
				healthKitGranted.value = false;
				return false;
			} finally {
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
		if (!isSupported || healthKitUnavailable) return null;
		try {
			return await Native.getActivityDistance({ start: startMs, end: endMs });
		} catch (e) {
			if (isUnimplemented(e)) markHealthKitUnavailable();
			else console.error('[healthkit] getActivityDistance failed:', e);
			return null;
		}
	}

	async function startObserving(): Promise<boolean> {
		if (!isSupported || healthKitUnavailable) return false;
		try {
			const { started } = await Native.startObserving();
			return !!started;
		} catch (e) {
			if (isUnimplemented(e)) markHealthKitUnavailable();
			else console.error('[healthkit] startObserving failed:', e);
			return false;
		}
	}

	async function stopObserving(): Promise<void> {
		if (!isSupported || healthKitUnavailable) return;
		try {
			await Native.stopObserving();
		} catch (e) {
			if (!isUnimplemented(e)) console.error('[healthkit] stopObserving failed:', e);
		}
	}

	function onUpdate(listener: () => void): Promise<PluginListenerHandle> {
		if (!isSupported || healthKitUnavailable) {
			return Promise.resolve({ remove: async () => {} } as PluginListenerHandle);
		}
		return Native.addListener('healthKitUpdate', listener);
	}

	return {
		isSupported,
		isAvailable,
		requestAuthorization,
		getActivityDistance,
		startObserving,
		stopObserving,
		onUpdate,
		healthKitGranted
	};
}

// ===========================================================================
// Live Activity bridge (native plugin in ios/App/App/DistanceLiveActivityPlugin.swift)
// ===========================================================================

// full content rendered by the native widget; see DistanceActivityAttributes.ContentState
export type QuestActivityContent = {
	questId: string;
	questName: string;
	rarity: string;
	stepIndex: number;
	totalSteps: number;
	stepLabel: string;
	stepSymbol: string;
	stepDescription: string;
	progress: number; // 0..1, or -1 for no bar
	unlockAtMs: number; // epoch ms for the unlock countdown, or 0
	ctaText: string;
	ctaURL: string;
	tapURL: string;
};

interface DistanceLiveActivityPlugin {
	isSupported(): Promise<{ supported: boolean }>;
	start(options: QuestActivityContent): Promise<{ activityId: string }>;
	update(options: QuestActivityContent): Promise<void>;
	end(): Promise<void>;
}

const LiveActivityNative = registerPlugin<DistanceLiveActivityPlugin>('DistanceLiveActivity', {
	web: () =>
		Promise.resolve({
			isSupported: async () => ({ supported: false }),
			start: async () => ({ activityId: '' }),
			update: async () => {},
			end: async () => {}
		} as unknown as DistanceLiveActivityPlugin)
});

let liveActivityId: string | null = null;
// flips true on UNIMPLEMENTED (DistanceLiveActivityPlugin not in the build); lets the controller
// tell "plugin missing, needs rebuild" apart from "user disabled Live Activities in Settings"
let liveActivityUnavailable = false;

function markLiveActivityUnavailable() {
	if (liveActivityUnavailable) return;
	liveActivityUnavailable = true;
	console.warn(
		'[live-activity] native plugin not registered (UNIMPLEMENTED): add DistanceLiveActivityPlugin.swift to the App target and rebuild'
	);
}

function useLiveActivityBridge() {
	const isPlatformSupported = Capacitor.getPlatform() === 'ios';

	async function isSupported(): Promise<boolean> {
		if (!isPlatformSupported || liveActivityUnavailable) return false;
		try {
			const { supported } = await LiveActivityNative.isSupported();
			return !!supported;
		} catch (e) {
			if (isUnimplemented(e)) markLiveActivityUnavailable();
			else console.error('[live-activity] isSupported failed:', e);
			return false;
		}
	}

	async function start(content: QuestActivityContent): Promise<boolean> {
		if (!isPlatformSupported || liveActivityUnavailable) return false;
		try {
			const { activityId } = await LiveActivityNative.start(content);
			liveActivityId = activityId || null;
			return !!liveActivityId;
		} catch (e) {
			if (isUnimplemented(e)) markLiveActivityUnavailable();
			else console.error('[live-activity] start failed:', e);
			return false;
		}
	}

	async function update(content: QuestActivityContent): Promise<void> {
		if (!isPlatformSupported || liveActivityUnavailable || !liveActivityId) return;
		try {
			await LiveActivityNative.update(content);
		} catch (e) {
			if (!isUnimplemented(e)) console.error('[live-activity] update failed:', e);
		}
	}

	// native end() ends ALL activities, so it doubles as orphan cleanup
	async function end(): Promise<void> {
		if (!isPlatformSupported || liveActivityUnavailable) return;
		liveActivityId = null;
		try {
			await LiveActivityNative.end();
		} catch (e) {
			if (!isUnimplemented(e)) console.error('[live-activity] end failed:', e);
		}
	}

	function hasActive(): boolean {
		return liveActivityId !== null;
	}

	return { isSupported, start, update, end, hasActive };
}

// ===========================================================================
// Distance tracking ENGINE (module-scope singleton)
//
// the active session, its reactive state, and the native listeners live at module
// scope so they survive component mount/unmount; closing the step modal does NOT
// stop tracking. only pause() or app termination stops a session. exactly one
// session is active at a time, keyed by quest_distance:{questId}:{stepIndex}:{altIndex}.
// ===========================================================================

const MAX_SPEED_MPS = 8.9408; // 20 mph cap rejects vehicular travel
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_STRIDE_M = 0.762;
const NOTIF_OFFSETS_MS = [
	{ id: 1, label: '3 days', deltaMs: 3 * 24 * 60 * 60 * 1000 },
	{ id: 2, label: '1 day', deltaMs: 1 * 24 * 60 * 60 * 1000 },
	{ id: 3, label: '12 hours', deltaMs: 12 * 60 * 60 * 1000 },
	{ id: 4, label: '1 hour', deltaMs: 1 * 60 * 60 * 1000 }
];
const BIKE_RMS_THRESHOLD = 0.45; // m/s^2 rolling RMS that qualifies as "active"
const BIKE_FALLBACK_SPEED_MPS = 4.0; // ~14 km/h conservative bike pace
const RMS_WINDOW_MS = 3000;
const FOREGROUND_SYNC_INTERVAL_MS = 10_000;
const LIVE_ACTIVITY_UPDATE_THROTTLE_MS = 2_000;
const SYNC_NOTIFY_THROTTLE_MS = 15_000;

export type DistanceStepRef = {
	questId: string;
	stepIndex: number;
	altIndex?: number;
	targetMeters: number;
	title?: string;
};

type StoredState = {
	progress: number;
	startedAt: number;
	anchorCumulativeSteps?: number;
	version: 1;
};

export function distanceStorageKey(ref: {
	questId: string;
	stepIndex: number;
	altIndex?: number;
}): string {
	return `quest_distance:${ref.questId}:${ref.stepIndex}:${ref.altIndex ?? 0}`;
}

const activeKey = ref<string | null>(null);
const activeTarget = ref(0);
const activeTitle = ref('');
const progress = ref(0);
const startedAt = ref<number | null>(null);
const anchorCumulativeSteps = ref<number | null>(null);
const tracking = ref(false);

const goalReached = computed(() => activeTarget.value > 0 && progress.value >= activeTarget.value);

const syncPulse = ref(0);
const lastSyncDelta = ref(0);

let pedListener: PluginListenerHandle | null = null;
let motionListener: PluginListenerHandle | null = null;
let appStateListener: PluginListenerHandle | null = null;
let healthKitListener: PluginListenerHandle | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;

let lastSteps: number | null = null;
let lastPedDistance: number | null = null;
let lastSampleAt = 0;
let rmsSamples: { t: number; mag: number }[] = [];
// active-tracking window, re-anchored on each attach. the poll's HealthKit/pedometer queries run
// over [windowStart, now] (+ windowBaseM = progress at attach) so they fold in ONLY the current
// active session, never paused/closed/incidental periods or old workouts (the "large old chunk" bug)
let windowStart = 0;
let windowBaseM = 0;
let lastSyncNotifyAt = 0;
// re-entry guards: `tracking` only flips true at the END of start(), so a rapid second tap would
// re-enter and attach a SECOND set of listeners (-> doubled distance); concurrent syncs (observer +
// poll + resume) could merge/notify the same workout twice
let startInFlight = false;
let syncInFlight = false;
// one-shot so the live pedometer AND a HealthKit sync crossing the goal in the same tick don't
// both fire the success toast/haptic; re-armed per session in adoptKey/reset
let goalNotified = false;

// ---- haptics ----------------------------------------------------------------

async function hapticImpact() {
	try {
		await Haptics.impact({ style: ImpactStyle.Light });
	} catch {
		// no haptics on this device/platform
	}
}

async function hapticSuccess() {
	try {
		await Haptics.notification({ type: NotificationType.Success });
	} catch {
		// no haptics on this device/platform
	}
}

// ---- persistence ------------------------------------------------------------

function notificationIdFor(key: string, offset: number): number {
	let h = 5381;
	for (let i = 0; i < key.length; i++) h = ((h << 5) + h) ^ key.charCodeAt(i);
	h = Math.abs((h ^ (offset * 2654435761)) | 0);
	return (h % 2_000_000_000) + 1;
}

async function readStored(key: string): Promise<StoredState | null> {
	const { value } = await Preferences.get({ key });
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Partial<StoredState>;
		if (typeof parsed.progress !== 'number' || typeof parsed.startedAt !== 'number') return null;
		if (Date.now() - parsed.startedAt > EXPIRY_MS) {
			await Preferences.remove({ key });
			await cancelExpiryNotifications(key);
			return null;
		}
		return {
			progress: parsed.progress,
			startedAt: parsed.startedAt,
			anchorCumulativeSteps:
				typeof parsed.anchorCumulativeSteps === 'number' ? parsed.anchorCumulativeSteps : undefined,
			version: 1
		};
	} catch {
		await Preferences.remove({ key });
		return null;
	}
}

async function persistActive() {
	if (!activeKey.value || !startedAt.value) return;
	const payload: StoredState = {
		progress: progress.value,
		startedAt: startedAt.value,
		version: 1
	};
	if (anchorCumulativeSteps.value != null) {
		payload.anchorCumulativeSteps = anchorCumulativeSteps.value;
	}
	await Preferences.set({ key: activeKey.value, value: JSON.stringify(payload) });
}

async function clearKey(key: string) {
	await Preferences.remove({ key });
	await cancelExpiryNotifications(key);
}

// ---- notifications ----------------------------------------------------------

async function ensureNotificationPermission(): Promise<boolean> {
	try {
		const current = await LocalNotifications.checkPermissions();
		if (current.display === 'granted') return true;
		const requested = await LocalNotifications.requestPermissions();
		return requested.display === 'granted';
	} catch (e) {
		console.error('[tracker] notification permission check failed:', e);
		return false;
	}
}

async function scheduleExpiryNotifications(key: string, start: number) {
	if (!Capacitor.isNativePlatform()) return;
	const granted = await ensureNotificationPermission();
	if (!granted) return;
	await cancelExpiryNotifications(key);

	const expiresAt = start + EXPIRY_MS;
	const toSchedule = NOTIF_OFFSETS_MS.map(({ id, label, deltaMs }) => {
		const at = new Date(expiresAt - deltaMs);
		return {
			id: notificationIdFor(key, id),
			title: 'Distance progress expiring',
			body:
				deltaMs <= 60 * 60 * 1000
					? `Less than ${label} until your distance progress resets to 0. Submit your quest step soon!`
					: `Your distance progress expires in ${label}. Complete your distance goal before it resets.`,
			schedule: { at },
			channelId: 'quest-distance-expiry'
		};
	}).filter((n) => n.schedule.at.getTime() > Date.now() + 30_000);

	if (toSchedule.length === 0) return;
	try {
		await LocalNotifications.schedule({ notifications: toSchedule });
	} catch (e) {
		console.error('[tracker] failed to schedule expiry notifications:', e);
	}
}

async function cancelExpiryNotifications(key: string) {
	if (!Capacitor.isNativePlatform()) return;
	try {
		await LocalNotifications.cancel({
			notifications: NOTIF_OFFSETS_MS.map(({ id }) => ({ id: notificationIdFor(key, id) }))
		});
	} catch {
		// best-effort
	}
}

function formatDistance(meters: number): string {
	return formatDistanceUnits(meters, useAppSettingsState().value.units);
}

// fired when a sync (workout-end or manual) adds distance; throttled so the 10s poll can't spam
async function notifySynced(delta: number) {
	const t = Date.now();
	if (t - lastSyncNotifyAt < SYNC_NOTIFY_THROTTLE_MS) return;
	lastSyncNotifyAt = t;
	void Toast.show({
		text: `Synced ${formatDistance(delta)} from Apple Health.`,
		duration: 'short'
	});
	try {
		const granted = await ensureNotificationPermission();
		if (!granted || !activeKey.value) return;
		await LocalNotifications.schedule({
			notifications: [
				{
					id: notificationIdFor(activeKey.value, 98),
					title: 'Distance Synced',
					body: `Added ${formatDistance(delta)} from your Apple Health workout.`,
					schedule: { at: new Date(Date.now() + 300) },
					channelId: 'quest-distance-expiry'
				}
			]
		});
	} catch (e) {
		console.error('[tracker] sync notification failed:', e);
	}
}

async function notifyGoalReached(delta = 0) {
	if (goalNotified) return;
	goalNotified = true;
	void hapticSuccess();
	void Toast.show({
		text:
			delta > 0
				? `Synced ${formatDistance(delta)} from Apple Health, goal reached! Tap Submit Distance.`
				: 'Distance goal reached, tap Submit Distance to record it.',
		duration: 'long'
	});
	try {
		const granted = await ensureNotificationPermission();
		if (!granted || !activeKey.value) return;
		await LocalNotifications.schedule({
			notifications: [
				{
					id: notificationIdFor(activeKey.value, 99),
					title: 'Distance goal reached',
					body: 'Your distance goal is complete. Open the quest to submit your step.',
					schedule: { at: new Date(Date.now() + 500) },
					channelId: 'quest-distance-expiry'
				}
			]
		});
	} catch (e) {
		console.error('[tracker] goal notification failed:', e);
	}
}

// ---- live activity ----------------------------------------------------------

// the live activity is owned by the quest controller below (driven by the active quest);
// the distance engine only feeds it the live fraction and re-syncs; it never owns the LA
function currentDistanceFraction(): number {
	return activeTarget.value > 0 ? Math.min(1, progress.value / activeTarget.value) : -1;
}

function liveActivityStart() {
	setDistanceFraction(currentDistanceFraction());
	void syncQuestLiveActivity();
}

function liveActivityUpdate(force = false) {
	setDistanceFraction(currentDistanceFraction());
	void syncQuestLiveActivity(force);
}

function liveActivityEnd() {
	setDistanceFraction(currentDistanceFraction());
	void syncQuestLiveActivity();
}

async function clearOrphanLiveActivity() {
	if (tracking.value) return;
	await clearOrphanQuestLiveActivity();
}

// ---- distance math ----------------------------------------------------------

function updateRmsWindow(magnitude: number, t: number) {
	rmsSamples.push({ t, mag: magnitude });
	const cutoff = t - RMS_WINDOW_MS;
	while (rmsSamples.length > 0 && rmsSamples[0]!.t < cutoff) {
		rmsSamples.shift();
	}
}

function currentRms(): number {
	if (rmsSamples.length === 0) return 0;
	let sumSq = 0;
	for (const s of rmsSamples) sumSq += s.mag * s.mag;
	return Math.sqrt(sumSq / rmsSamples.length);
}

function addDistance(deltaMeters: number, elapsedMs: number) {
	if (deltaMeters <= 0 || elapsedMs <= 0) return;
	const maxAllowed = MAX_SPEED_MPS * (elapsedMs / 1000);
	const accepted = Math.min(deltaMeters, maxAllowed);
	if (accepted <= 0) return;
	progress.value = Math.min(activeTarget.value, progress.value + accepted);
	void persistActive();
	void liveActivityUpdate();

	if (progress.value >= activeTarget.value) {
		void pause();
		void liveActivityEnd();
		void notifyGoalReached();
	}
}

function onPedMeasurement(evt: Measurement) {
	const tNow = Date.now();
	const elapsed = lastSampleAt === 0 ? 0 : tNow - lastSampleAt;
	lastSampleAt = tNow;

	let delta = 0;
	if (typeof evt.distance === 'number' && Number.isFinite(evt.distance)) {
		if (lastPedDistance === null) {
			lastPedDistance = evt.distance;
		} else if (evt.distance > lastPedDistance) {
			delta = evt.distance - lastPedDistance;
			lastPedDistance = evt.distance;
		}
	}

	if (delta === 0 && typeof evt.numberOfSteps === 'number') {
		if (lastSteps === null) {
			lastSteps = evt.numberOfSteps;
		} else if (evt.numberOfSteps > lastSteps) {
			const stepDelta = evt.numberOfSteps - lastSteps;
			lastSteps = evt.numberOfSteps;
			delta = stepDelta * DEFAULT_STRIDE_M;
		}
	}

	if (delta > 0) {
		addDistance(delta, elapsed || 1000);
		return;
	}

	if (elapsed > 0 && currentRms() >= BIKE_RMS_THRESHOLD) {
		addDistance(BIKE_FALLBACK_SPEED_MPS * (elapsed / 1000), elapsed);
	}
}

function onMotion(evt: AccelListenerEvent) {
	const a = evt.acceleration;
	const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
	updateRmsWindow(magnitude, Date.now());
}

// @capgo/capacitor-pedometer's Measurement type omits cumulativeSteps (the android-only
// TYPE_STEP_COUNTER field the plugin still returns); read it through a narrow cast
function readCumulativeSteps(m: Measurement): number | null {
	const v = (m as Measurement & { cumulativeSteps?: number }).cumulativeSteps;
	return typeof v === 'number' ? v : null;
}

async function readPedometerHistory(): Promise<number | null> {
	if (!Capacitor.isNativePlatform()) return null;
	if (!startedAt.value) return null;
	const platform = Capacitor.getPlatform();
	try {
		if (platform === 'ios') {
			// window-scoped, NOT [startedAt, now]; querying from startedAt re-folds days of
			// incidental/background walking the live foreground tracker already excluded
			const m = await CapacitorPedometer.getMeasurement({ start: windowStart, end: Date.now() });
			const win = typeof m.distance === 'number' && Number.isFinite(m.distance) ? m.distance : 0;
			return windowBaseM + win;
		}
		if (platform === 'android') {
			const anchor = anchorCumulativeSteps.value;
			if (anchor == null) return null;
			const m = await CapacitorPedometer.getMeasurement();
			const cur = readCumulativeSteps(m);
			if (cur == null) return null;
			if (cur < anchor) {
				anchorCumulativeSteps.value = cur;
				await persistActive();
				return windowBaseM;
			}
			return windowBaseM + (cur - anchor) * DEFAULT_STRIDE_M;
		}
	} catch (e) {
		console.error('[tracker] pedometer history read failed:', e);
	}
	return null;
}

async function readHealthKitDistance(): Promise<number | null> {
	if (Capacitor.getPlatform() !== 'ios') return null;
	if (!startedAt.value) return null;
	try {
		const { isSupported, getActivityDistance } = useHealthKit();
		if (!isSupported) return null;
		// window-scoped: only workouts during the current active session, so we never re-fold an
		// OLD workout that happened earlier in the step's 30-day life (the "large old chunk" bug)
		const result = await getActivityDistance(windowStart, Date.now());
		if (!result) return null;
		if (typeof result.distance === 'number' && Number.isFinite(result.distance)) {
			// HK returned real data -> read access definitely works (recovers a stale `false`)
			if (result.distance > 0) healthKitGranted.value = true;
			return windowBaseM + result.distance;
		}
	} catch (e) {
		console.error('[tracker] HealthKit query failed:', e);
	}
	return null;
}

// merge authoritative distance. HealthKit workout distance is final only at workout-end,
// so it folds in then; the live pedometer drives in-progress movement. Math.max (not sum)
// keeps the two sources from double-counting the same window.
// merge authoritative distance. NOTE: progress is set to the MAX of (HealthKit workout, pedometer)
// (never their sum) and only ever moves UP, so the same walk measured by both sources (or the
// same workout re-read) can't double-count. concurrent background calls are collapsed below.
async function syncFromBackground(opts: { manual?: boolean } = {}): Promise<number> {
	if (!Capacitor.isNativePlatform()) return 0;
	if (!tracking.value || !startedAt.value) return 0;
	// collapse overlapping background syncs (observer + 10s poll + resume) so a single workout
	// can't be merged/notified twice; an explicit manual sync always runs
	if (syncInFlight && !opts.manual) return 0;
	syncInFlight = true;
	try {
		const before = progress.value;

		const healthkit = await readHealthKitDistance();
		const pedHistory = await readPedometerHistory();
		const candidate = Math.max(healthkit ?? 0, pedHistory ?? 0);
		const healthkitDrove = (healthkit ?? 0) >= (pedHistory ?? 0) && (healthkit ?? 0) > before;
		if (candidate > progress.value) {
			progress.value = Math.min(activeTarget.value, candidate);
			await persistActive();
			await liveActivityUpdate(true);
		}

		const delta = progress.value - before;

		if (delta > 0) {
			void hapticImpact();
			// notify + pulse for workout (HealthKit) syncs and explicit manual syncs; the live pedometer poll stays quiet
			if (healthkitDrove || opts.manual) {
				void notifySynced(delta);
				lastSyncDelta.value = delta;
				syncPulse.value++;
			}
		} else if (opts.manual) {
			void hapticImpact();
		}

		if (delta <= 0) return 0;

		if (progress.value >= activeTarget.value) {
			void pause();
			void liveActivityEnd();
			void notifyGoalReached(delta);
		}
		return delta;
	} finally {
		syncInFlight = false;
	}
}

// ---- listener lifecycle -----------------------------------------------------

function onAppStateChange(state: AppState) {
	if (!state.isActive) return;
	if (!tracking.value || !startedAt.value) return;
	void syncFromBackground();
}

function startForegroundSync() {
	if (syncTimer) return;
	syncTimer = setInterval(() => {
		if (!tracking.value || !startedAt.value || goalReached.value) return;
		void syncFromBackground();
	}, FOREGROUND_SYNC_INTERVAL_MS);
}

function stopForegroundSync() {
	if (syncTimer) {
		clearInterval(syncTimer);
		syncTimer = null;
	}
}

async function attachListeners() {
	lastSteps = null;
	lastPedDistance = null;
	lastSampleAt = Date.now();
	rmsSamples = [];

	// re-anchor the active window so the poll's queries exclude paused/closed/incidental periods
	windowStart = Date.now();
	windowBaseM = progress.value;
	if (Capacitor.getPlatform() === 'android') {
		try {
			const m = await CapacitorPedometer.getMeasurement();
			anchorCumulativeSteps.value = readCumulativeSteps(m);
		} catch (e) {
			console.error('[tracker] failed to anchor cumulative steps:', e);
		}
	}

	pedListener = await CapacitorPedometer.addListener('measurement', onPedMeasurement);
	await CapacitorPedometer.startMeasurementUpdates();
	motionListener = await Motion.addListener('accel', onMotion);

	try {
		appStateListener = await App.addListener('appStateChange', onAppStateChange);
	} catch (e) {
		console.error('[tracker] failed to register appStateChange listener:', e);
	}

	// the moment a watch workout ends and syncs to the phone, HealthKit's observer fires
	const hk = useHealthKit();
	if (hk.isSupported) {
		try {
			healthKitListener = await hk.onUpdate(() => {
				if (!tracking.value || !startedAt.value || goalReached.value) return;
				void syncFromBackground();
			});
			await hk.startObserving();
		} catch (e) {
			console.error('[tracker] failed to start HealthKit observer:', e);
		}
	}

	startForegroundSync();
	tracking.value = true;
}

async function detachListeners() {
	tracking.value = false;
	stopForegroundSync();
	try {
		await CapacitorPedometer.stopMeasurementUpdates();
	} catch {
		// ignore
	}
	for (const handle of [pedListener, motionListener, appStateListener, healthKitListener]) {
		if (!handle) continue;
		try {
			await handle.remove();
		} catch {
			// ignore
		}
	}
	pedListener = null;
	motionListener = null;
	appStateListener = null;
	healthKitListener = null;
	if (Capacitor.getPlatform() === 'ios') {
		void useHealthKit().stopObserving();
	}
}

// ---- engine controls --------------------------------------------------------

async function adoptKey(stepRef: DistanceStepRef) {
	const key = distanceStorageKey(stepRef);
	activeKey.value = key;
	activeTarget.value = stepRef.targetMeters;
	activeTitle.value = stepRef.title ?? 'Distance quest';

	const stored = await readStored(key);
	progress.value = stored?.progress ?? 0;
	startedAt.value = stored?.startedAt ?? null;
	anchorCumulativeSteps.value = stored?.anchorCumulativeSteps ?? null;
	// already-at-goal sessions shouldn't re-fire the success toast on resume
	goalNotified = activeTarget.value > 0 && progress.value >= activeTarget.value;
}

async function start(stepRef: DistanceStepRef): Promise<void> {
	if (!Capacitor.isNativePlatform()) {
		await showErrorToast(new Error('Distance tracking requires the mobile app on a device.'), {
			duration: 'long'
		});
		return;
	}

	const key = distanceStorageKey(stepRef);

	// idempotent: already tracking this exact step; a second tap is a no-op
	if (tracking.value && activeKey.value === key) return;
	// a start is already running (rapid double-tap before `tracking` flips true); ignore so we
	// don't attach a second set of listeners and double-count distance
	if (startInFlight) return;

	if (tracking.value && activeKey.value && activeKey.value !== key) {
		await Toast.show({
			text: 'Another distance step is already being tracked. Pause it first.',
			duration: 'long'
		});
		return;
	}

	startInFlight = true;
	try {
		const { require: requirePermission } = useQuestPermissions();
		const motionOk = await requirePermission('motion');
		if (!motionOk) return;
		// HealthKit is best-effort: a denial just drops Apple Watch workout distance from the merge
		void requirePermission('healthkit', { notify: false });

		if (activeKey.value !== key) await adoptKey(stepRef);
		else {
			activeTarget.value = stepRef.targetMeters;
			activeTitle.value = stepRef.title ?? activeTitle.value;
		}

		if (!startedAt.value) {
			startedAt.value = Date.now();
			// android pedometer anchor is set per-attach in attachListeners (window-scoped)
			await persistActive();
			void scheduleExpiryNotifications(key, startedAt.value);
		}

		await attachListeners();
		void liveActivityStart();
	} catch (e) {
		await showErrorToast(e, { fallback: 'Failed to start distance tracking.', duration: 'long' });
		await pause();
	} finally {
		startInFlight = false;
	}
}

async function pause(): Promise<void> {
	await detachListeners();
	await persistActive();
	void liveActivityEnd();
}

async function reset(stepRef: DistanceStepRef): Promise<void> {
	const key = distanceStorageKey(stepRef);
	if (activeKey.value === key) {
		if (tracking.value) await detachListeners();
		progress.value = 0;
		startedAt.value = null;
		anchorCumulativeSteps.value = null;
		goalNotified = false;
		void liveActivityEnd();
	}
	await clearKey(key);
}

async function syncNow(stepRef: DistanceStepRef): Promise<number> {
	const key = distanceStorageKey(stepRef);
	if (activeKey.value !== key || !tracking.value) return 0;
	const before = progress.value;
	// race the WHOLE op (incl. the HealthKit auth prompt) against a timeout; a stuck native
	// auth/query call must never leave the caller's spinner stuck
	const work = (async () => {
		const { require: requirePermission } = useQuestPermissions();
		await requirePermission('healthkit', { notify: true });
		await syncFromBackground({ manual: true });
	})();
	await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, 10_000))]);
	return progress.value - before;
}

async function cancelFromMigration(stepRef: DistanceStepRef, reason: string): Promise<void> {
	console.log(`[tracker] cancelling tracking due to cloud migration: ${reason}`);
	await reset(stepRef);
	try {
		await Toast.show({ text: 'This step was updated by the cloud; distance tracking stopped.' });
	} catch {
		// best-effort
	}
}

async function reconcile(stepRef: DistanceStepRef): Promise<void> {
	const key = distanceStorageKey(stepRef);
	if (activeKey.value !== key) return;
	if (!startedAt.value || goalReached.value) return;
	await syncFromBackground();
}

// ===========================================================================
// Quest Live Activity controller: always-on while a quest is active, reflecting the
// current step. Owns the LA lifecycle; the distance engine feeds it a live fraction.
// ===========================================================================

const STEP_SF_SYMBOL: Record<string, string> = {
	take_photo_location: 'camera.viewfinder',
	take_photo_classification: 'camera.metering.matrix',
	take_photo_caption: 'text.below.photo.fill',
	take_photo_objects: 'cube.box.fill',
	take_photo_validation: 'checkmark.seal.fill',
	take_photo_list: 'checklist',
	article_quiz: 'questionmark.circle.fill',
	draw_picture: 'paintbrush.pointed.fill',
	attend_event: 'calendar',
	respond_to_prompt: 'bubble.left.and.bubble.right.fill',
	article_read_time: 'book.fill',
	activity_read_time: 'figure.run',
	transcribe_audio: 'mic.fill',
	match_terms: 'square.grid.2x2.fill',
	order_items: 'arrow.up.arrow.down',
	describe_text: 'square.and.pencil',
	submit_event_image: 'photo.on.rectangle.angled',
	distance_covered: 'figure.walk',
	scan_barcode: 'barcode.viewfinder'
};

const STEP_LABEL: Record<string, string> = {
	take_photo_location: 'Take a Photo',
	take_photo_classification: 'Take a Photo',
	take_photo_caption: 'Caption a Photo',
	take_photo_objects: 'Photograph Objects',
	take_photo_validation: 'Take a Photo',
	take_photo_list: 'Photo Checklist',
	article_quiz: 'Article Quiz',
	draw_picture: 'Draw a Picture',
	attend_event: 'Attend an Event',
	respond_to_prompt: 'Respond to a Prompt',
	article_read_time: 'Read an Article',
	activity_read_time: 'Read an Activity',
	transcribe_audio: 'Record Audio',
	match_terms: 'Match Terms',
	order_items: 'Order Items',
	describe_text: 'Describe in Text',
	submit_event_image: 'Share an Event Photo',
	distance_covered: 'Cover a Distance',
	scan_barcode: 'Scan a Barcode'
};

// CTA with a `tab` opens that discover segment; otherwise it opens the step modal
const STEP_CTA: Record<string, { text: string; tab?: string }> = {
	respond_to_prompt: { text: 'Respond', tab: 'prompt' },
	attend_event: { text: 'Find Events', tab: 'event' },
	submit_event_image: { text: 'Find Events', tab: 'event' },
	article_read_time: { text: 'Read', tab: 'article' },
	activity_read_time: { text: 'Explore', tab: 'activity' },
	article_quiz: { text: 'Open Quiz' },
	take_photo_location: { text: 'Take Photo' },
	take_photo_classification: { text: 'Take Photo' },
	take_photo_caption: { text: 'Take Photo' },
	take_photo_objects: { text: 'Take Photo' },
	take_photo_validation: { text: 'Take Photo' },
	take_photo_list: { text: 'Take Photo' },
	draw_picture: { text: 'Draw' },
	transcribe_audio: { text: 'Record' },
	match_terms: { text: 'Play' },
	order_items: { text: 'Play' },
	describe_text: { text: 'Write' },
	scan_barcode: { text: 'Scan' }
};

let distanceFraction = -1;
let laQuestId: string | null = null;
let lastQuestLaJson = '';
let lastQuestLaStructural = '';
let lastQuestLaSentAt = 0;
let questLaWired = false;
let laDisabledNotified = false;
// serialize starts: `liveActivityId`/`laQuestId` are set only after the native request resolves,
// so two syncs racing on launch both see hasActive()=false and would each create an activity
let laStartInFlight = false;
// captured once in init() (app.vue setup) so the LA sync, which also fires from the appStateChange
// callback, where there is NO active Nuxt instance, never re-calls useAuth/useUser/useRuntimeConfig
// (those throw "nuxt instance unavailable" when invoked outside a setup/effect scope)
let laUser: { readonly value: User | null | undefined } | null = null;
let laQuest: { readonly value: UserQuestProgress | null | undefined } | null = null;
let laBaseUrl = 'https://app.earth-app.com';

function setDistanceFraction(fraction: number) {
	distanceFraction = fraction;
}

function questActivityBaseUrl(): string {
	return (laBaseUrl || 'https://app.earth-app.com').replace(/\/$/, '');
}

function prevStepCompletedAt(
	slots: (QuestProgressEntry | QuestProgressEntry[])[] | undefined,
	index: number
): number {
	if (index <= 0 || !slots) return 0;
	const prev = slots[index - 1];
	if (!prev) return 0;
	if (Array.isArray(prev)) return prev.find((p) => p.submittedAt)?.submittedAt ?? 0;
	return prev.submittedAt ?? 0;
}

function activeStepFor(
	slot: QuestStep | QuestStep[],
	progressSlot: QuestProgressEntry | QuestProgressEntry[] | undefined
): QuestStep {
	if (!Array.isArray(slot)) return slot;
	const doneAlts = new Set(
		Array.isArray(progressSlot) ? progressSlot.map((p) => p.altIndex ?? 0) : []
	);
	return slot.find((_, i) => !doneAlts.has(i)) ?? slot[0]!;
}

// unlock time for the current step (rank-adjusted delay over the previous step's completion)
function currentStepUnlockAt(uq: UserQuestProgress): number {
	const idx = uq.currentStepIndex;
	const slot = uq.quest.steps[idx];
	if (!slot) return 0;
	const step = activeStepFor(slot, uq.progress?.[idx]);
	if (typeof step.delay !== 'number' || step.delay <= 0 || idx <= 0) return 0;
	const prev = prevStepCompletedAt(uq.progress, idx);
	if (prev <= 0) return 0;
	const eff = getEffectiveQuestStepDelay(step.delay, laUser?.value?.account.account_type);
	return prev + eff * 1000;
}

function buildQuestContent(uq: UserQuestProgress): QuestActivityContent {
	const quest = uq.quest;
	const idx = uq.currentStepIndex;
	const slot = quest.steps[idx];
	const step = activeStepFor(slot!, uq.progress?.[idx]);
	const type = step.type;
	const base = questActivityBaseUrl();
	const stepUrl = `${base}/tabs/quests/${quest.id}?step=${idx}`;

	let progressValue = -1;
	if (type === 'distance_covered') {
		progressValue = distanceFraction;
	} else if (type === 'article_read_time' || type === 'activity_read_time') {
		const art = uq.activeReadTime?.find((r) => r.stepIndex === idx);
		if (art && art.targetSeconds > 0) {
			progressValue = Math.min(1, art.accumulatedSeconds / art.targetSeconds);
		}
	}

	const unlockAtMs = currentStepUnlockAt(uq);
	const locked = unlockAtMs > Date.now();
	const cta = STEP_CTA[type];
	let ctaText = '';
	let ctaURL = '';
	if (!locked && cta?.text) {
		ctaText = cta.text;
		ctaURL = cta.tab ? `${base}/tabs/discover?tab=${cta.tab}` : stepUrl;
	}

	return {
		questId: quest.id,
		questName: quest.title,
		rarity: quest.rarity ?? 'normal',
		stepIndex: idx,
		totalSteps: quest.steps.length,
		stepLabel: STEP_LABEL[type] ?? 'Quest Step',
		stepSymbol: STEP_SF_SYMBOL[type] ?? 'flag.checkered',
		stepDescription: step.description ?? '',
		progress: progressValue,
		unlockAtMs: locked ? unlockAtMs : 0,
		ctaText,
		ctaURL,
		tapURL: stepUrl
	};
}

function activeQuestProgress(): UserQuestProgress | null {
	return laQuest?.value ?? null;
}

async function syncQuestLiveActivity(force = false): Promise<void> {
	if (Capacitor.getPlatform() !== 'ios') return;
	const la = useLiveActivityBridge();
	const uq = activeQuestProgress();

	if (!uq || uq.completed || !uq.quest) {
		console.log('[quest-la] sync: no active quest, ending any live activity');
		if (la.hasActive()) await la.end();
		laQuestId = null;
		lastQuestLaJson = '';
		return;
	}

	const content = buildQuestContent(uq);
	const json = JSON.stringify(content);
	if (la.hasActive() && json === lastQuestLaJson) return;

	// structural changes (quest/step/lock) always send; progress-only ticks are throttled
	const structural = `${content.questId}:${content.stepIndex}:${content.unlockAtMs > 0 ? 1 : 0}`;
	const structuralChanged = structural !== lastQuestLaStructural;
	const nowMs = Date.now();
	if (
		!force &&
		la.hasActive() &&
		!structuralChanged &&
		nowMs - lastQuestLaSentAt < LIVE_ACTIVITY_UPDATE_THROTTLE_MS
	) {
		return;
	}

	if (laQuestId !== content.questId || !la.hasActive()) {
		// a start is already racing; don't double-create (the second sync resumes via the update path)
		if (laStartInFlight) return;
		laStartInFlight = true;
		try {
			// LA has no runtime prompt: the only gate is the Settings toggle (areActivitiesEnabled,
			// on by default). surface a one-time nudge if the user turned it off.
			if (!(await la.isSupported())) {
				if (liveActivityUnavailable) {
					// plugin not in the build (UNIMPLEMENTED): a native rebuild is needed, not a Settings change
					console.warn('[quest-la] sync: Live Activity plugin unavailable, needs native rebuild');
					return;
				}
				console.warn(
					'[quest-la] sync: Live Activities disabled - Settings > The Earth App > Live Activities'
				);
				if (!laDisabledNotified) {
					laDisabledNotified = true;
					void Toast.show({
						text: 'Turn on Live Activities for The Earth App (Settings > The Earth App > Live Activities) to see quest progress on your Lock Screen.',
						duration: 'long'
					});
				}
				return;
			}
			console.log(`[quest-la] sync: starting for ${content.questId} step ${content.stepIndex}`);
			// don't mark the quest active unless the activity actually started; otherwise every later
			// sync takes the no-op update path and never retries (the silent dead-end)
			const started = await la.start(content);
			if (!started) {
				console.warn('[quest-la] sync: Activity.request failed; will retry next sync');
				return;
			}
			laQuestId = content.questId;
		} finally {
			laStartInFlight = false;
		}
	} else {
		console.log(`[quest-la] sync: updating step ${content.stepIndex}`);
		await la.update(content);
	}
	lastQuestLaJson = json;
	lastQuestLaStructural = structural;
	lastQuestLaSentAt = nowMs;
}

async function endQuestLiveActivity(): Promise<void> {
	const la = useLiveActivityBridge();
	if (la.hasActive()) await la.end();
	laQuestId = null;
	lastQuestLaJson = '';
}

// clear an activity left on screen by a force-quit when no quest is active this launch
async function clearOrphanQuestLiveActivity(): Promise<void> {
	if (Capacitor.getPlatform() !== 'ios') return;
	const uq = activeQuestProgress();
	if (uq && !uq.completed) return;
	try {
		await useLiveActivityBridge().end();
	} catch (e) {
		console.error('[quest-la] clear orphan failed:', e);
	}
}

// schedule the unlock reminder for the current step when it's gated by a delay
async function scheduleUnlockForCurrentStep(uq: UserQuestProgress | null): Promise<void> {
	if (!uq || uq.completed || !uq.quest) return;
	const at = currentStepUnlockAt(uq);
	if (at <= Date.now() + 30_000) return;
	await scheduleStepUnlockNotification({
		questId: uq.quest.id,
		questTitle: uq.quest.title,
		stepIndex: uq.currentStepIndex,
		unlockAt: at
	});
}

export function useQuestLiveActivity() {
	// wire once from the app shell: keep the activity + unlock reminder in sync with the
	// active quest, and re-sync when the app returns to the foreground
	function init() {
		if (questLaWired || !Capacitor.isNativePlatform()) return;
		questLaWired = true;
		const { user } = useAuth();
		const userId = computed(() => user.value?.id);
		const { quest, fetchUserQuest } = useUser(userId);
		// capture for the appStateChange-driven sync path (see laUser/laQuest/laBaseUrl above)
		laUser = user;
		laQuest = quest;
		laBaseUrl = (useRuntimeConfig().public.baseUrl as string) || laBaseUrl;
		watch(
			quest,
			(uq) => {
				void syncQuestLiveActivity();
				void scheduleUnlockForCurrentStep(uq ?? null);
			},
			{ deep: true }
		);
		void App.addListener('appStateChange', (state) => {
			if (state.isActive) void syncQuestLiveActivity();
		});
		// on launch / after an app update the active quest isn't hydrated yet; clear any stale
		// activity, load the quest, then arm the live activity so it shows for the active quest
		void (async () => {
			await clearOrphanQuestLiveActivity();
			try {
				await fetchUserQuest();
			} catch {
				// non-fatal; the watcher arms the LA whenever the quest later resolves
			}
			await syncQuestLiveActivity();
			await scheduleUnlockForCurrentStep(quest.value ?? null);
		})();
	}

	// force a re-create: drop the cached identity so the next sync takes the start path even if
	// the user swiped the activity away (manual refresh should bring it back)
	async function forceResync(): Promise<void> {
		laQuestId = null;
		lastQuestLaJson = '';
		lastQuestLaStructural = '';
		await syncQuestLiveActivity();
	}

	return {
		init,
		sync: syncQuestLiveActivity,
		forceResync,
		end: endQuestLiveActivity,
		clearOrphan: clearOrphanQuestLiveActivity
	};
}

// per-consumer view: reflects live engine state when the step matches the active
// session, otherwise the key's persisted (paused) snapshot without touching the active one
export function useDistanceTracker(getStepRef: () => DistanceStepRef) {
	const stepKey = computed(() => distanceStorageKey(getStepRef()));
	const isActive = computed(() => activeKey.value === stepKey.value);

	const snapProgress = ref(0);
	const snapStartedAt = ref<number | null>(null);

	async function refreshSnapshot() {
		if (isActive.value) return;
		const stored = await readStored(stepKey.value);
		snapProgress.value = stored?.progress ?? 0;
		snapStartedAt.value = stored?.startedAt ?? null;
	}

	const viewProgress = computed(() => (isActive.value ? progress.value : snapProgress.value));
	const viewStartedAt = computed(() => (isActive.value ? startedAt.value : snapStartedAt.value));
	const viewTracking = computed(() => isActive.value && tracking.value);
	const viewTarget = computed(() => getStepRef().targetMeters);
	const viewGoalReached = computed(
		() => viewTarget.value > 0 && viewProgress.value >= viewTarget.value
	);

	return {
		progress: viewProgress,
		startedAt: viewStartedAt,
		tracking: viewTracking,
		target: viewTarget,
		goalReached: viewGoalReached,
		isActive,
		start: () => start(getStepRef()),
		pause: () => pause(),
		reset: () => reset(getStepRef()),
		syncNow: () => syncNow(getStepRef()),
		reconcile: () => reconcile(getStepRef()),
		cancelFromMigration: (reason: string) => cancelFromMigration(getStepRef(), reason),
		clearOrphanLiveActivity,
		refreshSnapshot,
		// drop the persisted distance + its expiry notifications once the step is submitted
		discardSaved: () => clearKey(distanceStorageKey(getStepRef())),
		syncPulse,
		lastSyncDelta
	};
}
