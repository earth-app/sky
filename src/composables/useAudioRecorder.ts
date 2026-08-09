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

export type AudioRecorderStage = 'permission' | 'ready' | 'recording' | 'preview' | 'error';

export const AUDIO_RECORDER = {
	MAX_DURATION_S: 300,
	AMPLITUDE_POLL_MS: 100,
	BAR_COUNT: 20,
	MIN_BAR_PX: 4,
	MAX_BAR_PX: 52,
	AMPLITUDE_GAMMA: 0.6
} as const;

const OFF_NATIVE_MESSAGE = 'Native audio recording is only available in the mobile app.';

export function shapeAmplitude(raw: number): number {
	const clamped = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
	const shaped = Math.pow(clamped, AUDIO_RECORDER.AMPLITUDE_GAMMA);
	return (
		AUDIO_RECORDER.MIN_BAR_PX + shaped * (AUDIO_RECORDER.MAX_BAR_PX - AUDIO_RECORDER.MIN_BAR_PX)
	);
}

export function formatRecordingTime(seconds: number): string {
	const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
	return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function extractRecordingFilename(uri: string): string {
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

export interface UseAudioRecorderOptions {
	/** Seconds the user must record before the stop button unlocks. */
	minLength: () => number;
	disabled: () => boolean;
	onCapture: (file: File) => void;
}

export function useAudioRecorder(options: UseAudioRecorderOptions) {
	const { notifyDenied } = useQuestPermissions();

	const stage = ref<AudioRecorderStage>('permission');
	const errorMsg = ref('');
	const elapsed = ref(0);
	const bars = ref<number[]>(Array(AUDIO_RECORDER.BAR_COUNT).fill(AUDIO_RECORDER.MIN_BAR_PX));
	const previewUrl = ref('');
	const previewFile = ref<File | null>(null);
	const recordedUri = ref<string | null>(null);

	const canStop = computed(() => elapsed.value >= options.minLength());
	const stopCountdown = computed(() => Math.max(0, Math.ceil(options.minLength() - elapsed.value)));

	let errorListener: PluginListenerHandle | null = null;
	let elapsedTimer: ReturnType<typeof setInterval> | null = null;
	let amplitudeTimer: ReturnType<typeof setInterval> | null = null;

	function failOffNative() {
		stage.value = 'error';
		errorMsg.value = OFF_NATIVE_MESSAGE;
	}

	async function requestPermission() {
		if (!Capacitor.isNativePlatform()) {
			failOffNative();
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

	async function init() {
		if (!Capacitor.isNativePlatform()) {
			failOffNative();
			return;
		}

		try {
			errorListener = await CapacitorAudioRecorder.addListener('recordingError', onRecordingError);
		} catch {
			// non-fatal; stopRecording's catch still surfaces a failed take
		}

		// fire the OS prompt as the step opens; entering the step is already the opt-in
		try {
			const current = await CapacitorAudioRecorder.checkPermissions();
			if (current.recordAudio === 'granted') {
				stage.value = 'ready';
				return;
			}
		} catch {
			// fall through to the explicit request
		}
		await requestPermission();
	}

	async function dispose() {
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
	}

	async function startRecording() {
		if (options.disabled()) return;
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
			errorMsg.value = formatApiError(
				e,
				'Recording was saved but could not be loaded for preview.'
			);
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
		if (options.disabled() || !previewFile.value) return;
		options.onCapture(previewFile.value);
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
			if (elapsed.value >= AUDIO_RECORDER.MAX_DURATION_S) {
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
				// skip this tick; a transient bridge error should not kill the meter
			}
		}, AUDIO_RECORDER.AMPLITUDE_POLL_MS);
	}

	function stopAmplitudePolling() {
		if (amplitudeTimer) {
			clearInterval(amplitudeTimer);
			amplitudeTimer = null;
		}
	}

	function pushAmplitude(raw: number) {
		bars.value = [...bars.value.slice(1), shapeAmplitude(raw)];
	}

	function resetMeter() {
		bars.value = Array(AUDIO_RECORDER.BAR_COUNT).fill(AUDIO_RECORDER.MIN_BAR_PX);
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
			// best-effort: temp files are sandboxed and the OS clears them
		}
	}

	async function uriToFile(uri: string): Promise<File> {
		const filename = extractRecordingFilename(uri) || `recording-${Date.now()}.m4a`;
		const mime = 'audio/mp4';

		const read = await Filesystem.readFile({ path: uri });
		const base64 = typeof read.data === 'string' ? read.data : await blobToBase64(read.data);
		const blob = base64ToBlob(base64, mime);
		return new File([blob], filename, { type: mime });
	}

	return {
		stage,
		errorMsg,
		elapsed,
		bars,
		previewUrl,
		previewFile,
		canStop,
		stopCountdown,
		init,
		dispose,
		requestPermission,
		startRecording,
		stopRecording,
		retake,
		confirm,
		formatTime: formatRecordingTime
	};
}
