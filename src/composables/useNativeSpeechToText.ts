import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

// mirrors crust's NativeSttTransport (useUtilities.ts); kept local to dodge deep imports
interface NativeSttTransport {
	isAvailable: () => Promise<boolean>;
	requestPermission: () => Promise<boolean>;
	start: (opts: {
		language: string;
		onPartial: (text: string) => void;
		onFinal: (text: string) => void;
	}) => Promise<void>;
	stop: () => Promise<void>;
}

// adapts the capgo speech-recognition plugin to crust's NativeSttTransport shape
export function useNativeSpeechToText(): NativeSttTransport {
	let partialHandle: PluginListenerHandle | null = null;
	let stateHandle: PluginListenerHandle | null = null;
	let onFinalCallback: ((text: string) => void) | null = null;
	let lastPartial = '';

	async function teardownListeners() {
		try {
			await partialHandle?.remove();
			await stateHandle?.remove();
		} catch {
			// best-effort
		}
		partialHandle = null;
		stateHandle = null;
	}

	return {
		isAvailable: async () => {
			if (!Capacitor.isNativePlatform()) return false;
			try {
				const result = await SpeechRecognition.available();
				return Boolean(result.available);
			} catch {
				return false;
			}
		},

		requestPermission: async () => {
			try {
				const perms = await SpeechRecognition.checkPermissions();
				if (perms.speechRecognition === 'granted') return true;
				const req = await SpeechRecognition.requestPermissions();
				if (req.speechRecognition === 'granted') return true;
				await showErrorToast(
					'Microphone permission is required to dictate. Enable it in Settings.'
				);
				return false;
			} catch (err) {
				await showErrorToast(err, {
					fallback: 'Could not request microphone permission.'
				});
				return false;
			}
		},

		start: async ({
			language,
			onPartial,
			onFinal
		}: {
			language: string;
			onPartial: (text: string) => void;
			onFinal: (text: string) => void;
		}) => {
			onFinalCallback = onFinal;
			lastPartial = '';

			partialHandle = await SpeechRecognition.addListener('partialResults', (data) => {
				const best = data.matches?.[0];
				if (best) {
					lastPartial = best;
					onPartial(best);
				}
			});

			stateHandle = await SpeechRecognition.addListener('listeningState', (data) => {
				if (data.status === 'stopped') {
					const finalText = lastPartial;
					lastPartial = '';
					const cb = onFinalCallback;
					onFinalCallback = null;
					void teardownListeners();
					if (cb) cb(finalText);
				}
			});

			try {
				await SpeechRecognition.start({
					language,
					partialResults: true,
					popup: false
				});
			} catch (err) {
				await teardownListeners();
				onFinalCallback = null;
				throw err;
			}
		},

		stop: async () => {
			try {
				await SpeechRecognition.stop();
			} catch {
				// listeningState 'stopped' may still fire; teardown will happen there
			}
		}
	};
}
