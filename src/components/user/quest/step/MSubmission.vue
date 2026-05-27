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
			v-else-if="!step.isCurrentStep && !step.completed"
			class="text-sm! text-neutral-500 mb-2!"
		>
			Complete previous steps to unlock this step.
		</h2>

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

				<div
					v-if="progress"
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
						v-else-if="category === 'article_quiz' && step.type === 'article_quiz' && stepArticle"
						class="flex flex-col items-center gap-3 py-4 px-6 border border-neutral-200 dark:border-neutral-700 rounded-lg"
					>
						<ArticleMCard :article="stepArticle" />
					</div>
				</div>

				<Score
					v-if="progress?.score"
					:score="progress.score"
				/>
				<Quote
					v-if="progress?.prompt"
					:text="progress.prompt"
				/>
			</div>

			<template v-else-if="category === 'photo'">
				<UserQuestStepCapture
					v-if="!isNative && !submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
					@capture="submitPhoto"
					@photo-taken="submitError = ''"
					@photo-rejected="submitError = ''"
				/>

				<UserQuestStepMCapture
					v-else-if="isNative && !submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
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
					<span class="text-sm opacity-70">Validating submission…</span>
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
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
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
					<span class="text-sm! opacity-70">Validating drawing…</span>
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
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
					:min-length="audioMinLength"
					@capture="submitPhoto"
				/>

				<UserQuestStepMRecord
					v-else-if="isNative && !submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
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
					<span class="text-sm! opacity-70">Validating recording…</span>
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
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
					@capture="emit('submitted')"
				/>
			</template>

			<template v-else-if="category === 'match_terms'">
				<UserQuestStepMatcher
					:step="step"
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
					:server-request="makeMServerRequest"
					@submitted="emit('submitted')"
				/>
			</template>

			<template v-else-if="category === 'order_items'">
				<UserQuestStepOrderer
					:step="step"
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
					:server-request="makeMServerRequest"
					@submitted="emit('submitted')"
				/>
			</template>

			<template v-else-if="category === 'scan_barcode'">
				<UserQuestStepMBarcode
					v-if="!submitting && !succeeded"
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
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
					<span class="text-sm! opacity-70">Validating barcode…</span>
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
					:disabled="!step.isCurrentQuest || !step.isCurrentStep"
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
					<span class="text-sm! opacity-70">Submitting distance…</span>
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
		isCurrentStep: boolean;
	};
}>();

const emit = defineEmits<{
	submitted: [];
}>();

const { user } = useAuth(makeMServerRequest);
const { require: requirePermission } = useQuestPermissions();

const { lat, lng, alt, fetchLocation } = useGeolocation();
const isNative = computed(() => Capacitor.isNativePlatform());

const submitting = ref(false);
const succeeded = ref(false);
const submitError = ref('');

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

const scanKind = computed<'food' | 'music' | 'book' | undefined>(() => {
	if (props.step.type !== 'scan_barcode') return undefined;
	const raw = props.step.parameters?.[0];
	return raw === 'food' || raw === 'music' || raw === 'book' ? raw : undefined;
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
		if (!locationOk) return;
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

const stepArticle = ref<Article | null>(null);

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

watch(
	stepArticleId,
	async (articleId) => {
		if (!articleId) {
			stepArticle.value = null;
			return;
		}

		const { article, fetch } = useArticle(articleId, makeMServerRequest);
		await fetch();
		stepArticle.value = article.value;
	},
	{ immediate: true }
);
</script>
