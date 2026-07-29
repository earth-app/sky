import { Preferences } from '@capacitor/preferences';
import { logWarn } from '~/composables/useLogger';
import {
	COMPOSITE_VETO_MS,
	isDocumentHidden,
	medianOf,
	readProbe,
	sampleFrames,
	tierFromProbe,
	tierLabel,
	type TierProbe,
	type VisualTier
} from '~/utils/visual-tier';

// v2: the probe carries baseline-vs-blurred windows, so v1 records are re-measured, not trusted
export const VISUAL_TIER_PREF_KEY = 'sky:visual-tier-v2';

// unmeasured devices start in the safe middle; first paint is never full glass on a slow phone
export const DEFAULT_VISUAL_TIER: VisualTier = 'reduced';

const TIER_RANK: Record<VisualTier, number> = { off: 0, reduced: 1, full: 2 };

/** frame budget in ms the ambient canvas should draw within; `0` means do not draw at all */
export const TIER_FRAME_BUDGET_MS: Record<VisualTier, number> = { full: 16, reduced: 33, off: 0 };
export const TIER_TARGET_FPS: Record<VisualTier, number> = { full: 60, reduced: 30, off: 0 };

/** the `visualEffects` app setting: an explicit tier, or `auto` to use the measurement */
export type VisualEffectsPreference = 'auto' | VisualTier;

/** the two independent visual switches; both default on, so an older caller cannot disable them */
export interface VisualToggles {
	/** Ambient Scenes: off means the generative canvas is not drawn at all, at any tier */
	ambientScenes?: boolean;
	/** Translucency: off forces the glass-off branch, whatever the measured tier says */
	translucency?: boolean;
}

export interface VisualSettingsInput extends VisualToggles {
	visualEffects: VisualEffectsPreference;
	dataSaverMode: boolean;
	animations: boolean;
}

export interface VisualTierInputs {
	visualEffects: VisualEffectsPreference;
	measured: VisualTier | null;
	demoted: VisualTier | null;
	dataSaverMode: boolean;
	reducedTransparency: boolean;
}

/** one shared render policy so the ambient canvas never invents its own device heuristic */
export interface VisualRenderPolicy {
	tier: VisualTier;
	frameBudgetMs: number;
	targetFps: number;
	glass: boolean;
	/** the ambient canvas exists at all; false paints no scene, not a slower one */
	scenes: boolean;
	ambient: boolean;
}

export interface StoredVisualTier {
	version: string;
	tier: VisualTier;
	probe: TierProbe;
	measuredAt: number;
}

function minTier(a: VisualTier, b: VisualTier): VisualTier {
	return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function isVisualTier(value: unknown): value is VisualTier {
	return value === 'full' || value === 'reduced' || value === 'off';
}

/**
 * Precedence: an explicit `visualEffects` beats the measurement, data saver caps at `reduced`, and
 * `prefers-reduced-transparency` forces `off`.
 *
 * A mid-session demotion only caps `auto`, since an explicit choice is the user overriding us.
 * Anything malformed is treated as `auto`.
 */
export function resolveVisualTier(i: VisualTierInputs): VisualTier {
	let tier = isVisualTier(i.visualEffects) ? i.visualEffects : (i.measured ?? DEFAULT_VISUAL_TIER);

	if (!isVisualTier(i.visualEffects) && i.demoted) tier = minTier(tier, i.demoted);
	if (i.dataSaverMode) tier = minTier(tier, 'reduced');
	if (i.reducedTransparency) tier = 'off';

	return tier;
}

/**
 * Ambient motion also answers to the animations setting; translucency does not.
 *
 * The two `toggles` are user switches that sit under the tier: each one can only take its own
 * effect away, so a tier that already said no stays no.
 */
export function renderPolicyFor(
	tier: VisualTier,
	animations: boolean,
	toggles: VisualToggles = {}
): VisualRenderPolicy {
	const scenes = toggles.ambientScenes !== false;

	return {
		tier,
		frameBudgetMs: TIER_FRAME_BUDGET_MS[tier],
		targetFps: TIER_TARGET_FPS[tier],
		glass: tier !== 'off' && toggles.translucency !== false,
		scenes,
		ambient: tier !== 'off' && animations && scenes
	};
}

/** tolerant parse of the persisted record; any malformed blob re-probes instead of throwing */
export function parseStoredVisualTier(raw: string | null | undefined): StoredVisualTier | null {
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;

		const rec = parsed as Record<string, unknown>;
		if (typeof rec.version !== 'string' || !isVisualTier(rec.tier)) return null;
		if (!rec.probe || typeof rec.probe !== 'object') return null;

		const probe = rec.probe as Record<string, unknown>;
		const numbers = ['cores', 'memoryGb', 'dpr', 'baselineMs', 'blurredMs'] as const;
		if (numbers.some((key) => !Number.isFinite(probe[key] as number))) return null;

		return {
			version: rec.version,
			tier: rec.tier,
			probe: {
				cores: probe.cores as number,
				memoryGb: probe.memoryGb as number,
				dpr: probe.dpr as number,
				saveData: probe.saveData === true,
				baselineMs: probe.baselineMs as number,
				blurredMs: probe.blurredMs as number
			},
			measuredAt: Number.isFinite(rec.measuredAt as number) ? (rec.measuredAt as number) : 0
		};
	} catch {
		return null;
	}
}

// #region state

// module-level, not useState: applyAppSettingsToDocument can run outside a nuxt context, and
// sky is ssr:false so there is no per-request state to isolate
const measuredTier = ref<VisualTier | null>(null);
const measuredProbe = ref<TierProbe | null>(null);
const demotedTier = ref<VisualTier | null>(null);
const reducedTransparency = ref(false);
const visualSettings = ref<Required<VisualSettingsInput>>({
	visualEffects: 'auto',
	dataSaverMode: false,
	animations: true,
	ambientScenes: true,
	translucency: true
});

export const effectiveVisualTier = computed<VisualTier>(() =>
	resolveVisualTier({
		visualEffects: visualSettings.value.visualEffects,
		measured: measuredTier.value,
		demoted: demotedTier.value,
		dataSaverMode: visualSettings.value.dataSaverMode,
		reducedTransparency: reducedTransparency.value
	})
);

export const visualRenderPolicy = computed<VisualRenderPolicy>(() =>
	renderPolicyFor(effectiveVisualTier.value, visualSettings.value.animations, visualSettings.value)
);

export const visualFrameBudgetMs = computed<number>(() => visualRenderPolicy.value.frameBudgetMs);

export const visualTierLabel = computed<string>(() => tierLabel(effectiveVisualTier.value));

/** mirror the live app settings into the tier; called from applyAppSettingsToDocument */
export function noteVisualSettings(next: VisualSettingsInput): void {
	visualSettings.value = {
		...next,
		ambientScenes: next.ambientScenes !== false,
		translucency: next.translucency !== false
	};
}

/**
 * The only writer of the glass classes; every glass rule in main.css keys off them.
 *
 * The Translucency switch is a floor rather than a cap: a user who turned glass off gets `glass-off`
 * even at the full tier, and even when a caller passes an explicit tier.
 */
export function applyVisualTierClass(tier: VisualTier = effectiveVisualTier.value): void {
	if (typeof document === 'undefined') return;

	const glassTier: VisualTier = visualSettings.value.translucency ? tier : 'off';
	const root = document.documentElement;
	root.classList.toggle('glass-full', glassTier === 'full');
	root.classList.toggle('glass-reduced', glassTier === 'reduced');
	root.classList.toggle('glass-off', glassTier === 'off');
}

// #endregion

// #region reduced transparency

const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

// limited availability: an unsupported query normalizes its media to 'not all' and always reports
// matches:false, so check the media text before trusting it
function reducedTransparencyQuery(): MediaQueryList | null {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;

	try {
		const query = window.matchMedia(REDUCED_TRANSPARENCY_QUERY);
		return query.media === REDUCED_TRANSPARENCY_QUERY ? query : null;
	} catch {
		return null;
	}
}

export function prefersReducedTransparency(): boolean {
	return reducedTransparencyQuery()?.matches === true;
}

let transparencyListenerAttached = false;

function attachReducedTransparencyListener(): void {
	const query = reducedTransparencyQuery();
	if (!query) return;

	reducedTransparency.value = query.matches;
	if (transparencyListenerAttached || typeof query.addEventListener !== 'function') return;

	transparencyListenerAttached = true;
	query.addEventListener('change', (event) => {
		reducedTransparency.value = event.matches;
		applyVisualTierClass();
	});
}

// #endregion

// #region measure + persist

declare const __APP_VERSION__: string;

function appVersion(): string {
	// vite define; absent in unit tests and any non-bundled context
	return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

async function readStored(): Promise<StoredVisualTier | null> {
	try {
		const { value } = await Preferences.get({ key: VISUAL_TIER_PREF_KEY });
		return parseStoredVisualTier(value);
	} catch {
		return null;
	}
}

async function writeStored(record: StoredVisualTier): Promise<void> {
	try {
		await Preferences.set({ key: VISUAL_TIER_PREF_KEY, value: JSON.stringify(record) });
	} catch {
		// best-effort; a lost write just re-probes on the next launch
	}
}

const VISIBLE_WAIT_MS = 8_000;

// probing while hidden times throttled rAF, so wait briefly for the webview to start painting
function whenVisible(timeoutMs = VISIBLE_WAIT_MS): Promise<void> {
	if (typeof document === 'undefined' || !isDocumentHidden()) return Promise.resolve();

	return new Promise<void>((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;

		function finish() {
			if (timer) clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisibility);
			resolve();
		}

		function onVisibility() {
			if (!isDocumentHidden()) finish();
		}

		timer = setTimeout(finish, timeoutMs);
		document.addEventListener('visibilitychange', onVisibility);
	});
}

/**
 * Re-measure the device and persist the result.
 *
 * An explicit recheck supersedes a session demotion, since a fresh measurement is exactly what the
 * demotion was guessing at; the watcher itself never promotes.
 */
export async function recheckDevice(): Promise<VisualTier> {
	const probe = await readProbe();
	const tier = tierFromProbe(probe);

	measuredProbe.value = probe;
	measuredTier.value = tier;
	demotedTier.value = null;
	applyVisualTierClass();

	// a hidden webview cannot be timed, so keep that result in memory and re-probe next launch
	if (!isDocumentHidden()) {
		await writeStored({ version: appVersion(), tier, probe, measuredAt: Date.now() });
	}

	return tier;
}

let initPromise: Promise<VisualTier> | null = null;

/** hydrate the stored tier (or probe fresh on first run / app update) and start the watcher */
export async function initVisualTier(): Promise<VisualTier> {
	if (initPromise) return await initPromise;

	initPromise = (async () => {
		attachReducedTransparencyListener();

		const stored = await readStored();
		if (stored && stored.version === appVersion()) {
			measuredTier.value = stored.tier;
			measuredProbe.value = stored.probe;
			applyVisualTierClass();
		} else {
			await whenVisible();
			await recheckDevice();
		}

		startVisualTierWatch();
		return effectiveVisualTier.value;
	})();

	return await initPromise;
}

// #endregion

// #region sustained-frame watcher

const WATCH_WINDOW_FRAMES = 45;
const WATCH_INTERVAL_MS = 20_000;
const WATCH_BAD_WINDOWS = 2;
const WATCH_MAX_SAMPLE_MS = 300;

/**
 * Step the tier down one level.
 *
 * @internal seam for the watcher; monotonic by design, so it can never promote within a session
 */
export function demoteVisualTier(frameMs = 0): VisualTier | null {
	const from = minTier(measuredTier.value ?? DEFAULT_VISUAL_TIER, demotedTier.value ?? 'full');
	if (from === 'off') return null;

	const next: VisualTier = from === 'full' ? 'reduced' : 'off';
	demotedTier.value = next;
	applyVisualTierClass();
	logWarn('visual.tier', 'demoted after sustained slow frames', {
		from,
		to: next,
		frameMs: Math.round(frameMs)
	});

	return next;
}

let watchStop: (() => void) | null = null;

export interface VisualTierWatchOptions {
	intervalMs?: number;
	windowFrames?: number;
	/** @internal test seam: swap the rAF sampler for a deterministic one */
	sample?: (count: number) => Promise<number[]>;
}

/**
 * Sustained-frame-time watcher: a device that passed the cold probe can fail warm, so two slow
 * windows in a row cost it one tier. Only `auto` is watched, and it never promotes back.
 */
export function startVisualTierWatch(options: VisualTierWatchOptions = {}): () => void {
	if (watchStop) return watchStop;
	if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return () => {};

	const intervalMs = options.intervalMs ?? WATCH_INTERVAL_MS;
	const windowFrames = options.windowFrames ?? WATCH_WINDOW_FRAMES;
	const sample = options.sample ?? sampleFrames;

	let badWindows = 0;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const shouldSample = () =>
		!isDocumentHidden() &&
		visualSettings.value.visualEffects === 'auto' &&
		effectiveVisualTier.value !== 'off';

	async function runWindow(): Promise<void> {
		if (stopped) return;

		if (shouldSample()) {
			// a long gap is a backgrounded or navigating webview, not thermal throttling
			const deltas = (await sample(windowFrames)).filter((d) => d <= WATCH_MAX_SAMPLE_MS);

			if (deltas.length * 2 >= windowFrames) {
				const frameMs = medianOf(deltas);
				if (frameMs > COMPOSITE_VETO_MS) {
					badWindows += 1;
					if (badWindows >= WATCH_BAD_WINDOWS) {
						badWindows = 0;
						demoteVisualTier(frameMs);
					}
				} else {
					badWindows = 0;
				}
			}
		}

		if (!stopped) timer = setTimeout(() => void runWindow(), intervalMs);
	}

	timer = setTimeout(() => void runWindow(), intervalMs);

	watchStop = () => {
		stopped = true;
		if (timer) clearTimeout(timer);
		watchStop = null;
	};

	return watchStop;
}

export function stopVisualTierWatch(): void {
	watchStop?.();
}

/** @internal reset the module snapshot between unit tests */
export function resetVisualTierState(): void {
	stopVisualTierWatch();
	initPromise = null;
	measuredTier.value = null;
	measuredProbe.value = null;
	demotedTier.value = null;
	reducedTransparency.value = false;
	visualSettings.value = {
		visualEffects: 'auto',
		dataSaverMode: false,
		animations: true,
		ambientScenes: true,
		translucency: true
	};
}

// #endregion

export function useVisualTier() {
	return {
		tier: effectiveVisualTier,
		policy: visualRenderPolicy,
		frameBudgetMs: visualFrameBudgetMs,
		label: visualTierLabel,
		measuredTier,
		probe: measuredProbe,
		demotedTier,
		init: initVisualTier,
		recheckDevice,
		startWatch: startVisualTierWatch,
		stopWatch: stopVisualTierWatch,
		applyClass: applyVisualTierClass
	};
}
