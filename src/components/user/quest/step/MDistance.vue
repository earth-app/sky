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
			class="flex items-center gap-2 p-3 rounded-lg bg-neutral-500/10 border border-neutral-500/30 text-neutral-300 text-xs!"
		>
			<UIcon
				name="i-lucide-info"
				class="size-5 shrink-0"
			/>
			<span
				>Distance tracking requires the mobile app. Open this quest on your phone to continue.</span
			>
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
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
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
}>();

const emit = defineEmits<{
	capture: [distance: number];
}>();

const { require: requirePermission } = useQuestPermissions();

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

const storageKey = computed(
	() => `quest_distance:${props.questId}:${props.stepIndex}:${props.altIndex ?? 0}`
);

const progress = ref(0);
const startedAt = ref<number | null>(null);
const tracking = ref(false);
const submitting = ref(false);
const completed = ref(!!props.alreadyCompleted);
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const pedListener = ref<PluginListenerHandle | null>(null);
const motionListener = ref<PluginListenerHandle | null>(null);
const lastSteps = ref<number | null>(null);
const lastPedDistance = ref<number | null>(null);
const lastSampleAt = ref<number>(0);
const rmsSamples = ref<{ t: number; mag: number }[]>([]);

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

type StoredState = { progress: number; startedAt: number; version: 1 };

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
	await Preferences.set({ key: storageKey.value, value: JSON.stringify(payload) });
}

async function clearState() {
	progress.value = 0;
	startedAt.value = null;
	await Preferences.remove({ key: storageKey.value });
	await cancelExpiryNotifications();
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
	// 20 mph hard cap. Any per-tick contribution above maxV * dt is clamped to the
	// cap; this both rejects bursty pedometer noise and stops vehicular GPS-like
	// jumps from inflating distance.
	const maxAllowed = MAX_SPEED_MPS * (elapsedMs / 1000);
	const accepted = Math.min(deltaMeters, maxAllowed);
	if (accepted <= 0) return;
	progress.value = Math.min(props.targetMeters, progress.value + accepted);
	void persistState();
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

	if (!startedAt.value) {
		startedAt.value = Date.now();
		await persistState();
		void scheduleExpiryNotifications();
	}

	lastSteps.value = null;
	lastPedDistance.value = null;
	lastSampleAt.value = Date.now();
	rmsSamples.value = [];

	try {
		pedListener.value = await CapacitorPedometer.addListener('measurement', onPedMeasurement);
		await CapacitorPedometer.startMeasurementUpdates();
		motionListener.value = await Motion.addListener('accel', onMotion);
		tracking.value = true;
	} catch (e) {
		await showErrorToast(e, {
			fallback: 'Failed to start distance tracking.',
			duration: 'long'
		});
		await stopTracking();
	}
}

async function stopTracking() {
	tracking.value = false;
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
	await persistState();
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

onMounted(async () => {
	nowTimer = setInterval(() => {
		now.value = Date.now();
	}, 30_000);
	await loadState();
});

onBeforeUnmount(async () => {
	if (nowTimer) {
		clearInterval(nowTimer);
		nowTimer = null;
	}
	await stopTracking();
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
