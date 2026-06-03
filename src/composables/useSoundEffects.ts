// synthesizes short opt-in UI sounds via WebAudio so we don't ship audio assets
// soundEffects setting in useSettings gates everything

type SfxKind = 'success' | 'select' | 'celebration';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
	if (!import.meta.client) return null;
	if (ctx) return ctx;
	try {
		const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
		if (!Ctor) return null;
		ctx = new Ctor();
	} catch {
		ctx = null;
	}
	return ctx;
}

function blip(frequency: number, durationMs: number, type: OscillatorType = 'sine') {
	const audio = getContext();
	if (!audio) return;
	const now = audio.currentTime;
	const osc = audio.createOscillator();
	const gain = audio.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(frequency, now);
	gain.gain.setValueAtTime(0, now);
	gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
	osc.connect(gain).connect(audio.destination);
	osc.start(now);
	osc.stop(now + durationMs / 1000 + 0.02);
}

export function useSoundEffects() {
	const { settings } = useAppSettings();

	function play(kind: SfxKind) {
		if (!settings.value.soundEffects) return;
		switch (kind) {
			case 'success':
				blip(880, 140);
				setTimeout(() => blip(1175, 180), 90);
				break;
			case 'select':
				blip(660, 90, 'triangle');
				break;
			case 'celebration':
				blip(523, 120);
				setTimeout(() => blip(659, 120), 110);
				setTimeout(() => blip(784, 160), 220);
				setTimeout(() => blip(1046, 260), 340);
				break;
		}
	}

	return { play };
}
