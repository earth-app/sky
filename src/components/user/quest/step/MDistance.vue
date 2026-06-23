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

		<div class="relative flex flex-col gap-2 px-2">
			<div
				v-if="syncFlash"
				role="status"
				aria-live="polite"
				class="pointer-events-none absolute -top-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-success/15 px-3 py-1 text-xs! font-semibold text-success animate-sync-rise"
			>
				{{ syncFlashLabel }}
			</div>
			<div class="flex justify-between text-xs! opacity-80">
				<span>{{ progressLabel }}</span>
				<span>{{ percentLabel }}</span>
			</div>
			<div :class="['rounded-full', syncFlash ? 'animate-sync-glow' : '']">
				<IonProgressBar
					:value="progressFraction"
					color="success"
					:aria-label="`Distance progress: ${progressLabel}, ${percentLabel}`"
					class="rounded-full overflow-hidden"
				/>
			</div>
			<div class="flex justify-between text-[0.65rem]! opacity-50 mt-1!">
				<span>{{ formatDistance(0) }}</span>
				<span>{{ formatDistance(targetMeters) }}</span>
			</div>

			<div
				v-if="isAppleHealthSource"
				class="flex items-center gap-2 text-xs! mt-2!"
				:class="healthKitDenied ? 'text-amber-600 dark:text-amber-300' : 'opacity-80'"
			>
				<UIcon
					:name="healthKitDenied ? 'mdi:heart-off' : 'mdi:heart-pulse'"
					class="size-4 shrink-0"
					:class="healthKitDenied ? 'text-amber-500' : 'text-primary'"
				/>
				<span v-if="healthKitDenied"
					>Apple Health access is off, so distance is counted by your phone's pedometer only. Allow
					Health access in Settings to include Apple Watch workouts.</span
				>
				<span v-else
					>Distance for this step is read from Apple Health when allowed, including workouts your
					Apple Watch records.</span
				>
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
				:disabled="props.disabled || !Capacitor.isNativePlatform() || busy"
				expand="block"
				@click="toggleTracking"
			>
				<UIcon
					:name="tracking ? 'i-lucide-pause' : 'i-lucide-play'"
					class="size-5 mr-2"
				/>
				{{
					busy
						? busyLabel
						: tracking
							? 'Pause Tracking'
							: progress > 0
								? 'Resume Tracking'
								: 'Start Tracking'
				}}
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
				{{ submitting ? 'Submitting...' : 'Submit Distance' }}
			</IonButton>

			<IonButton
				v-if="isAppleHealthSource && tracking && !completed && !goalReached"
				color="secondary"
				fill="outline"
				size="small"
				:disabled="syncing"
				@click="manualSync"
			>
				<IonSpinner
					v-if="syncing"
					name="crescent"
					class="size-4 mr-2"
				/>
				<UIcon
					v-else
					name="mdi:heart-pulse"
					class="size-4 mr-2"
				/>
				{{ syncing ? 'Syncing...' : 'Sync from Apple Health' }}
			</IonButton>

			<IonButton
				v-if="progress > 0 && !tracking && !completed && !goalReached"
				color="danger"
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
import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	questId: string;
	stepIndex: number;
	altIndex?: number;
	targetMeters: number;
	disabled?: boolean;
	alreadyCompleted?: boolean;
	// cloud-side cancel signals delivered alongside quest progress. when this prop contains
	// a matching cancel_distance_tracking entry we tear down tracking and wipe local state.
	migrationSignals?: QuestMigrationSignal[];
}>();

const emit = defineEmits<{
	capture: [distance: number];
}>();

const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

const { prime: primePermission } = useQuestPermissions();
const { impactLight, impactMedium } = useAppHaptics();
const { formatDistance } = useUnits();
const { healthKitGranted } = useHealthKit();

// the tracking ENGINE is a module-level singleton (useDistanceTracker) so the session +
// native listeners survive this component unmounting; closing the step modal no longer
// stops tracking; only Pause or app termination does. this component is a thin view.
const tracker = useDistanceTracker(() => ({
	questId: props.questId,
	stepIndex: props.stepIndex,
	altIndex: props.altIndex,
	targetMeters: props.targetMeters
}));
const { progress, tracking, startedAt, goalReached, syncPulse, lastSyncDelta } = tracker;

const submitting = ref(false);
const syncing = ref(false);
// disables the start/pause button + shows a stable label for the whole async start/pause, so a
// laggy first tap can't be double-fired (which would attach duplicate trackers)
const busy = ref(false);
const busyLabel = ref('');
const completed = ref(!!props.alreadyCompleted);
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

// brief "+Xm from Apple Health" + bar glow whenever a sync (workout-end or manual) folds in distance
const syncFlash = ref(false);
const syncFlashLabel = ref('');
watch(syncPulse, () => {
	if (lastSyncDelta.value <= 0) return;
	syncFlashLabel.value = `+${formatDistance(lastSyncDelta.value)} from Apple Health`;
	syncFlash.value = false;
	void nextTick(() => {
		syncFlash.value = true;
	});
	setTimeout(() => {
		syncFlash.value = false;
	}, 2000);
});

// healthkit only runs on ios, so surface the apple health disclosure there
const isAppleHealthSource = computed(() => Capacitor.getPlatform() === 'ios');
const healthKitDenied = computed(
	() => isAppleHealthSource.value && healthKitGranted.value === false
);

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
		return "Keep moving! Walking, running, and biking count, plus Apple Watch workouts. Closing this step won't stop tracking.";
	if (progress.value > 0)
		return 'Resume when you are ready. Progress is saved locally for 30 days.';
	return 'Tracking uses your pedometer and Apple Health. Walking, running, and biking count toward your goal.';
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

async function toggleTracking() {
	if (busy.value) return;
	void impactMedium();
	busy.value = true;
	busyLabel.value = tracking.value ? 'Pausing...' : 'Starting...';
	try {
		if (tracking.value) await tracker.pause();
		else if (!props.disabled) await tracker.start();
	} finally {
		busy.value = false;
	}
}

async function confirmReset() {
	const { value } = await Dialog.confirm({
		title: 'Reset distance progress?',
		message: 'This will erase your saved distance and start the 30-day window from scratch.',
		okButtonTitle: 'Reset',
		cancelButtonTitle: 'Cancel'
	});
	if (!value) return;
	void impactMedium();
	await tracker.reset();
}

async function submit() {
	if (props.disabled || submitting.value) return;
	if (progress.value < props.targetMeters) return;

	submitting.value = true;
	try {
		const submittedMeters = Math.round(progress.value);
		// stop the session and its Live Activity, then hand the value to the step submission
		await tracker.pause();
		emit('capture', submittedMeters);
		// step submitted: drop the saved distance + its expiry notifications so stale
		// "progress expiring" pings don't fire for an already-completed step
		void tracker.discardSaved();
	} finally {
		submitting.value = false;
	}
}

async function manualSync() {
	if (syncing.value) return;
	void impactLight();
	syncing.value = true;
	const before = progress.value;
	try {
		// engine owns sync feedback (haptic + toast + notification); we only add the no-distance hint
		await tracker.syncNow();
		const delta = progress.value - before;
		if (delta <= 0 && progress.value < props.targetMeters) {
			Toast.show({
				text: 'No new distance yet. Apple Watch data can take a moment to reach your iPhone, so try again shortly, or check Settings > Health > Data Access for The Earth App.',
				duration: 'long'
			});
		}
	} catch (e) {
		console.error('[MDistance] manual sync failed:', e);
	} finally {
		syncing.value = false;
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
		if (hit) void tracker.cancelFromMigration(`signal for step ${hit.stepIndex}`);
	},
	{ immediate: true, deep: true }
);

onMounted(async () => {
	nowTimer = setInterval(() => {
		now.value = Date.now();
	}, 30_000);

	if (Capacitor.isNativePlatform() && !completed.value) {
		// prime the OS permission prompts on step open so they appear up front
		if (!props.disabled) {
			void primePermission('motion');
			void primePermission('healthkit');
		}

		await tracker.refreshSnapshot();
		await tracker.reconcile();

		// clear a live activity left on screen by a prior force-quit (no-op while tracking)
		void tracker.clearOrphanLiveActivity();
	}
});

onBeforeUnmount(() => {
	// deliberately do NOT pause the tracker here; the engine is a singleton that persists
	// across modal close; it stops only on Pause or app termination
	if (nowTimer) {
		clearInterval(nowTimer);
		nowTimer = null;
	}
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

@keyframes sync-rise {
	0% {
		opacity: 0;
		transform: translate(-50%, 8px) scale(0.96);
	}
	15% {
		opacity: 1;
		transform: translate(-50%, 0) scale(1);
	}
	80% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		transform: translate(-50%, -12px);
	}
}

.animate-sync-rise {
	animation: sync-rise 2s ease-out forwards;
}

@keyframes sync-glow {
	0%,
	100% {
		box-shadow: 0 0 0 0 rgb(34 197 94 / 0);
	}
	30% {
		box-shadow: 0 0 12px 2px rgb(34 197 94 / 0.55);
	}
}

.animate-sync-glow {
	animation: sync-glow 1.2s ease-out;
}
</style>
