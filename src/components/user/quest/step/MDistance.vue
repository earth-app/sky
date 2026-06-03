<template>
	<div class="flex flex-col items-stretch gap-5 w-full max-w-md mx-auto">
		<div class="flex flex-col items-center gap-2">
			<div
				class="w-20 h-20 rounded-full border-2 flex items-center justify-center"
				:class="
					tracking
						? 'border-lime-400 animate-ring-pulse'
						: completed
							? 'border-success'
							: 'border-neutral-500/40'
				"
			>
				<UIcon
					:name="
						tracking
							? 'mdi:run-fast'
							: completed
								? 'i-lucide-circle-check'
								: 'mdi:map-marker-distance'
					"
					class="text-3xl"
					:class="tracking ? 'text-lime-400' : completed ? 'text-success' : 'text-neutral-400'"
				/>
			</div>
			<p class="text-sm! font-semibold! tracking-[0.12em] uppercase opacity-80!">
				{{ statusLabel }}
			</p>
			<p class="text-xs! opacity-60! text-center max-w-xs leading-relaxed">
				{{ statusDescription }}
			</p>
		</div>

		<div class="flex flex-col gap-2 px-2">
			<div class="flex justify-between text-xs! opacity-80">
				<span>{{ progressLabel }}</span>
				<span>{{ percentLabel }}</span>
			</div>
			<IonProgressBar
				:value="progressFraction"
				color="success"
				class="rounded-full overflow-hidden"
			/>
			<div class="flex justify-between text-[0.65rem]! opacity-50 mt-1!">
				<span>0 m</span>
				<span>{{ formatDistance(targetMeters) }}</span>
			</div>
		</div>

		<div
			v-if="expiryWarning"
			class="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs!"
		>
			<UIcon
				name="i-lucide-clock-alert"
				class="size-5 shrink-0"
			/>
			<span>{{ expiryWarning }}</span>
		</div>

		<div
			v-if="!Capacitor.isNativePlatform()"
			class="flex items-center gap-2 p-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-sm"
			role="alert"
		>
			<UIcon
				name="i-lucide-smartphone"
				class="size-5 shrink-0"
			/>
			<span>
				Distance tracking only works in the mobile app; you'll see the Start button stay disabled
				here. Continue this quest on your phone.
			</span>
		</div>

		<div class="flex flex-col gap-2">
			<IonButton
				v-if="!completed && !goalReached"
				:color="tracking ? 'warning' : 'success'"
				:disabled="props.disabled || !Capacitor.isNativePlatform()"
				expand="block"
				@click="toggleTracking"
			>
				<UIcon
					:name="tracking ? 'i-lucide-pause' : 'i-lucide-play'"
					class="size-5 mr-2"
				/>
				{{ tracking ? 'Pause Tracking' : progress > 0 ? 'Resume Tracking' : 'Start Tracking' }}
			</IonButton>

			<IonButton
				v-if="goalReached && !completed"
				color="primary"
				:disabled="props.disabled || submitting"
				expand="block"
				@click="submit"
			>
				<UIcon
					v-if="!submitting"
					name="i-lucide-check"
					class="size-5 mr-2"
				/>
				<UIcon
					v-else
					name="i-lucide-upload"
					class="size-5 animate-bounce mr-2"
				/>
				{{ submitting ? 'Submitting…' : 'Submit Distance' }}
			</IonButton>

			<IonButton
				v-if="progress > 0 && !tracking && !completed && !goalReached"
				color="neutral"
				fill="outline"
				size="small"
				@click="confirmReset"
			>
				Reset Progress
			</IonButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import { App, type AppState } from '@capacitor/app';
import { BackgroundRunner } from '@capacitor/background-runner';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Motion, type AccelListenerEvent } from '@capacitor/motion';
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { CapacitorPedometer, type Measurement } from '@capgo/capacitor-pedometer';

const props = defineProps<{
	questId: string;
	stepIndex: number;
	altIndex?: number;
	targetMeters: number;
	disabled?: boolean;
	alreadyCompleted?: boolean;
	// cloud-side cancel signals delivered alongside quest progress. when this prop contains
	// a matching cancel_distance_tracking entry we tear down the runner and wipe local state.
	migrationSignals?: QuestMigrationSignal[];
}>();

const emit = defineEmits<{
	capture: [distance: number];
}>();

const { require: requirePermission, prime: primePermission } = useQuestPermissions();

// - 20 mph cap rejects vehicular travel (≈ 8.9408 m/s)
// - 30-day expiry resets local progress so stale runs do not accumulate forever
// - notifications fire at 3 days, 1 day, 12 hours, and 1 hour before expiry

const MAX_SPEED_MPS = 8.9408;
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_STRIDE_M = 0.762;
const NOTIF_OFFSETS_MS = [
	{ id: 1, label: '3 days', deltaMs: 3 * 24 * 60 * 60 * 1000 },
	{ id: 2, label: '1 day', deltaMs: 1 * 24 * 60 * 60 * 1000 },
	{ id: 3, label: '12 hours', deltaMs: 12 * 60 * 60 * 1000 },
	{ id: 4, label: '1 hour', deltaMs: 1 * 60 * 60 * 1000 }
];
const BIKE_RMS_THRESHOLD = 0.45; // m/s² rolling RMS that qualifies as "active"
const BIKE_FALLBACK_SPEED_MPS = 4.0; // ≈ 14 km/h, conservative average bike pace
const RMS_WINDOW_MS = 3000;

const RUNNER_LABEL = 'com.earthapp.sky.distance';
const RUNNER_SYNC_INTERVAL_MS = 15_000;
const BACKGROUND_SYNC_TOAST_THRESHOLD_M = 50;

const storageKey = computed(
	() => `quest_distance:${props.questId}:${props.stepIndex}:${props.altIndex ?? 0}`
);

const progress = ref(0);
const startedAt = ref<number | null>(null);
const anchorCumulativeSteps = ref<number | null>(null);
const tracking = ref(false);
const submitting = ref(false);
const completed = ref(!!props.alreadyCompleted);
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
let appStateListener: PluginListenerHandle | null = null;

const pedListener = ref<PluginListenerHandle | null>(null);
const motionListener = ref<PluginListenerHandle | null>(null);
const lastSteps = ref<number | null>(null);
const lastPedDistance = ref<number | null>(null);
const lastSampleAt = ref<number>(0);
const rmsSamples = ref<{ t: number; mag: number }[]>([]);

let runnerSyncTimer: ReturnType<typeof setInterval> | null = null;
let lastRunnerSyncAt = 0;

const goalReached = computed(() => progress.value >= props.targetMeters);
const progressFraction = computed(() => {
	if (!props.targetMeters) return 0;
	return Math.min(1, progress.value / props.targetMeters);
});
const progressLabel = computed(() => `${formatDistance(progress.value)} covered`);
const percentLabel = computed(() => `${Math.floor(progressFraction.value * 100)}%`);

const statusLabel = computed(() => {
	if (completed.value) return 'Step Complete';
	if (goalReached.value) return 'Goal Reached';
	if (tracking.value) return 'Tracking Active';
	if (progress.value > 0) return 'Tracking Paused';
	return 'Ready to Move';
});

const statusDescription = computed(() => {
	if (completed.value) return 'You have already submitted this step.';
	if (goalReached.value) return 'Tap submit to record your distance.';
	if (tracking.value)
		return 'Keep your phone with you and move on foot or by bike. Vehicle travel will be ignored.';
	if (progress.value > 0)
		return 'Resume when you are ready. Progress is saved locally for 30 days.';
	return 'Tracking uses your pedometer and motion sensors. Walking, running, and biking count toward your goal.';
});

const expiryWarning = computed(() => {
	if (!startedAt.value || completed.value) return '';
	const remaining = startedAt.value + EXPIRY_MS - now.value;
	if (remaining <= 0) return 'Progress has expired and will reset on your next tracking session.';
	const days = remaining / (24 * 60 * 60 * 1000);
	if (days <= 1) return `Less than 24 hours left before your distance progress expires.`;
	if (days <= 3) return `Just ${Math.ceil(days)} days left before your distance progress expires.`;
	return '';
});

function formatDistance(meters: number): string {
	if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 2)} km`;
	return `${Math.round(meters)} m`;
}

function notificationIdFor(offset: number): number {
	// deterministic 32-bit positive id per (step, offset). djb2-ish hash, signed-safe.
	let h = 5381;
	const s = storageKey.value;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
	h = Math.abs((h ^ (offset * 2654435761)) | 0);
	return (h % 2_000_000_000) + 1;
}

type StoredState = {
	progress: number;
	startedAt: number;
	anchorCumulativeSteps?: number;
	version: 1;
};

async function loadState() {
	const { value } = await Preferences.get({ key: storageKey.value });
	if (!value) return;
	try {
		const parsed = JSON.parse(value) as Partial<StoredState>;
		if (typeof parsed.progress !== 'number' || typeof parsed.startedAt !== 'number') return;
		if (Date.now() - parsed.startedAt > EXPIRY_MS) {
			await clearState();
			return;
		}
		progress.value = parsed.progress;
		startedAt.value = parsed.startedAt;
		anchorCumulativeSteps.value =
			typeof parsed.anchorCumulativeSteps === 'number' ? parsed.anchorCumulativeSteps : null;
	} catch {
		// Corrupt entry — wipe and start over.
		await clearState();
	}
}

async function persistState() {
	if (!startedAt.value) return;
	const payload: StoredState = {
		progress: progress.value,
		startedAt: startedAt.value,
		version: 1
	};
	if (anchorCumulativeSteps.value != null) {
		payload.anchorCumulativeSteps = anchorCumulativeSteps.value;
	}
	await Preferences.set({ key: storageKey.value, value: JSON.stringify(payload) });
}

async function clearState() {
	progress.value = 0;
	startedAt.value = null;
	anchorCumulativeSteps.value = null;
	await Preferences.remove({ key: storageKey.value });
	await cancelExpiryNotifications();
}

type RunnerSnapshot = {
	tracking: boolean;
	progress: number;
	questId?: string;
	stepIndex?: number;
	altIndex?: number;
	targetMeters?: number;
	startedAt?: number;
	lastUpdate?: number;
};

async function runnerStart(initialProgress: number, anchorStartedAt: number) {
	if (!Capacitor.isNativePlatform()) return;
	try {
		// Seed the runner with current foreground progress and start timestamp so
		// the first scheduled tick anchors from the right value. Geolocation is
		// the only sensor the runner can reach, so accuracy in the background is
		// best-effort and capped by the same 20 mph limit as foreground.
		await BackgroundRunner.dispatchEvent({
			label: RUNNER_LABEL,
			event: 'start',
			details: {
				questId: props.questId,
				stepIndex: props.stepIndex,
				altIndex: props.altIndex ?? 0,
				targetMeters: props.targetMeters,
				startedAt: anchorStartedAt,
				progress: initialProgress
			}
		});
	} catch (e) {
		console.error('[MDistance] failed to start background runner:', e);
	}
}

async function runnerStop() {
	if (!Capacitor.isNativePlatform()) return;
	try {
		await BackgroundRunner.dispatchEvent({
			label: RUNNER_LABEL,
			event: 'stop',
			details: {}
		});
	} catch (e) {
		console.error('[MDistance] failed to stop background runner:', e);
	}
}

async function runnerGetProgress(): Promise<RunnerSnapshot | null> {
	if (!Capacitor.isNativePlatform()) return null;
	try {
		return await BackgroundRunner.dispatchEvent<RunnerSnapshot>({
			label: RUNNER_LABEL,
			event: 'getProgress',
			details: {}
		});
	} catch (e) {
		console.error('[MDistance] failed to read runner progress:', e);
		return null;
	}
}

async function readPedometerHistory(): Promise<number | null> {
	if (!Capacitor.isNativePlatform()) return null;
	if (!startedAt.value || completed.value) return null;
	const platform = Capacitor.getPlatform();
	try {
		if (platform === 'ios') {
			const m = await CapacitorPedometer.getMeasurement({
				start: startedAt.value,
				end: Date.now()
			});
			const distance = typeof m.distance === 'number' ? m.distance : null;
			return distance != null && Number.isFinite(distance) ? distance : null;
		}
		if (platform === 'android') {
			const anchor = anchorCumulativeSteps.value;
			if (anchor == null) return null;
			const m = await CapacitorPedometer.getMeasurement();
			const cur = typeof m.cumulativeSteps === 'number' ? m.cumulativeSteps : null;
			if (cur == null) return null;
			if (cur < anchor) {
				// TYPE_STEP_COUNTER resets to 0 on reboot. Re-anchor to the new
				// value rather than discarding progress so we don't double-count
				// post-reboot steps as historical.
				anchorCumulativeSteps.value = cur;
				await persistState();
				return null;
			}
			return (cur - anchor) * DEFAULT_STRIDE_M;
		}
	} catch (e) {
		console.error('[MDistance] pedometer history read failed:', e);
	}
	return null;
}

async function readRunnerProgress(): Promise<number | null> {
	if (!Capacitor.isNativePlatform()) return null;
	try {
		const snap = await BackgroundRunner.dispatchEvent<RunnerSnapshot>({
			label: RUNNER_LABEL,
			event: 'syncForeground',
			details: { progress: progress.value }
		});
		return snap && typeof snap.progress === 'number' ? snap.progress : null;
	} catch (e) {
		console.error('[MDistance] runner snapshot read failed:', e);
		return null;
	}
}

async function readHealthKitDistance(): Promise<number | null> {
	if (Capacitor.getPlatform() !== 'ios') return null;
	if (!startedAt.value) return null;
	try {
		const { isSupported, getActivityDistance } = useHealthKit();
		if (!isSupported) return null;
		const result = await getActivityDistance(startedAt.value, Date.now());
		if (!result) return null;
		// Source string lets us log which path won the merge in development.
		// Production users won't see this; it just keeps the diagnostic in console.
		if (typeof result.distance === 'number' && Number.isFinite(result.distance)) {
			console.log(
				`[MDistance] HealthKit distance: ${result.distance.toFixed(1)}m via ${result.source}` +
					(result.workoutCount ? ` (${result.workoutCount} workouts)` : '')
			);
			return result.distance;
		}
	} catch (e) {
		console.error('[MDistance] HealthKit query failed:', e);
	}
	return null;
}

async function syncFromBackground(): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	if (!startedAt.value || completed.value) return;
	const before = progress.value;

	const healthkit = await readHealthKitDistance();
	const pedHistory = await readPedometerHistory();
	const runner = await readRunnerProgress();
	const candidate = Math.max(healthkit ?? 0, pedHistory ?? 0, runner ?? 0);
	if (candidate > progress.value) {
		progress.value = Math.min(props.targetMeters, candidate);
		await persistState();
		lastRunnerSyncAt = Date.now();
	}

	const delta = progress.value - before;
	if (delta <= 0) return;

	if (progress.value >= props.targetMeters) {
		void stopTracking();
		void Toast.show({
			text: `Background tracking added ${formatDistance(delta)} — goal reached, tap submit.`,
			duration: 'long'
		});
		return;
	}

	if (delta >= BACKGROUND_SYNC_TOAST_THRESHOLD_M) {
		void Toast.show({
			text: `Synced ${formatDistance(delta)} from background tracking.`,
			duration: 'long'
		});
	}
}

async function runnerSync(force = false): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	if (!tracking.value && !force) return;
	const t = Date.now();
	if (!force && t - lastRunnerSyncAt < RUNNER_SYNC_INTERVAL_MS) return;
	lastRunnerSyncAt = t;
	try {
		const snap = await BackgroundRunner.dispatchEvent<RunnerSnapshot>({
			label: RUNNER_LABEL,
			event: 'syncForeground',
			details: { progress: progress.value }
		});
		// Runner may have a higher value from background GPS deltas. Merge in.
		if (snap && typeof snap.progress === 'number' && snap.progress > progress.value) {
			progress.value = Math.min(props.targetMeters, snap.progress);
			void persistState();
			if (progress.value >= props.targetMeters && tracking.value) {
				void stopTracking();
				void Toast.show({
					text: 'Distance goal reached — tap submit to record it.',
					duration: 'long'
				});
			}
		}
	} catch (e) {
		console.error('[MDistance] failed to sync runner progress:', e);
	}
}

async function ensureNotificationPermission(): Promise<boolean> {
	try {
		const current = await LocalNotifications.checkPermissions();
		if (current.display === 'granted') return true;
		const requested = await LocalNotifications.requestPermissions();
		return requested.display === 'granted';
	} catch (e) {
		console.error('Local notification permission check failed:', e);
		return false;
	}
}

async function scheduleExpiryNotifications() {
	if (!startedAt.value) return;
	if (!Capacitor.isNativePlatform()) return;

	const granted = await ensureNotificationPermission();
	if (!granted) return;

	await cancelExpiryNotifications();

	const expiresAt = startedAt.value + EXPIRY_MS;
	const toSchedule = NOTIF_OFFSETS_MS.map(({ id, label, deltaMs }) => {
		const at = new Date(expiresAt - deltaMs);
		return {
			id: notificationIdFor(id),
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
		console.error('Failed to schedule expiry notifications:', e);
	}
}

async function cancelExpiryNotifications() {
	if (!Capacitor.isNativePlatform()) return;
	try {
		await LocalNotifications.cancel({
			notifications: NOTIF_OFFSETS_MS.map(({ id }) => ({ id: notificationIdFor(id) }))
		});
	} catch {
		// best-effort
	}
}

function updateRmsWindow(magnitude: number, t: number) {
	rmsSamples.value.push({ t, mag: magnitude });
	const cutoff = t - RMS_WINDOW_MS;
	while (rmsSamples.value.length > 0 && rmsSamples.value[0]!.t < cutoff) {
		rmsSamples.value.shift();
	}
}

function currentRms(): number {
	const samples = rmsSamples.value;
	if (samples.length === 0) return 0;
	let sumSq = 0;
	for (const s of samples) sumSq += s.mag * s.mag;
	return Math.sqrt(sumSq / samples.length);
}

function addDistance(deltaMeters: number, elapsedMs: number) {
	if (deltaMeters <= 0 || elapsedMs <= 0) return;

	const maxAllowed = MAX_SPEED_MPS * (elapsedMs / 1000);
	const accepted = Math.min(deltaMeters, maxAllowed);
	if (accepted <= 0) return;
	progress.value = Math.min(props.targetMeters, progress.value + accepted);
	void persistState();
	void runnerSync();

	if (progress.value >= props.targetMeters) {
		void stopTracking();
		void Toast.show({
			text: 'Distance goal reached — tap submit to record it.',
			duration: 'long'
		});
	}
}

function onPedMeasurement(evt: Measurement) {
	const tNow = Date.now();
	const elapsed = lastSampleAt.value === 0 ? 0 : tNow - lastSampleAt.value;
	lastSampleAt.value = tNow;

	let delta = 0;
	if (typeof evt.distance === 'number' && Number.isFinite(evt.distance)) {
		// iOS: pedometer reports cumulative distance directly.
		if (lastPedDistance.value === null) {
			lastPedDistance.value = evt.distance;
		} else if (evt.distance > lastPedDistance.value) {
			delta = evt.distance - lastPedDistance.value;
			lastPedDistance.value = evt.distance;
		}
	}

	if (delta === 0 && typeof evt.numberOfSteps === 'number') {
		// Android (and iOS fallback): translate step delta via default stride length.
		if (lastSteps.value === null) {
			lastSteps.value = evt.numberOfSteps;
		} else if (evt.numberOfSteps > lastSteps.value) {
			const stepDelta = evt.numberOfSteps - lastSteps.value;
			lastSteps.value = evt.numberOfSteps;
			delta = stepDelta * DEFAULT_STRIDE_M;
		}
	}

	if (delta > 0) {
		addDistance(delta, elapsed || 1000);
		return;
	}

	// Pedometer found nothing — check if accelerometer signals biking-like motion.
	if (elapsed > 0 && currentRms() >= BIKE_RMS_THRESHOLD) {
		addDistance(BIKE_FALLBACK_SPEED_MPS * (elapsed / 1000), elapsed);
	}
}

function onMotion(evt: AccelListenerEvent) {
	const a = evt.acceleration;
	const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
	updateRmsWindow(magnitude, Date.now());
}

async function attachForegroundListeners() {
	lastSteps.value = null;
	lastPedDistance.value = null;
	lastSampleAt.value = Date.now();
	rmsSamples.value = [];

	pedListener.value = await CapacitorPedometer.addListener('measurement', onPedMeasurement);
	await CapacitorPedometer.startMeasurementUpdates();
	motionListener.value = await Motion.addListener('accel', onMotion);
	tracking.value = true;
	startRunnerSyncTimer();
}

async function detachForegroundListeners() {
	tracking.value = false;
	stopRunnerSyncTimer();
	try {
		await CapacitorPedometer.stopMeasurementUpdates();
	} catch {
		// ignore
	}
	if (pedListener.value) {
		try {
			await pedListener.value.remove();
		} catch {
			// ignore
		}
		pedListener.value = null;
	}
	if (motionListener.value) {
		try {
			await motionListener.value.remove();
		} catch {
			// ignore
		}
		motionListener.value = null;
	}
}

function startRunnerSyncTimer() {
	stopRunnerSyncTimer();
	runnerSyncTimer = setInterval(() => {
		void runnerSync();
	}, RUNNER_SYNC_INTERVAL_MS);
}

function stopRunnerSyncTimer() {
	if (runnerSyncTimer) {
		clearInterval(runnerSyncTimer);
		runnerSyncTimer = null;
	}
}

async function startTracking() {
	if (props.disabled) return;
	if (!Capacitor.isNativePlatform()) {
		await showErrorToast(new Error('Distance tracking requires the mobile app on a device.'), {
			duration: 'long'
		});
		return;
	}

	const motionOk = await requirePermission('motion');
	if (!motionOk) return;
	// Background runner can only reach geolocation, so the location grant is
	// what unlocks tracking when the app is in the background or killed.
	const locationOk = await requirePermission('location');
	if (!locationOk) return;
	// HealthKit is best-effort: a denial doesn't block tracking, it just means
	// we lose access to Apple Watch workout distance for the merge. Ask without
	// notifying — the user gets a single OS prompt and we move on.
	void requirePermission('healthkit', { notify: false });

	if (!startedAt.value) {
		startedAt.value = Date.now();
		// Anchor the Android cumulative step counter so we can reconstruct
		// distance taken while the app is killed via getMeasurement on resume.
		// iOS doesn't need an anchor — CMPedometer accepts arbitrary start/end
		// dates and queries its own retained history.
		if (Capacitor.getPlatform() === 'android') {
			try {
				const m = await CapacitorPedometer.getMeasurement();
				if (typeof m.cumulativeSteps === 'number') {
					anchorCumulativeSteps.value = m.cumulativeSteps;
				}
			} catch (e) {
				console.error('[MDistance] failed to anchor cumulative steps:', e);
			}
		}
		await persistState();
		void scheduleExpiryNotifications();
	}

	try {
		await attachForegroundListeners();
	} catch (e) {
		await showErrorToast(e, {
			fallback: 'Failed to start distance tracking.',
			duration: 'long'
		});
		await stopTracking();
		return;
	}

	// Prime the runner with an anchor location so the next scheduled tick has
	// something to subtract against. Failure here is non-fatal — foreground
	// pedometer still works; we just won't accumulate background distance until
	// the runner gets its first sample on a later tick.
	try {
		await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 });
	} catch (e) {
		console.error('[MDistance] initial geolocation prime failed:', e);
	}
	await runnerStart(progress.value, startedAt.value);
}

async function stopTracking() {
	await detachForegroundListeners();
	await persistState();
	await runnerStop();
}

async function toggleTracking() {
	if (tracking.value) {
		await stopTracking();
		return;
	}
	await startTracking();
}

async function confirmReset() {
	const { value } = await Dialog.confirm({
		title: 'Reset distance progress?',
		message: 'This will erase your saved distance and start the 30-day window from scratch.',
		okButtonTitle: 'Reset',
		cancelButtonTitle: 'Cancel'
	});
	if (!value) return;
	await clearState();
}

async function submit() {
	if (props.disabled || submitting.value) return;
	if (progress.value < props.targetMeters) return;

	const motionOk = await requirePermission('motion');
	if (!motionOk) return;

	submitting.value = true;
	try {
		const submittedMeters = Math.round(progress.value);
		await stopTracking();
		emit('capture', submittedMeters);
	} finally {
		submitting.value = false;
	}
}

async function reconnectIfRunnerActive() {
	// If the runner has an active session for THIS step, fold its progress in
	// and reconnect the foreground listeners so the UI shows live updates.
	// Mismatched session (different step/quest) means the user navigated to a
	// different distance step — leave their existing runner alone, this step
	// is just idle.
	const snap = await runnerGetProgress();
	if (!snap || !snap.tracking) return;
	const matches =
		snap.questId === props.questId &&
		snap.stepIndex === props.stepIndex &&
		(snap.altIndex ?? 0) === (props.altIndex ?? 0);
	if (!matches) return;
	// Restore the start timestamp from the runner if local state lost it (e.g.
	// component remounting after a cold app launch with no Preferences hit).
	if (typeof snap.startedAt === 'number' && !startedAt.value) {
		startedAt.value = snap.startedAt;
		await persistState();
	}
	// Merge pedometer history + runner GPS in one pass and toast the user if
	// the jump is meaningful — the progress bar would otherwise visibly leap.
	await syncFromBackground();
	if (completed.value || goalReached.value) return;
	try {
		await attachForegroundListeners();
	} catch (e) {
		console.error('[MDistance] failed to reattach foreground listeners:', e);
	}
}

function onAppStateChange(state: AppState) {
	// When the user returns to the app, both pedometer history and runner GPS
	// may hold steps/distance the foreground listeners never saw. syncFromBackground
	// merges them and toasts if the jump is significant.
	if (!state.isActive) return;
	if (!tracking.value && !startedAt.value) return;
	void syncFromBackground();
}

// cloud signals that the step we were tracking has been removed/changed — stop the runner,
// wipe local state, and let the user see the migration banner on the next render.
async function cancelTrackingFromMigration(reason: string) {
	console.log(`[MDistance] cancelling tracking due to cloud migration: ${reason}`);
	if (tracking.value) {
		await detachForegroundListeners();
		tracking.value = false;
	}
	await runnerStop();
	await clearState();
	completed.value = !!props.alreadyCompleted;
	try {
		await Toast.show({ text: 'This step was updated by the cloud — distance tracking stopped.' });
	} catch {
		// best-effort user toast
	}
}

watch(
	() => props.migrationSignals,
	(signals) => {
		if (!signals?.length) return;
		const hit = signals.find(
			(s) =>
				s.action === 'cancel_distance_tracking' &&
				s.questId === props.questId &&
				s.stepIndex === props.stepIndex &&
				(s.altIndex ?? 0) === (props.altIndex ?? 0)
		);
		if (hit) void cancelTrackingFromMigration(`signal for step ${hit.stepIndex}`);
	},
	{ immediate: true, deep: true }
);

onMounted(async () => {
	nowTimer = setInterval(() => {
		now.value = Date.now();
	}, 30_000);
	await loadState();
	if (Capacitor.isNativePlatform() && !completed.value) {
		// Pre-warm the CMPedometer (iOS) / ActivityRecognition (Android) prompt
		// and the location prompt on step open so the OS dialogs appear up front
		// rather than after the user taps Start Tracking. iOS DeviceMotion is
		// not primed here — it requires a user gesture and is handled inside
		// startTracking() instead.
		if (!props.disabled) {
			void primePermission('motion');
			void primePermission('location');
			// HealthKit is iOS-only and silently no-ops elsewhere; priming here
			// lets the user hit Allow once at step open instead of after we'd
			// otherwise wait for them to tap Start Tracking.
			void primePermission('healthkit');
		}
		await reconnectIfRunnerActive();
		// Component may stay mounted across background/foreground cycles (Ionic
		// keeps tab pages alive); reconcile pedometer history each time we
		// return to the foreground so the gap left by background-runner GPS
		// sampling gets closed.
		try {
			appStateListener = await App.addListener('appStateChange', onAppStateChange);
		} catch (e) {
			console.error('[MDistance] failed to register appStateChange listener:', e);
		}
	}
});

onBeforeUnmount(async () => {
	if (nowTimer) {
		clearInterval(nowTimer);
		nowTimer = null;
	}
	if (appStateListener) {
		try {
			await appStateListener.remove();
		} catch {
			// best-effort
		}
		appStateListener = null;
	}
	// Tear down foreground listeners but leave the runner session alone. The
	// background runner keeps accumulating distance until the user explicitly
	// pauses or submits — that's the whole point of moving tracking off the
	// component lifecycle.
	if (tracking.value) {
		void runnerSync(true);
	}
	await detachForegroundListeners();
	await persistState();
});
</script>

<style scoped>
@keyframes ring-pulse {
	0%,
	100% {
		box-shadow: 0 0 0 0 rgb(163 230 53 / 0.3);
	}
	50% {
		box-shadow: 0 0 0 14px rgb(163 230 53 / 0);
	}
}

.animate-ring-pulse {
	animation: ring-pulse 2s ease-in-out infinite;
}
</style>
