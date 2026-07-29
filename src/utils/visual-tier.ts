/** how much translucency and ambient motion a device is allowed to spend frames on */
export type VisualTier = 'full' | 'reduced' | 'off';

// rAF is vsync-locked, so an absolute frame time only reports the panel's refresh rate; the blur's
// real cost is how far the blurred window overshoots an identical unblurred baseline
export const COMPOSITE_COST_RATIO_FULL = 1.25;
export const COMPOSITE_COST_FREE_MS = 2;
export const COMPOSITE_FULL_MAX_MS = 18.5;
export const COMPOSITE_VETO_MS = 20;
export const TIER_FULL_MIN_CORES = 6;
export const TIER_FULL_MIN_MEMORY_GB = 4;

/** the two timed windows; `0` on either means the frames could not be timed at all */
export interface CompositeMeasurement {
	baselineMs: number;
	blurredMs: number;
}

/** one device measurement: the reported specs plus the timed windows that can veto them */
export interface TierProbe extends CompositeMeasurement {
	cores: number;
	memoryGb: number;
	dpr: number;
	saveData: boolean;
}

/** what the blur added to the frame, in ms */
export function compositeCostMs(m: CompositeMeasurement): number {
	return m.blurredMs - m.baselineMs;
}

/** what the blur cost relative to the same scene without it; 1 means free */
export function compositeCostRatio(m: CompositeMeasurement): number {
	return m.blurredMs / Math.max(1, m.baselineMs);
}

export function isCompositeMeasured(m: CompositeMeasurement): boolean {
	return (
		Number.isFinite(m.baselineMs) &&
		Number.isFinite(m.blurredMs) &&
		m.baselineMs > 0 &&
		m.blurredMs > 0
	);
}

// medians are vsync-quantized, so a real overshoot costs a whole dropped frame; the ms floor only
// keeps panel jitter on a 120Hz device from failing the ratio
export function blurIsFree(m: CompositeMeasurement): boolean {
	return (
		compositeCostMs(m) <= COMPOSITE_COST_FREE_MS ||
		compositeCostRatio(m) <= COMPOSITE_COST_RATIO_FULL
	);
}

/**
 * Reported specs lie on throttled devices, so the timed windows get a veto: a compositor that drops
 * frames cannot reach `full` no matter what the device claims.
 *
 * `full` asks whether the blur was free against the device's own refresh rate rather than fast in
 * absolute ms, so a 60Hz phone that composites blur effortlessly is eligible.
 *
 * `memoryGb <= 0` means the browser withholds it (every safari), so the core count carries the
 * decision alone rather than failing closed.
 */
export function tierFromProbe(p: TierProbe): VisualTier {
	const { cores, memoryGb, saveData, baselineMs, blurredMs } = p;
	const measured = isCompositeMeasured(p);

	// the veto outranks saveData's cap; a device this slow gets nothing either way
	if (measured && Math.max(baselineMs, blurredMs) > COMPOSITE_VETO_MS) return 'off';
	if (saveData) return 'reduced';
	// an untimed probe can never earn full, and is never vetoed on a guess
	if (!measured) return 'reduced';

	const memoryUnknown = memoryGb <= 0;

	if (
		blurIsFree(p) &&
		blurredMs <= COMPOSITE_FULL_MAX_MS &&
		cores >= TIER_FULL_MIN_CORES &&
		(memoryUnknown || memoryGb >= TIER_FULL_MIN_MEMORY_GB)
	) {
		return 'full';
	}

	return 'reduced';
}

export function tierLabel(t: VisualTier): string {
	switch (t) {
		case 'full':
			return 'Full - Glass and Ambient Motion';
		case 'reduced':
			return 'Reduced - Light Blur';
		default:
			return 'Off - Solid Surfaces';
	}
}

// #region measurement

const COMPOSITE_FRAMES = 24;
const COMPOSITE_PROBE_PX = 64;
const COMPOSITE_BLUR = 'blur(20px) saturate(180%)';
const FRAME_SAMPLE_TIMEOUT_MS = 2_500;

const UNMEASURED: CompositeMeasurement = { baselineMs: 0, blurredMs: 0 };

/** median of a sample set; `0` for an empty set so callers can fall back */
export function medianOf(values: number[]): number {
	if (values.length === 0) return 0;

	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	if (sorted.length % 2 === 1) return sorted[mid] as number;

	return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function nowMs(): number {
	return typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now();
}

function canSampleFrames(): boolean {
	return typeof requestAnimationFrame === 'function';
}

/** true when the webview is not painting, so any frame timing would measure throttling instead */
export function isDocumentHidden(): boolean {
	return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Collect `count` rAF frame deltas in ms, running `onFrame` inside each one.
 *
 * Resolves with whatever it has if rAF stops firing, so a backgrounded webview can never hang
 * the caller.
 */
export async function sampleFrames(
	count: number,
	onFrame?: (frame: number) => void
): Promise<number[]> {
	if (!canSampleFrames()) return [];

	return await new Promise<number[]>((resolve) => {
		const deltas: number[] = [];
		let frame = 0;
		let last = nowMs();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let settled = false;

		function finish() {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			resolve(deltas);
		}

		function step(stamp: number) {
			const at = Number.isFinite(stamp) ? stamp : nowMs();
			const delta = at - last;
			last = at;
			if (delta > 0) deltas.push(delta);

			onFrame?.(frame);
			frame += 1;
			if (frame >= count) {
				finish();
				return;
			}

			requestAnimationFrame(step);
		}

		timer = setTimeout(finish, FRAME_SAMPLE_TIMEOUT_MS);
		requestAnimationFrame(step);
	});
}

interface ProbeElements {
	host: HTMLDivElement;
	moving: HTMLDivElement;
	glass: HTMLDivElement;
}

function buildProbeElement(): ProbeElements {
	const host = document.createElement('div');
	host.setAttribute('aria-hidden', 'true');
	host.style.cssText =
		`position:fixed;top:0;left:0;width:${COMPOSITE_PROBE_PX}px;height:${COMPOSITE_PROBE_PX}px;` +
		'opacity:0.02;pointer-events:none;z-index:-1;overflow:hidden;contain:strict';

	const moving = document.createElement('div');
	moving.style.cssText =
		'position:absolute;inset:-50%;background:linear-gradient(45deg,#000 0%,#fff 50%,#000 100%)';

	// present but unfiltered during the baseline, so the only change is the filter itself
	const glass = document.createElement('div');
	glass.style.cssText = 'position:absolute;inset:0';

	host.append(moving, glass);
	return { host, moving, glass };
}

async function sampleWindow(moving: HTMLElement): Promise<number> {
	const deltas = await sampleFrames(COMPOSITE_FRAMES, (frame) => {
		// keep the pixels under the blur moving so the compositor cannot reuse a cached layer
		moving.style.transform = `translate3d(${frame % 8}px,${(frame * 3) % 8}px,0)`;
	});

	// drop the first delta: it carries the style change and its first paint
	return medianOf(deltas.slice(1));
}

// no navigator.getBattery anywhere here: it does not exist on ios safari/wkwebview, so a
// battery-driven tier is android-only; timed frames cover both and catch ios low power mode
/** time the same moving scene twice, unfiltered then under a real backdrop-filter blur */
export async function measureComposite(): Promise<CompositeMeasurement> {
	if (typeof document === 'undefined' || !document.body || !canSampleFrames()) {
		return { ...UNMEASURED };
	}

	// timing a hidden webview measures rAF throttling, not the compositor
	if (isDocumentHidden()) return { ...UNMEASURED };

	let host: HTMLDivElement | null = null;
	try {
		const probe = buildProbeElement();
		host = probe.host;
		document.body.appendChild(host);

		const baselineMs = await sampleWindow(probe.moving);

		probe.glass.style.setProperty('backdrop-filter', COMPOSITE_BLUR);
		probe.glass.style.setProperty('-webkit-backdrop-filter', COMPOSITE_BLUR);
		const blurredMs = await sampleWindow(probe.moving);

		return { baselineMs, blurredMs };
	} catch {
		return { ...UNMEASURED };
	} finally {
		host?.remove();
	}
}

interface ProbeNavigator {
	hardwareConcurrency?: number;
	deviceMemory?: number;
	connection?: { saveData?: boolean };
}

function positiveOrZero(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** read the reported specs and time the composite; `0` means the browser withheld the value */
export async function readProbe(): Promise<TierProbe> {
	const nav = (typeof navigator === 'undefined' ? undefined : navigator) as
		(Navigator & ProbeNavigator) | undefined;
	const win = typeof window === 'undefined' ? undefined : window;

	return {
		cores: Math.floor(positiveOrZero(nav?.hardwareConcurrency)),
		memoryGb: positiveOrZero(nav?.deviceMemory),
		dpr: positiveOrZero(win?.devicePixelRatio) || 1,
		saveData: nav?.connection?.saveData === true,
		...(await measureComposite())
	};
}

// #endregion
