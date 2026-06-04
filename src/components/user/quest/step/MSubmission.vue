<template>
	<div
		v-if="step"
		class="flex flex-col items-center p-4! min-h-160 w-full"
	>
		<div class="flex flex-col items-center mt-4! text-center gap-1!">
			<UIcon
				:name="step.icon"
				class="size-16"
			/>
			<h2 class="text-lg! font-semibold! opacity-90! mb-0!">{{ step.description }}</h2>
			<span
				v-if="step.delay"
				class="opacity-80"
				>Can be completed after {{ formatTime(step.delay) }} from previous step</span
			>
			<h3
				v-if="step.reward"
				class="text-sm! text-neutral-500 m-0!"
			>
				+{{ step.reward }} Bonus Points
			</h3>
		</div>

		<h2
			v-if="!step.isCurrentQuest && !step.completed"
			class="text-sm! text-neutral-500 mb-2!"
		>
			Start this quest to unlock the step interface.
		</h2>
		<h2
			v-else-if="!step.isUnlocked && !step.completed"
			class="text-sm! text-neutral-500 mb-2!"
		>
			Complete previous steps to unlock this step.
		</h2>

		<div
			v-if="step.tutorial_hint && !step.completed"
			class="flex items-start gap-2 mt-2 mb-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm w-full"
			role="note"
		>
			<UIcon
				name="i-lucide-lightbulb"
				class="size-5 shrink-0 text-primary"
			/>
			<span class="text-gray-700 dark:text-gray-200">{{ step.tutorial_hint }}</span>
		</div>

		<div class="flex flex-col items-center justify-center mt-6! w-full gap-4!">
			<div
				v-if="step.completed"
				class="flex flex-col items-center py-8! w-full"
			>
				<div class="flex flex-col items-center my-2!">
					<UIcon
						name="i-lucide-circle-check"
						class="size-14 text-success"
					/>
					<span class="text-base! font-medium">Already completed</span>
					<span class="text-sm! opacity-90">{{ completedAt }}</span>
				</div>

				<!-- migrated stub: original submission data is gone because the quest definition changed.
				     hide media/score/prompt rendering for migrated entries since none of those fields are reliable. -->
				<div
					v-if="progress?.migrated"
					class="flex items-center gap-3 mt-3 mb-2 px-4 py-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 max-w-md"
				>
					<UIcon
						name="i-lucide-info"
						class="size-5 text-amber-600 shrink-0"
					/>
					<span class="text-xs! opacity-90">{{ migratedMessage }}</span>
				</div>

				<div
					v-else-if="progress"
					class="flex m-2 mb-6"
				>
					<img
						v-if="progress.data && (category === 'photo' || category === 'draw_picture')"
						:src="progress.data"
						alt="Submitted image"
						class="mt-3 max-w-full max-h-72! rounded-lg! object-contain border border-neutral-200 dark:border-neutral-700"
					/>
					<audio
						v-else-if="progress.data && category === 'audio'"
						:src="progress.data"
						controls
						class="mt-3 w-full max-w-sm!"
					/>
					<div
						v-else-if="
							category === 'article_quiz' && step.type === 'article_quiz' && stepArticle !== null
						"
						class="flex flex-col items-center gap-3 py-4 px-6 border border-neutral-200 dark:border-neutral-700 rounded-lg"
					>
						<ArticleMCard
							v-if="stepArticle"
							:article="stepArticle"
						/>
						<MInlineError
							v-else-if="stepArticleLoadFailed"
							title="Article unavailable"
							description="It may have been removed, or the network is flaky."
							severity="warning"
							icon="mdi:cloud-alert-outline"
							@retry="retryStepArticleFetch"
						/>
						<Loading v-else />
					</div>
					<div
						v-else-if="category === 'scan_barcode' && barcodeSubmission"
						class="flex flex-col items-center gap-2 py-4 px-6 border border-neutral-200 dark:border-neutral-700 rounded-lg"
					>
						<UIcon
							:name="barcodeKindIcon"
							class="size-8 opacity-80"
						/>
						<span class="text-base! font-medium">{{
							barcodeSubmission.title || 'Unknown product'
						}}</span>
						<span class="text-xs! opacity-60 uppercase tracking-wide">{{
							barcodeSubmission.kind || 'unknown'
						}}</span>
					</div>
					<div
						v-else-if="category === 'distance_covered' && distanceSubmission"
						class="flex flex-col items-center gap-2 py-4 px-6 border border-neutral-200 dark:border-neutral-700 rounded-lg"
					>
						<UIcon
							name="mdi:map-marker-distance"
							class="size-8 opacity-80"
						/>
						<span class="text-base! font-medium">{{ formatDistance(distanceSubmission) }}</span>
						<span class="text-xs! opacity-60 uppercase tracking-wide">covered</span>
					</div>
					<div
						v-else-if="category === 'describe_text' && describeSubmission"
						class="flex flex-col items-start gap-2 py-4 px-6 border border-neutral-200 dark:border-neutral-700 rounded-lg max-w-md! w-full"
					>
						<span class="text-xs! opacity-60 uppercase tracking-wide">Your response</span>
						<p class="text-sm! whitespace-pre-wrap m-0!">{{ describeSubmission }}</p>
					</div>
				</div>

				<Score
					v-if="!progress?.migrated && progress?.score"
					:score="progress.score"
				/>
				<Quote
					v-if="!progress?.migrated && progress?.prompt"
					:text="progress.prompt"
				/>
			</div>

			<template v-else-if="category === 'photo'">
				<UserQuestStepCapture
					v-if="!isNative && !submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					@capture="submitPhoto"
					@photo-taken="submitError = ''"
					@photo-rejected="submitError = ''"
				/>

				<UserQuestStepMCapture
					v-else-if="isNative && !submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					@capture="submitPhoto"
					@photo-taken="submitError = ''"
					@photo-rejected="submitError = ''"
				/>

				<div
					v-else-if="submitting"
					class="flex flex-col items-center gap-3 py-8!"
				>
					<UIcon
						name="i-lucide-upload"
						class="size-10 animate-bounce text-primary"
					/>
					<span class="text-sm! opacity-70">{{ validatingMessage }}</span>
				</div>

				<div
					v-else-if="succeeded"
					class="flex flex-col items-center gap-3 py-8!"
				>
					<UIcon
						name="i-lucide-circle-check"
						class="size-14 text-success!"
					/>
					<span class="text-base! font-medium!">Step complete!</span>
				</div>
			</template>

			<template v-else-if="category === 'draw_picture'">
				<UserQuestStepDrawing
					v-if="!submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					@capture="submitPhoto"
					@close="emit('submitted')"
				/>
				<div
					v-else-if="submitting"
					class="flex flex-col items-center gap-3 py-8"
				>
					<UIcon
						name="i-lucide-upload"
						class="size-10 animate-bounce text-primary"
					/>
					<span class="text-sm! opacity-70">{{ validatingMessage }}</span>
				</div>
				<div
					v-else-if="succeeded"
					class="flex flex-col items-center gap-3 py-8"
				>
					<UIcon
						name="i-lucide-circle-check"
						class="size-14 text-success"
					/>
					<span class="text-base! font-medium">Step complete!</span>
				</div>
			</template>

			<template v-else-if="category === 'audio'">
				<UserQuestStepRecorder
					v-if="!isNative && !submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					:min-length="audioMinLength"
					@capture="submitPhoto"
				/>

				<UserQuestStepMRecord
					v-else-if="isNative && !submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					:min-length="audioMinLength"
					@capture="submitPhoto"
				/>
				<div
					v-else-if="submitting"
					class="flex flex-col items-center gap-3 py-8!"
				>
					<UIcon
						name="i-lucide-upload"
						class="size-10 animate-bounce text-primary!"
					/>
					<span class="text-sm! opacity-70">{{ validatingMessage }}</span>
				</div>
				<div
					v-else-if="succeeded"
					class="flex flex-col items-center gap-3 py-8"
				>
					<UIcon
						name="i-lucide-circle-check"
						class="size-14 text-success"
					/>
					<span class="text-base! font-medium!">Step complete!</span>
				</div>
			</template>

			<template v-else-if="category === 'describe_text'">
				<UserQuestStepText
					:step="step"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					:submit="true"
					:server-request="makeMServerRequest"
					@submitted="onDelegatedSubmitted"
				/>
			</template>

			<template v-else-if="category === 'match_terms'">
				<UserQuestStepMatcher
					:step="step"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					:submit="true"
					:server-request="makeMServerRequest"
					@submitted="onDelegatedSubmitted"
				/>
			</template>

			<template v-else-if="category === 'order_items'">
				<UserQuestStepOrderer
					:step="step"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					:submit="true"
					:server-request="makeMServerRequest"
					@submitted="onDelegatedSubmitted"
				/>
			</template>

			<template v-else-if="category === 'scan_barcode'">
				<UserQuestStepMBarcode
					v-if="!submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					:kind="scanKind"
					:keyword="scanKeyword"
					@capture="submitBarcode"
					@scan-taken="submitError = ''"
					@scan-rejected="submitError = ''"
				/>
				<div
					v-else-if="submitting"
					class="flex flex-col items-center gap-3 py-8!"
				>
					<UIcon
						name="i-lucide-upload"
						class="size-10 animate-bounce text-primary"
					/>
					<span class="text-sm! opacity-70">{{ validatingMessage }}</span>
				</div>
				<div
					v-else-if="succeeded"
					class="flex flex-col items-center gap-3 py-8"
				>
					<UIcon
						name="i-lucide-circle-check"
						class="size-14 text-success"
					/>
					<span class="text-base! font-medium!">Step complete!</span>
				</div>
			</template>

			<template v-else-if="category === 'distance_covered'">
				<UserQuestStepMDistance
					v-if="!submitting && !succeeded"
					:quest-id="quest.id"
					:step-index="step.index"
					:alt-index="step.altIndex"
					:target-meters="distanceTargetMeters"
					:disabled="!step.isCurrentQuest || !step.isUnlocked"
					:migration-signals="migrationSignals"
					@capture="submitDistance"
				/>
				<div
					v-else-if="submitting"
					class="flex flex-col items-center gap-3 py-8!"
				>
					<UIcon
						name="i-lucide-upload"
						class="size-10 animate-bounce text-primary"
					/>
					<span class="text-sm! opacity-70">{{ validatingMessage }}</span>
				</div>
				<div
					v-else-if="succeeded"
					class="flex flex-col items-center gap-3 py-8"
				>
					<UIcon
						name="i-lucide-circle-check"
						class="size-14 text-success"
					/>
					<span class="text-base! font-medium!">Step complete!</span>
				</div>
			</template>

			<template v-else>
				<div class="flex flex-col items-center gap-3 py-8 text-center opacity-60">
					<UIcon
						name="i-lucide-info"
						class="size-10"
					/>
					<span class="text-sm!">This step is completed through its dedicated interface.</span>
				</div>
			</template>

			<UAlert
				v-if="submitError"
				color="error"
				variant="soft"
				icon="i-lucide-triangle-alert"
				:description="submitError"
				class="w-full mt-2"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { DateTime } from 'luxon';
import { injectMissingExif } from '~/utils/exif';

const props = defineProps<{
	quest: Quest;
	progress?: (QuestProgressEntry | QuestProgressEntry[])[];
	step: QuestStep & {
		icon: string;
		completed: boolean;
		completedAt?: number;
		index: number;
		altIndex?: number;
		isCurrentQuest: boolean;
		isUnlocked: boolean;
	};
	// passed through to MDistance so cloud-side cancel signals reach the background runner.
	migrationSignals?: QuestMigrationSignal[];
}>();

const emit = defineEmits<{
	submitted: [];
}>();

const { user } = useAuth(makeMServerRequest);
const { require: requirePermission } = useQuestPermissions();

const { lat, lng, alt, fetchLocation } = useQuestGeolocation();
const isNative = computed(() => Capacitor.isNativePlatform());

const submitting = ref(false);
const succeeded = ref(false);
const submitError = ref('');

const validatingMessages = [
	'Submitting...',
	'Validating your submission...',
	'Checking the map...',
	'Consulting the elements...',
	'Adjusting the algorithm...',
	'Polishing the details...',
	'Counting the rewards...',
	'Checking the details...',
	'Reviewing the data...',
	'Double-checking your preferences...',
	'Almost there...'
];
const validatingMessage = ref(validatingMessages[0]);
let validatingInterval: ReturnType<typeof setInterval> | null = null;

watch(submitting, (loading) => {
	if (loading) {
		let i = 0;
		validatingMessage.value = validatingMessages[0];
		validatingInterval = setInterval(() => {
			i = (i + 1) % validatingMessages.length;
			validatingMessage.value = validatingMessages[i];
		}, 2500);
	} else if (validatingInterval) {
		clearInterval(validatingInterval);
		validatingInterval = null;
	}
});

onBeforeUnmount(() => {
	if (validatingInterval) clearInterval(validatingInterval);
});

// native override - capacitor > local shim
const nativeLat = ref<number | null>(null);
const nativeLng = ref<number | null>(null);
const nativeAlt = ref<number | null>(null);

async function fetchNativeLocation() {
	if (!isNative.value) return;
	try {
		const perm = await Geolocation.checkPermissions();
		if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
			const req = await Geolocation.requestPermissions({ permissions: ['location'] });
			if (req.location !== 'granted' && req.coarseLocation !== 'granted') return;
		}
		const pos = await Geolocation.getCurrentPosition({
			enableHighAccuracy: true,
			timeout: 8000,
			maximumAge: 60_000
		});
		nativeLat.value = pos.coords.latitude;
		nativeLng.value = pos.coords.longitude;
		nativeAlt.value = pos.coords.altitude ?? null;
	} catch {
		// Permission denied or no fix — fall back to whatever useGeolocation() yielded.
	}
}

const currentLat = computed(() =>
	nativeLat.value != null ? nativeLat.value : (lat.value as number | null)
);
const currentLng = computed(() =>
	nativeLng.value != null ? nativeLng.value : (lng.value as number | null)
);
const currentAlt = computed(() =>
	nativeAlt.value != null ? nativeAlt.value : (alt.value as number | null)
);

const category = computed(() => {
	switch (props.step.type) {
		case 'take_photo_location':
		case 'take_photo_classification':
		case 'take_photo_caption':
		case 'take_photo_objects':
		case 'take_photo_list':
		case 'take_photo_validation':
			return 'photo';
		case 'draw_picture':
			return 'draw_picture';
		case 'transcribe_audio':
			return 'audio';
		case 'match_terms':
			return 'match_terms';
		case 'order_items':
			return 'order_items';
		case 'describe_text':
			return 'describe_text';
		case 'scan_barcode':
			return 'scan_barcode';
		case 'distance_covered':
			return 'distance_covered';
		default:
			return props.step.type;
	}
});

type ScanKind = 'food' | 'music' | 'book' | 'beauty' | 'pet' | 'product' | 'vehicle' | 'flight';

const SCAN_KINDS: readonly ScanKind[] = [
	'food',
	'music',
	'book',
	'beauty',
	'pet',
	'product',
	'vehicle',
	'flight'
];

const scanKind = computed<ScanKind | undefined>(() => {
	if (props.step.type !== 'scan_barcode') return undefined;
	const raw = props.step.parameters?.[0];
	return SCAN_KINDS.includes(raw as ScanKind) ? (raw as ScanKind) : undefined;
});

const scanKeyword = computed<string | undefined>(() => {
	if (props.step.type !== 'scan_barcode') return undefined;
	const raw = props.step.parameters?.[1];
	return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
});

const distanceTargetMeters = computed<number>(() => {
	if (props.step.type !== 'distance_covered') return 0;
	const raw = Number(props.step.parameters?.[0]);
	return Number.isFinite(raw) && raw > 0 ? raw : 0;
});

const audioMinLength = computed<number | undefined>(() => {
	const raw = props.step.parameters?.[2];
	return typeof raw === 'number' && raw > 0 ? raw : undefined;
});

onMounted(() => {
	if (props.quest.permissions?.includes('location')) {
		fetchLocation();
		void fetchNativeLocation();
	}
});

function stepCompleteMessage(questCompleted: boolean): string {
	if (questCompleted) return 'Quest Complete! Nice work.';
	const reward = props.step.reward;
	return reward ? `Step complete! +${reward} bonus points` : 'Step complete!';
}

function notifyStepComplete(questCompleted = false) {
	void showInfoToast(stepCompleteMessage(questCompleted), { duration: 'short' });

	if (questCompleted) {
		// crust's celebration listener fires native haptics + the mobile overlay,
		// keyed on this global state — see initQuestCelebrationListener() in app.vue
		const { triggerCelebration } = useQuestCelebration();
		triggerCelebration({
			questTitle: props.quest.title,
			points: props.quest.reward,
			badgeIcon: props.quest.icon || 'mdi:trophy-award'
		});
	}
}

// match_terms / order_items / describe_text are completed inside their own crust child
// components, which only emit `submitted` on a validated response — confirm + forward.
function onDelegatedSubmitted() {
	notifyStepComplete();
	emit('submitted');
}

function formatTime(seconds: number) {
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hours > 0 && mins === 0 && secs === 0) return `${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	if (mins > 0 && secs === 0) return `${mins}m`;
	if (mins > 0) return `${mins}m ${secs}s`;

	return `${secs}s`;
}

async function submitPhoto(file: File) {
	if (!user.value) {
		submitError.value = 'Your account is still loading. Please try again in a moment.';
		return;
	}

	if (props.step.type === 'take_photo_location') {
		const locationOk = await requirePermission('location');
		if (!locationOk) {
			// requirePermission already shows a Dialog/Toast, but if both fail we
			// still need to surface something — otherwise the user just sees the
			// "Submit" tap dead-end with no feedback.
			submitError.value =
				'Location permission is required for this step. Enable it in settings to submit.';
			await showErrorToast(submitError.value, { duration: 'long' });
			return;
		}
		await fetchNativeLocation();
	}

	const { updateQuest } = useUser(user.value!.id, makeMServerRequest);

	submitError.value = '';
	submitting.value = true;
	try {
		const rawDataUrl = await fileToDataUrl(file);

		// Drawings must stay EXIF-free — cloud's validateDrawing rejects any
		// submission carrying Make/Model/Software/DateTimeOriginal as a photo
		// masquerading as a drawing. Only inject EXIF for actual photo steps.
		const needsExif = category.value === 'photo';
		const dataUrl = needsExif
			? await injectMissingExif(rawDataUrl, {
					location:
						currentLat.value != null && currentLng.value != null
							? {
									latitude: currentLat.value,
									longitude: currentLng.value,
									altitude: currentAlt.value
								}
							: null,
					platform: Capacitor.getPlatform()
				})
			: rawDataUrl;

		const res = await updateQuest(
			{
				type: props.step.type,
				index: props.step.index,
				...(props.step.altIndex !== undefined ? { altIndex: props.step.altIndex } : {}),
				dataUrl
			},
			currentLat.value,
			currentLng.value
		);

		if (res.validated) {
			succeeded.value = true;
			notifyStepComplete(res.completed);
			await new Promise((r) => setTimeout(r, 900));
			emit('submitted');
			return;
		}

		submitError.value = formatApiError(
			res.message,
			'We could not validate that submission. Please try again.'
		);
		await showErrorToast(submitError.value, { duration: 'long' });
	} catch (e: unknown) {
		submitError.value = formatApiError(e, 'Submission failed. Please try again.');
		await showErrorToast(submitError.value, { duration: 'long' });
	} finally {
		submitting.value = false;
	}
}

async function submitStepResponse(extra: Record<string, unknown>, validatingLabel: string) {
	useLogger().info('user.action', 'quest.step.submit', {
		stepType: props.step.type,
		stepIndex: props.step.index
	});

	if (!user.value) {
		submitError.value = 'Your account is still loading. Please try again in a moment.';
		return;
	}

	const { updateQuest } = useUser(user.value!.id, makeMServerRequest);

	submitError.value = '';
	submitting.value = true;
	try {
		const res = await updateQuest(
			{
				type: props.step.type,
				index: props.step.index,
				...(props.step.altIndex !== undefined ? { altIndex: props.step.altIndex } : {}),
				...extra
			},
			currentLat.value,
			currentLng.value
		);

		if (res.validated) {
			succeeded.value = true;
			notifyStepComplete(res.completed);
			await new Promise((r) => setTimeout(r, 900));
			emit('submitted');
			return;
		}

		submitError.value = formatApiError(
			res.message,
			`We could not validate that ${validatingLabel}. Please try again.`
		);
		await showErrorToast(submitError.value, { duration: 'long' });
	} catch (e: unknown) {
		submitError.value = formatApiError(e, 'Submission failed. Please try again.');
		await showErrorToast(submitError.value, { duration: 'long' });
	} finally {
		submitting.value = false;
	}
}

async function submitBarcode(payload: { data: string; format: number }) {
	await submitStepResponse({ data: payload.data, format: payload.format }, 'barcode');
}

async function submitDistance(distance: number) {
	await submitStepResponse({ distance }, 'distance');
}

function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

// completed step variables

const progress = computed(() => {
	if (!props.progress) return null;
	const prog = props.progress[props.step.index];
	if (!prog) return null;
	if (Array.isArray(prog)) {
		const altProg = prog.find((p) => p.altIndex === props.step.altIndex);
		return altProg || null;
	} else {
		return prog;
	}
});
const completedAt = computed(() => {
	if (!props.step.completedAt) return null;
	return DateTime.fromMillis(props.step.completedAt).toLocaleString(DateTime.DATETIME_SHORT);
});

const migratedMessage = computed(() => {
	const m = progress.value?.migrated;
	if (!m) return null;
	const at = DateTime.fromMillis(m.at).toLocaleString(DateTime.DATE_MED);
	const reasonText: Record<string, string> = {
		type_changed: `This step's requirements changed on ${at}; the original submission is no longer available.`,
		params_changed: `This step was adjusted on ${at}; the original submission is no longer available.`,
		step_removed: `This step was removed from the quest on ${at}.`,
		alt_removed: `This alternative was removed from the quest on ${at}.`,
		quest_deleted: `This quest is no longer available.`
	};
	return reasonText[m.reason] ?? `This step was migrated on ${at}.`;
});

const barcodeSubmission = computed<{ kind: string; title: string } | null>(() => {
	if (props.step.type !== 'scan_barcode') return null;
	const entry = progress.value as (QuestProgressEntry & { kind?: string; title?: string }) | null;
	if (!entry?.kind || !entry?.title) return null;
	return { kind: entry.kind, title: entry.title };
});

const barcodeKindIcon = computed(() => {
	switch (barcodeSubmission.value?.kind) {
		case 'food':
			return 'mdi:food';
		case 'music':
			return 'mdi:music';
		case 'book':
			return 'mdi:book-open-page-variant';
		case 'beauty':
			return 'mdi:lipstick';
		case 'pet':
			return 'mdi:paw';
		case 'product':
			return 'mdi:package-variant-closed';
		case 'vehicle':
			return 'mdi:car';
		case 'flight':
			return 'mdi:airplane';
		default:
			return 'mdi:barcode';
	}
});

const distanceSubmission = computed<number | null>(() => {
	if (props.step.type !== 'distance_covered') return null;
	const entry = progress.value as (QuestProgressEntry & { distance?: number }) | null;
	return typeof entry?.distance === 'number' && entry.distance > 0 ? entry.distance : null;
});

const describeSubmission = computed<string | null>(() => {
	if (props.step.type !== 'describe_text') return null;
	const entry = progress.value as (QuestProgressEntry & { text?: string }) | null;
	return typeof entry?.text === 'string' && entry.text.trim().length > 0 ? entry.text : null;
});

function formatDistance(meters: number): string {
	if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
	return `${Math.round(meters)} m`;
}

const stepArticle = ref<Article | undefined | null>(null);
const stepArticleLoadFailed = ref(false);

const stepArticleId = computed(() => {
	if (props.step.type !== 'article_quiz') return '';
	const prog = props.progress?.[props.step.index];
	if (!prog) return '';

	const scoreKey = Array.isArray(prog)
		? prog.find((p) => p.altIndex === props.step.altIndex)?.scoreKey || ''
		: prog.scoreKey || '';

	if (!scoreKey) return '';

	const [, , , articleId] = scoreKey.split(':');
	return articleId || '';
});

const ARTICLE_FETCH_TIMEOUT_MS = 10_000;

async function fetchStepArticle(articleId: string) {
	if (!articleId) {
		stepArticle.value = null;
		stepArticleLoadFailed.value = false;
		return;
	}

	stepArticleLoadFailed.value = false;
	stepArticle.value = null;
	const { article, fetch } = useArticle(articleId, makeMServerRequest);
	try {
		await Promise.race([
			fetch(),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('article fetch timed out')), ARTICLE_FETCH_TIMEOUT_MS)
			)
		]);
		if (article.value) {
			stepArticle.value = article.value;
		} else {
			stepArticleLoadFailed.value = true;
		}
	} catch {
		stepArticleLoadFailed.value = true;
	}
}

function retryStepArticleFetch() {
	const id = stepArticleId.value;
	if (id) void fetchStepArticle(id);
}

watch(stepArticleId, (id) => void fetchStepArticle(id), { immediate: true });
</script>
