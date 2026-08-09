import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
	isNative: vi.fn(() => true),
	convertFileSrc: vi.fn((uri: string) => `capacitor://localhost/_capacitor_file_${uri}`)
}));

const recorder = vi.hoisted(() => ({
	addListener: vi.fn(),
	checkPermissions: vi.fn(),
	requestPermissions: vi.fn(),
	startRecording: vi.fn(),
	stopRecording: vi.fn(),
	cancelRecording: vi.fn(),
	getRecordingStatus: vi.fn(),
	getCurrentAmplitude: vi.fn()
}));

const fs = vi.hoisted(() => ({ readFile: vi.fn(), deleteFile: vi.fn() }));
const notifyDenied = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: cap.isNative, convertFileSrc: cap.convertFileSrc },
	registerPlugin: () => recorder
}));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: fs }));
// real enums, mocked plugin surface
vi.mock('@capgo/capacitor-audio-recorder', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	CapacitorAudioRecorder: recorder
}));
vi.mock('~/composables/useQuestPermissions', () => ({
	useQuestPermissions: () => ({ notifyDenied })
}));

import { RecordingStatus } from '@capgo/capacitor-audio-recorder';
import {
	AUDIO_RECORDER,
	extractRecordingFilename,
	formatRecordingTime,
	shapeAmplitude,
	useAudioRecorder
} from '~/composables/useAudioRecorder';

const OFF_NATIVE = 'Native audio recording is only available in the mobile app.';
const AUDIO_BASE64 = btoa('fake-m4a-bytes');

const onCapture = vi.fn();
let minLength = 10;
let disabled = false;

function makeRecorder() {
	return useAudioRecorder({
		minLength: () => minLength,
		disabled: () => disabled,
		onCapture
	});
}

/** init -> ready -> recording, so the recording-stage cases start where they mean to. */
async function recording() {
	const r = makeRecorder();
	await r.init();
	await r.startRecording();
	expect(r.stage.value).toBe('recording');
	return r;
}

function listenerHandler(): (event: { message?: string }) => void {
	const call = recorder.addListener.mock.calls.find((c) => c[0] === 'recordingError');
	if (!call) throw new Error('recordingError listener was never attached');
	return call[1] as (event: { message?: string }) => void;
}

beforeEach(() => {
	vi.clearAllMocks();
	minLength = 10;
	disabled = false;
	cap.isNative.mockReturnValue(true);
	recorder.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
	recorder.checkPermissions.mockResolvedValue({ recordAudio: 'granted' });
	recorder.requestPermissions.mockResolvedValue({ recordAudio: 'granted' });
	recorder.startRecording.mockResolvedValue(undefined);
	recorder.stopRecording.mockResolvedValue({ uri: '/tmp/rec/take-1.m4a', duration: 12_400 });
	recorder.cancelRecording.mockResolvedValue(undefined);
	recorder.getRecordingStatus.mockResolvedValue({ status: RecordingStatus.Inactive });
	recorder.getCurrentAmplitude.mockResolvedValue({ value: 0.5 });
	fs.readFile.mockResolvedValue({ data: AUDIO_BASE64 });
	fs.deleteFile.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('shapeAmplitude', () => {
	it('spans the bar range and clamps anything outside 0..1', () => {
		expect(shapeAmplitude(0)).toBe(AUDIO_RECORDER.MIN_BAR_PX);
		expect(shapeAmplitude(1)).toBeCloseTo(AUDIO_RECORDER.MAX_BAR_PX);
		expect(shapeAmplitude(-5)).toBe(AUDIO_RECORDER.MIN_BAR_PX);
		expect(shapeAmplitude(9)).toBeCloseTo(AUDIO_RECORDER.MAX_BAR_PX);
	});

	it('treats a non-finite reading as silence rather than NaN-ing the meter', () => {
		expect(shapeAmplitude(Number.NaN)).toBe(AUDIO_RECORDER.MIN_BAR_PX);
		expect(shapeAmplitude(Number.POSITIVE_INFINITY)).toBe(AUDIO_RECORDER.MIN_BAR_PX);
	});

	it('is monotonic and lifts quiet input above linear (that is the point of the gamma)', () => {
		expect(shapeAmplitude(0.25)).toBeLessThan(shapeAmplitude(0.5));
		const linear =
			AUDIO_RECORDER.MIN_BAR_PX + 0.1 * (AUDIO_RECORDER.MAX_BAR_PX - AUDIO_RECORDER.MIN_BAR_PX);
		expect(shapeAmplitude(0.1)).toBeGreaterThan(linear);
	});
});

describe('formatRecordingTime', () => {
	it('is zero-padded mm:ss', () => {
		expect(formatRecordingTime(0)).toBe('00:00');
		expect(formatRecordingTime(9)).toBe('00:09');
		expect(formatRecordingTime(65)).toBe('01:05');
		expect(formatRecordingTime(600)).toBe('10:00');
	});

	it('never renders a negative or NaN clock', () => {
		expect(formatRecordingTime(-3)).toBe('00:00');
		expect(formatRecordingTime(Number.NaN)).toBe('00:00');
	});
});

describe('extractRecordingFilename', () => {
	it('takes the last path segment without query or fragment', () => {
		expect(extractRecordingFilename('/var/tmp/rec/take-1.m4a')).toBe('take-1.m4a');
		expect(extractRecordingFilename('file:///a/b/c.m4a?v=2#t')).toBe('c.m4a');
		expect(extractRecordingFilename('take-1.m4a')).toBe('take-1.m4a');
		expect(extractRecordingFilename('')).toBe('');
	});
});

describe('permission stage', () => {
	it('reports the off-native case without touching the plugin', async () => {
		cap.isNative.mockReturnValue(false);
		const r = makeRecorder();
		await r.init();
		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toBe(OFF_NATIVE);
		expect(recorder.checkPermissions).not.toHaveBeenCalled();

		await r.requestPermission();
		expect(recorder.requestPermissions).not.toHaveBeenCalled();
	});

	it('goes straight to ready on an existing grant, without re-prompting', async () => {
		const r = makeRecorder();
		await r.init();
		expect(r.stage.value).toBe('ready');
		expect(recorder.requestPermissions).not.toHaveBeenCalled();
	});

	it('prompts when the permission is not yet granted', async () => {
		recorder.checkPermissions.mockResolvedValue({ recordAudio: 'prompt' });
		const r = makeRecorder();
		await r.init();
		expect(recorder.requestPermissions).toHaveBeenCalledOnce();
		expect(r.stage.value).toBe('ready');
	});

	it('falls back to an explicit request when checkPermissions itself throws', async () => {
		recorder.checkPermissions.mockRejectedValue(new Error('no such method'));
		const r = makeRecorder();
		await r.init();
		expect(recorder.requestPermissions).toHaveBeenCalledOnce();
		expect(r.stage.value).toBe('ready');
	});

	it('errors and points at Settings when the user refuses', async () => {
		recorder.checkPermissions.mockResolvedValue({ recordAudio: 'prompt' });
		recorder.requestPermissions.mockResolvedValue({ recordAudio: 'denied' });
		const r = makeRecorder();
		await r.init();
		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toContain('device settings');
		expect(notifyDenied).toHaveBeenCalledWith('record');
	});

	it('surfaces a thrown permission request as a readable error', async () => {
		recorder.requestPermissions.mockRejectedValue(new Error('microphone is in use'));
		const r = makeRecorder();
		await r.requestPermission();
		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toBe('microphone is in use');
	});

	it('falls back to generic copy when the thrown value carries no message', async () => {
		recorder.requestPermissions.mockRejectedValue(undefined);
		const r = makeRecorder();
		await r.requestPermission();
		expect(r.errorMsg.value).toBe('Unable to access your microphone. Please try again.');
	});

	it('clears a previous error when a retry is granted', async () => {
		recorder.requestPermissions.mockRejectedValueOnce(new Error('microphone is in use'));
		const r = makeRecorder();
		await r.requestPermission();
		expect(r.errorMsg.value).not.toBe('');

		await r.requestPermission();
		expect(r.stage.value).toBe('ready');
		expect(r.errorMsg.value).toBe('');
	});

	it('still reaches ready when the error listener cannot be attached', async () => {
		recorder.addListener.mockRejectedValue(new Error('no listener support'));
		const r = makeRecorder();
		await r.init();
		expect(r.stage.value).toBe('ready');
	});
});

describe('minLength gate', () => {
	it('locks the stop button until the minimum has elapsed', async () => {
		vi.useFakeTimers();
		const r = await recording();
		expect(r.canStop.value).toBe(false);
		expect(r.stopCountdown.value).toBe(10);

		await vi.advanceTimersByTimeAsync(9_000);
		expect(r.elapsed.value).toBe(9);
		expect(r.canStop.value).toBe(false);
		expect(r.stopCountdown.value).toBe(1);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(r.canStop.value).toBe(true);
		expect(r.stopCountdown.value).toBe(0);
	});

	it('never shows a negative countdown once past the minimum', async () => {
		vi.useFakeTimers();
		const r = await recording();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(r.stopCountdown.value).toBe(0);
	});

	it('unlocks immediately when the step sets no minimum', async () => {
		minLength = 0;
		const r = await recording();
		expect(r.canStop.value).toBe(true);
	});
});

describe('recording stage', () => {
	it('refuses to start while disabled or from any stage but ready', async () => {
		disabled = true;
		const blocked = makeRecorder();
		await blocked.init();
		await blocked.startRecording();
		expect(recorder.startRecording).not.toHaveBeenCalled();
		expect(blocked.stage.value).toBe('ready');

		disabled = false;
		const fresh = makeRecorder();
		// still on the permission stage
		await fresh.startRecording();
		expect(recorder.startRecording).not.toHaveBeenCalled();
	});

	it('errors when the recorder will not start', async () => {
		recorder.startRecording.mockRejectedValue(new Error('audio session is busy'));
		const r = makeRecorder();
		await r.init();
		await r.startRecording();
		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toBe('audio session is busy');
	});

	it('drives the meter from polled amplitudes', async () => {
		vi.useFakeTimers();
		const r = await recording();
		const before = [...r.bars.value];

		recorder.getCurrentAmplitude.mockResolvedValue({ value: 1 });
		await vi.advanceTimersByTimeAsync(AUDIO_RECORDER.AMPLITUDE_POLL_MS);
		expect(r.bars.value).toHaveLength(AUDIO_RECORDER.BAR_COUNT);
		expect(r.bars.value.at(-1)).toBeCloseTo(AUDIO_RECORDER.MAX_BAR_PX);
		expect(r.bars.value).not.toEqual(before);
	});

	it('keeps polling through a transient amplitude read failure', async () => {
		vi.useFakeTimers();
		const r = await recording();
		recorder.getCurrentAmplitude.mockRejectedValueOnce(new Error('bridge hiccup'));

		await vi.advanceTimersByTimeAsync(AUDIO_RECORDER.AMPLITUDE_POLL_MS * 2);
		expect(r.stage.value).toBe('recording');
		expect(recorder.getCurrentAmplitude).toHaveBeenCalledTimes(2);
	});

	it('auto-stops at the maximum duration', async () => {
		vi.useFakeTimers();
		const r = await recording();
		await vi.advanceTimersByTimeAsync(AUDIO_RECORDER.MAX_DURATION_S * 1000);
		expect(recorder.stopRecording).toHaveBeenCalledOnce();
		expect(r.stage.value).toBe('preview');
	});

	it('lands in error and stops the timers when the recording is interrupted', async () => {
		vi.useFakeTimers();
		const r = await recording();
		listenerHandler()({ message: '  Interrupted by a phone call  ' });

		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toBe('Interrupted by a phone call');

		const frozen = r.elapsed.value;
		await vi.advanceTimersByTimeAsync(5_000);
		expect(r.elapsed.value).toBe(frozen);
		expect(recorder.getCurrentAmplitude).not.toHaveBeenCalled();
	});

	it('uses default interruption copy when the event carries no message', async () => {
		const r = await recording();
		listenerHandler()({ message: '   ' });
		expect(r.errorMsg.value).toContain('no other app is using the microphone');
	});
});

describe('stop and preview', () => {
	it('ignores a stop that is not from the recording stage', async () => {
		const r = makeRecorder();
		await r.init();
		await r.stopRecording();
		expect(recorder.stopRecording).not.toHaveBeenCalled();
		expect(r.stage.value).toBe('ready');
	});

	it('builds a previewable m4a file and takes the duration from the plugin', async () => {
		const r = await recording();
		await r.stopRecording();

		expect(r.stage.value).toBe('preview');
		expect(r.elapsed.value).toBe(12);
		expect(r.previewUrl.value).toBe(cap.convertFileSrc('/tmp/rec/take-1.m4a'));
		expect(r.previewFile.value).toBeInstanceOf(File);
		expect(r.previewFile.value!.name).toBe('take-1.m4a');
		expect(r.previewFile.value!.type).toBe('audio/mp4');
		expect(r.previewFile.value!.size).toBe(atob(AUDIO_BASE64).length);
	});

	it('keeps the ticked elapsed value when the plugin reports no usable duration', async () => {
		vi.useFakeTimers();
		recorder.stopRecording.mockResolvedValue({ uri: '/tmp/rec/take-1.m4a' });
		const r = await recording();
		await vi.advanceTimersByTimeAsync(11_000);
		await r.stopRecording();
		expect(r.elapsed.value).toBe(11);
	});

	it('errors when the plugin throws on stop', async () => {
		recorder.stopRecording.mockRejectedValue(new Error('encoder failed'));
		const r = await recording();
		await r.stopRecording();
		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toBe('encoder failed');
	});

	it('errors when the recording produced no file', async () => {
		recorder.stopRecording.mockResolvedValue({ uri: '', duration: 5000 });
		const r = await recording();
		await r.stopRecording();
		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toBe('Recording finished but no audio file was produced.');
	});

	it('errors when the saved file cannot be read back for preview', async () => {
		fs.readFile.mockRejectedValue(new Error('file not found'));
		const r = await recording();
		await r.stopRecording();
		expect(r.stage.value).toBe('error');
		expect(r.errorMsg.value).toBe('file not found');
	});

	it('accepts a blob payload from the filesystem bridge', async () => {
		fs.readFile.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]) });
		const r = await recording();
		await r.stopRecording();
		expect(r.stage.value).toBe('preview');
		expect(r.previewFile.value!.size).toBe(3);
	});
});

describe('retake and confirm', () => {
	it('retake clears the take, deletes the temp file and returns to ready', async () => {
		const r = await recording();
		await r.stopRecording();
		await r.retake();

		expect(r.stage.value).toBe('ready');
		expect(r.previewFile.value).toBeNull();
		expect(r.previewUrl.value).toBe('');
		expect(r.elapsed.value).toBe(0);
		expect(r.bars.value).toEqual(Array(AUDIO_RECORDER.BAR_COUNT).fill(AUDIO_RECORDER.MIN_BAR_PX));
		expect(fs.deleteFile).toHaveBeenCalledWith({ path: '/tmp/rec/take-1.m4a' });
	});

	it('retake survives a failed delete', async () => {
		fs.deleteFile.mockRejectedValue(new Error('already gone'));
		const r = await recording();
		await r.stopRecording();
		await expect(r.retake()).resolves.toBeUndefined();
		expect(r.stage.value).toBe('ready');
	});

	it('confirm hands the file to the caller exactly once per take', async () => {
		const r = await recording();
		await r.stopRecording();
		r.confirm();
		expect(onCapture).toHaveBeenCalledWith(r.previewFile.value);
	});

	it('confirm is inert while disabled or with nothing recorded', async () => {
		const empty = makeRecorder();
		empty.confirm();
		expect(onCapture).not.toHaveBeenCalled();

		const r = await recording();
		await r.stopRecording();
		disabled = true;
		r.confirm();
		expect(onCapture).not.toHaveBeenCalled();
	});
});

describe('dispose', () => {
	it('detaches the listener, cancels a live recording and removes the temp file', async () => {
		const remove = vi.fn(async () => {});
		recorder.addListener.mockResolvedValue({ remove });
		recorder.getRecordingStatus.mockResolvedValue({ status: RecordingStatus.Recording });

		const r = await recording();
		await r.stopRecording();
		await r.dispose();

		expect(remove).toHaveBeenCalledOnce();
		expect(recorder.cancelRecording).toHaveBeenCalledOnce();
		expect(fs.deleteFile).toHaveBeenCalledWith({ path: '/tmp/rec/take-1.m4a' });
	});

	it('does not cancel when nothing is recording', async () => {
		const r = await recording();
		await r.stopRecording();
		await r.dispose();
		expect(recorder.cancelRecording).not.toHaveBeenCalled();
	});

	it('stops the elapsed timer so a torn-down step cannot keep counting', async () => {
		vi.useFakeTimers();
		const r = await recording();
		await r.dispose();
		const frozen = r.elapsed.value;
		await vi.advanceTimersByTimeAsync(5_000);
		expect(r.elapsed.value).toBe(frozen);
	});
});
