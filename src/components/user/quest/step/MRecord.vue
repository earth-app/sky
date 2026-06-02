<template>
	<div
		class="relative flex flex-col items-center w-full! min-h-80! rounded-2xl! overflow-hidden! bg-neutral-950 border-4! border-neutral-900/50!"
	>
		<div
			v-if="stage === 'permission'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5! p-8! text-center!"
		>
			<div
				class="w-20 h-20 rounded-full border-2 border-primary flex items-center justify-center animate-mic-pulse"
			>
				<UIcon
					name="i-lucide-mic"
					class="text-3xl text-primary"
				/>
			</div>
			<p class="text-[0.8rem]! font-semibold! tracking-[0.12em] uppercase text-neutral-100!">
				Microphone Access Required
			</p>
			<p class="text-[0.72rem]! text-neutral-500! leading-[1.65]!">
				Direct microphone only.<br />No file uploads permitted.
			</p>
			<button
				class="mt-2! px-6! py-2.5! rounded-xl! bg-neutral-800! text-white text-sm! font-medium! tracking-wide!"
				@click="requestPermission"
			>
				Enable Microphone
			</button>
		</div>

		<div
			v-else-if="stage === 'error'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5! p-8! text-center!"
		>
			<UIcon
				name="i-lucide-mic-off"
				class="size-14 text-red-400"
			/>
			<p class="text-sm! font-medium! text-red-400!">Microphone Unavailable</p>
			<p class="text-xs! text-neutral-500! leading-relaxed!">{{ errorMsg }}</p>
			<button
				class="mt-2! px-6! py-2! rounded-xl! border border-neutral-700 text-white text-sm!"
				@click="requestPermission"
			>
				Try Again
			</button>
		</div>

		<div
			v-else-if="stage === 'ready' || stage === 'recording'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
		>
			<div class="flex items-end gap-1 h-14">
				<span
					v-for="i in BAR_COUNT"
					:key="i"
					class="w-1 rounded-full bg-primary transition-all duration-75"
					:style="{
						height: stage === 'recording' ? `${bars[i - 1] || MIN_BAR_PX}px` : '5px',
						opacity: stage === 'recording' ? 1 : 0.25
					}"
				/>
			</div>

			<span
				v-if="stage === 'recording'"
				class="text-3xl! font-mono! text-white! tabular-nums!"
				>{{ formatTime(elapsed) }}</span
			>
			<span
				v-else
				class="text-sm! text-neutral-500!"
				>Tap to Start</span
			>

			<span
				v-if="stage === 'recording' && !canStop"
				class="-mt-4! text-[0.72rem]! text-neutral-500! tabular-nums!"
				>Keep Recording - {{ stopCountdown }}s left</span
			>

			<button
				v-if="stage === 'recording'"
				class="size-16! rounded-full! border-4! flex items-center justify-center! transition-all!"
				:class="
					canStop
						? 'border-red-500! active:scale-90 cursor-pointer'
						: 'border-red-500/30 opacity-40 cursor-not-allowed'
				"
				:disabled="!canStop"
				@click="stopRecording"
			>
				<span class="w-5 h-5 bg-red-500 rounded-sm" />
			</button>
			<button
				v-else
				class="size-16! rounded-full! border-4! flex items-center justify-center! transition-all!"
				:class="
					props.disabled
						? 'border-primary/30 opacity-40 cursor-not-allowed'
						: 'border-primary active:scale-90 cursor-pointer'
				"
				:disabled="props.disabled"
				@click="startRecording"
			>
				<span class="w-5 h-5 bg-primary rounded-full" />
			</button>
		</div>

		<div
			v-else-if="stage === 'preview'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5! p-8!"
		>
			<UIcon
				name="i-lucide-audio-waveform"
				class="size-12 text-primary"
			/>
			<span class="text-sm! text-neutral-300!">{{ formatTime(elapsed) }} recorded</span>
			<audio
				:src="previewUrl"
				controls
				class="w-full! rounded-lg!"
			/>
			<div class="flex gap-4! mt-1!">
				<button
					class="px-5! py-2! rounded-xl! border border-red-500/50 text-red-400 text-sm! active:scale-95 transition-transform!"
					@click="retake"
				>
					Retake
				</button>
				<button
					class="px-5! py-2! rounded-xl! font-semibold! text-sm! transition-all!"
					:class="
						props.disabled
							? 'bg-success/30 text-neutral-600 cursor-not-allowed'
							: 'bg-success text-neutral-900 active:scale-95 cursor-pointer'
					"
					:disabled="props.disabled"
					@click="confirm"
				>
					Confirm
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import {
	AudioSessionCategoryOption,
	AudioSessionMode,
	CapacitorAudioRecorder,
	RecordingStatus,
	type RecordingErrorEvent,
	type StopRecordingResult
} from '@capgo/capacitor-audio-recorder';

type Stage = 'permission' | 'ready' | 'recording' | 'preview' | 'error';

const props = withDefaults(defineProps<{ disabled?: boolean; minLength?: number }>(), {
	minLength: 10
});
const emit = defineEmits<{ capture: [file: File] }>();

const { notifyDenied } = useQuestPermissions();

const MAX_DURATION_S = 300;
const AMPLITUDE_POLL_MS = 100;
const BAR_COUNT = 20;
const MIN_BAR_PX = 4;
const MAX_BAR_PX = 52;
const AMPLITUDE_GAMMA = 0.6;

const stage = ref<Stage>('permission');
const errorMsg = ref('');
const elapsed = ref(0);
const bars = ref<number[]>(Array(BAR_COUNT).fill(MIN_BAR_PX));
const previewUrl = ref('');
const previewFile = ref<File | null>(null);
const recordedUri = ref<string | null>(null);

const canStop = computed(() => elapsed.value >= props.minLength);
const stopCountdown = computed(() => Math.max(0, Math.ceil(props.minLength - elapsed.value)));

let errorListener: PluginListenerHandle | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let amplitudeTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
	if (!Capacitor.isNativePlatform()) {
		stage.value = 'error';
		errorMsg.value = 'Native audio recording is only available in the mobile app.';
		return;
	}

	try {
		errorListener = await CapacitorAudioRecorder.addListener('recordingError', onRecordingError);
	} catch {
		// listener attach failure is non-fatal; recording errors will surface via the catch in stopRecording instead.
	}

	// Fire the OS prompt as the step opens rather than gating it behind an
	// "Enable Microphone" button — the user already opted in by entering the
	// audio step, so the second tap is friction without benefit.
	try {
		const current = await CapacitorAudioRecorder.checkPermissions();
		if (current.recordAudio === 'granted') {
			stage.value = 'ready';
			return;
		}
	} catch {
		// Fall through to the explicit request below.
	}
	await requestPermission();
});

onBeforeUnmount(async () => {
	stopAmplitudePolling();
	stopElapsedTimer();

	if (errorListener) {
		try {
			await errorListener.remove();
		} catch {
			// best-effort
		}
		errorListener = null;
	}

	try {
		const { status } = await CapacitorAudioRecorder.getRecordingStatus();
		if (status !== RecordingStatus.Inactive) {
			await CapacitorAudioRecorder.cancelRecording();
		}
	} catch {
		// best-effort
	}

	revokePreview();
	await deleteRecordedFile();
});

async function requestPermission() {
	if (!Capacitor.isNativePlatform()) {
		stage.value = 'error';
		errorMsg.value = 'Native audio recording is only available in the mobile app.';
		return;
	}

	try {
		const result = await CapacitorAudioRecorder.requestPermissions();
		if (result.recordAudio === 'granted') {
			errorMsg.value = '';
			stage.value = 'ready';
			return;
		}
		stage.value = 'error';
		errorMsg.value =
			'Microphone access is required to complete this quest step. Please allow it in your device settings.';
		await notifyDenied('record');
	} catch (e) {
		stage.value = 'error';
		errorMsg.value = formatApiError(e, 'Unable to access your microphone. Please try again.');
	}
}

async function startRecording() {
	if (props.disabled) return;
	if (stage.value !== 'ready') return;

	resetMeter();
	elapsed.value = 0;

	try {
		await CapacitorAudioRecorder.startRecording({
			audioSessionMode: AudioSessionMode.Measurement,
			audioSessionCategoryOptions: [
				AudioSessionCategoryOption.AllowBluetooth,
				AudioSessionCategoryOption.DefaultToSpeaker
			]
		});
	} catch (e) {
		stage.value = 'error';
		errorMsg.value = formatApiError(e, 'Could not start recording. Please try again.');
		return;
	}

	stage.value = 'recording';
	startElapsedTimer();
	startAmplitudePolling();
}

async function stopRecording() {
	if (stage.value !== 'recording') return;

	stopAmplitudePolling();
	stopElapsedTimer();

	let result: StopRecordingResult;
	try {
		result = await CapacitorAudioRecorder.stopRecording();
	} catch (e) {
		stage.value = 'error';
		errorMsg.value = formatApiError(e, 'Recording could not be saved. Please try again.');
		return;
	}

	const uri = result.uri;
	if (!uri) {
		stage.value = 'error';
		errorMsg.value = 'Recording finished but no audio file was produced.';
		return;
	}

	recordedUri.value = uri;

	try {
		const file = await uriToFile(uri);
		previewFile.value = file;
		previewUrl.value = Capacitor.convertFileSrc(uri);
		if (typeof result.duration === 'number' && Number.isFinite(result.duration)) {
			elapsed.value = Math.round(result.duration / 1000);
		}
		stage.value = 'preview';
	} catch (e) {
		stage.value = 'error';
		errorMsg.value = formatApiError(e, 'Recording was saved but could not be loaded for preview.');
	}
}

async function retake() {
	revokePreview();
	await deleteRecordedFile();
	previewFile.value = null;
	elapsed.value = 0;
	resetMeter();
	stage.value = 'ready';
}

function confirm() {
	if (props.disabled || !previewFile.value) return;
	emit('capture', previewFile.value);
}

function onRecordingError(event: RecordingErrorEvent) {
	stopAmplitudePolling();
	stopElapsedTimer();
	stage.value = 'error';
	errorMsg.value =
		event.message?.trim() ||
		'Recording was interrupted. Make sure no other app is using the microphone.';
}

function startElapsedTimer() {
	stopElapsedTimer();
	elapsedTimer = setInterval(() => {
		elapsed.value += 1;
		if (elapsed.value >= MAX_DURATION_S) {
			void stopRecording();
		}
	}, 1000);
}

function stopElapsedTimer() {
	if (elapsedTimer) {
		clearInterval(elapsedTimer);
		elapsedTimer = null;
	}
}

function startAmplitudePolling() {
	stopAmplitudePolling();
	amplitudeTimer = setInterval(async () => {
		try {
			const { value } = await CapacitorAudioRecorder.getCurrentAmplitude();
			pushAmplitude(value);
		} catch {
			// Skip this tick — transient bridge errors should not kill the meter.
		}
	}, AMPLITUDE_POLL_MS);
}

function stopAmplitudePolling() {
	if (amplitudeTimer) {
		clearInterval(amplitudeTimer);
		amplitudeTimer = null;
	}
}

function pushAmplitude(raw: number) {
	const clamped = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
	const shaped = Math.pow(clamped, AMPLITUDE_GAMMA);
	const height = MIN_BAR_PX + shaped * (MAX_BAR_PX - MIN_BAR_PX);
	bars.value = [...bars.value.slice(1), height];
}

function resetMeter() {
	bars.value = Array(BAR_COUNT).fill(MIN_BAR_PX);
}

function revokePreview() {
	previewUrl.value = '';
}

async function deleteRecordedFile() {
	const uri = recordedUri.value;
	if (!uri) return;
	recordedUri.value = null;
	try {
		await Filesystem.deleteFile({ path: uri });
	} catch {
		// best-effort — temp files are scoped to the app sandbox and will be cleared by the OS.
	}
}

async function uriToFile(uri: string): Promise<File> {
	const filename = extractFilename(uri) || `recording-${Date.now()}.m4a`;
	const mime = 'audio/mp4';

	const read = await Filesystem.readFile({ path: uri });
	const base64 = typeof read.data === 'string' ? read.data : await blobToBase64(read.data);
	const blob = base64ToBlob(base64, mime);
	return new File([blob], filename, { type: mime });
}

function extractFilename(uri: string): string {
	const trimmed = uri.split('?')[0]?.split('#')[0] ?? '';
	const idx = trimmed.lastIndexOf('/');
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function base64ToBlob(base64: string, mime: string): Blob {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}

async function blobToBase64(data: Blob): Promise<string> {
	const bytes = new Uint8Array(await data.arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
	return btoa(binary);
}

function formatTime(s: number) {
	return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
</script>

<style scoped>
@keyframes mic-pulse {
	0%,
	100% {
		box-shadow: 0 0 0 0 rgb(var(--color-primary) / 0.3);
	}
	50% {
		box-shadow: 0 0 0 14px rgb(var(--color-primary) / 0);
	}
}
.animate-mic-pulse {
	animation: mic-pulse 2s ease-in-out infinite;
}
</style>
