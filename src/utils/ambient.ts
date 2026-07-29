import type { Shape } from '~/utils/scene';
import type { TimeOfDay } from '~/utils/scene-earth';
import type { VisualTier } from '~/utils/visual-tier';

// #region layout

export const AMBIENT_MIN_HEIGHT = 240;
export const AMBIENT_MAX_HEIGHT = 420;
const AMBIENT_HEIGHT_RATIO = 0.42;

/**
 * The reserved height, in css px.
 *
 * Viewport-proportional so the scene keeps its share of a small phone and never eats a tablet,
 * and computed BEFORE the canvas mounts: an unsized canvas is a layout shift, and the box has to
 * be the same size the bitmap will be.
 */
export function ambientHeight(viewportHeight: number): number {
	const base = Number.isFinite(viewportHeight) ? viewportHeight * AMBIENT_HEIGHT_RATIO : 0;
	return Math.round(Math.min(AMBIENT_MAX_HEIGHT, Math.max(AMBIENT_MIN_HEIGHT, base)));
}

/** past 2x the extra device pixels are invisible on a soft gradient and cost fill rate */
export const AMBIENT_MAX_DPR = 2;

export function ambientDpr(ratio: number | null | undefined): number {
	const value = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
	return Math.min(AMBIENT_MAX_DPR, Math.max(1, value));
}

export interface AmbientSurfaceSize {
	width: number;
	height: number;
}

/** backing-store size in device px; the context is then scaled so painting stays in css units */
export function ambientBackingSize(
	cssWidth: number,
	cssHeight: number,
	dpr: number
): AmbientSurfaceSize {
	const scale = ambientDpr(dpr);
	return {
		width: Math.max(1, Math.round(Math.max(1, cssWidth) * scale)),
		height: Math.max(1, Math.round(Math.max(1, cssHeight) * scale))
	};
}

// #endregion

// #region render plan

export interface AmbientPlanInput {
	tier: VisualTier;
	/** the tier's frame budget in ms; `0` means do not animate at all */
	frameBudgetMs: number;
	/** the tier's ambient permission, which already folds in the in-app animations setting */
	ambient: boolean;
	/** the OS setting, read reactively so toggling it mid-session lands immediately */
	prefersReducedMotion: boolean;
}

export interface AmbientPlan {
	/** false paints exactly one settled frame and starts no timer */
	animate: boolean;
	/** the setTimeout interval between frames; 0 when still */
	intervalMs: number;
	/** the host's own ripple layer; only the full tier pays for it */
	extras: boolean;
	/** settle to a static frame after this long with no interaction; 0 when still */
	idleMs: number;
}

/** a scene nobody has touched for this long is furniture; stop paying for it until the next touch */
export const AMBIENT_IDLE_MS = 6_000;

const MIN_INTERVAL_MS = 8;
const MAX_INTERVAL_MS = 200;

export const AMBIENT_STILL_PLAN: AmbientPlan = Object.freeze({
	animate: false,
	intervalMs: 0,
	extras: false,
	idleMs: 0
});

/**
 * The single render decision, taken from the shared tier policy plus the OS motion setting.
 *
 * Still is never nothing: the caller paints one settled frame, because removing motion must not
 * remove the information the scene carries.
 */
export function ambientPlan(input: AmbientPlanInput): AmbientPlan {
	const budget = Math.round(input.frameBudgetMs);
	const still =
		input.tier === 'off' || !input.ambient || input.prefersReducedMotion || !(budget > 0);
	if (still) return AMBIENT_STILL_PLAN;

	return {
		animate: true,
		intervalMs: Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, budget)),
		extras: input.tier === 'full',
		idleMs: AMBIENT_IDLE_MS
	};
}

// #endregion

// #region static-layer cache

export interface AmbientCacheKey {
	width: number;
	height: number;
	dpr: number;
	timeOfDay: TimeOfDay;
	seed: string;
}

export interface AmbientCacheInput {
	width: number;
	height: number;
	dpr: number;
	timeOfDay: TimeOfDay;
	seed: string;
}

/** rounded on the way in; a ResizeObserver reports sub-pixel widths and 0.4px is not a repaint */
export function ambientCacheKey(input: AmbientCacheInput): AmbientCacheKey {
	return {
		width: Math.max(1, Math.round(input.width)),
		height: Math.max(1, Math.round(input.height)),
		dpr: Math.round(ambientDpr(input.dpr) * 100) / 100,
		timeOfDay: input.timeOfDay,
		seed: input.seed
	};
}

/** the cached layers hold until the box, the pixel density, the palette hour or the seed moves */
export function needsCacheRebuild(prev: AmbientCacheKey | null, next: AmbientCacheKey): boolean {
	if (!prev) return true;

	return (
		prev.width !== next.width ||
		prev.height !== next.height ||
		prev.dpr !== next.dpr ||
		prev.timeOfDay !== next.timeOfDay ||
		prev.seed !== next.seed
	);
}

/** leading shapes the back cache owns: the sky gradient */
export const AMBIENT_BACK_LAYERS = 1;
/** trailing shapes the front cache owns: two hill bands, the ground, its seam and the vignette */
export const AMBIENT_FRONT_LAYERS = 5;

const BACK_KINDS = ['rect'] as const;
const FRONT_KINDS = ['path', 'path', 'rect', 'rect', 'rect'] as const;

export interface AmbientLayerSplit {
	/** how many leading shapes go in the back cache */
	back: number;
	/** how many trailing shapes go in the front cache */
	front: number;
}

export const AMBIENT_NO_SPLIT: AmbientLayerSplit = Object.freeze({ back: 0, front: 0 });

/**
 * Which shapes the two offscreen caches own; everything between them is painted live.
 *
 * The sky band moves (the celestial glow and the drifting clouds); the gradient behind it and the
 * hills, ground and vignette in front of it do not move enough to be worth a gradient fill and two
 * long polyline fills per frame, so they are painted once per resize. Sampling two different times
 * cannot find this boundary - the hills carry a 78s sway and the ground seam a slow pulse, both of
 * which are deliberately frozen - so the split is declared here and validated against the real
 * frame. A frame that does not match falls back to painting everything live: slower, never wrong.
 */
export function ambientLayerSplit(shapes: readonly Shape[]): AmbientLayerSplit {
	if (shapes.length <= AMBIENT_BACK_LAYERS + AMBIENT_FRONT_LAYERS) return AMBIENT_NO_SPLIT;

	const backOk = BACK_KINDS.every((kind, i) => shapes[i]?.kind === kind);
	const offset = shapes.length - AMBIENT_FRONT_LAYERS;
	const frontOk = FRONT_KINDS.every((kind, i) => shapes[offset + i]?.kind === kind);

	return backOk && frontOk
		? { back: AMBIENT_BACK_LAYERS, front: AMBIENT_FRONT_LAYERS }
		: AMBIENT_NO_SPLIT;
}

// #endregion

// #region ripples

export interface AmbientRipple {
	x: number;
	y: number;
	/** scene time the touch landed at */
	at: number;
}

export const AMBIENT_RIPPLE_MS = 900;
export const AMBIENT_MAX_RIPPLES = 4;

/**
 * Drop the finished ripples.
 *
 * Called from the still path as well as the animated one: expiring interaction state only inside
 * the animated draw is how a map of it grows without bound the moment motion is turned off.
 */
export function expireRipples(ripples: readonly AmbientRipple[], elapsed: number): AmbientRipple[] {
	return ripples.filter((ripple) => {
		const age = elapsed - ripple.at;
		return age >= 0 && age < AMBIENT_RIPPLE_MS;
	});
}

/** bounded on push, so a drum-roll of taps cannot grow the list either */
export function pushRipple(
	ripples: readonly AmbientRipple[],
	next: AmbientRipple
): AmbientRipple[] {
	const out = [...ripples, next];
	return out.length > AMBIENT_MAX_RIPPLES ? out.slice(out.length - AMBIENT_MAX_RIPPLES) : out;
}

/** expanding rings in the same IR the scene uses, so one painter draws the whole frame */
export function rippleShapes(
	ripples: readonly AmbientRipple[],
	elapsed: number,
	color: string,
	reach: number
): Shape[] {
	const out: Shape[] = [];

	for (const ripple of ripples) {
		const k = (elapsed - ripple.at) / AMBIENT_RIPPLE_MS;
		if (k < 0 || k >= 1) continue;

		out.push({
			kind: 'circle',
			cx: ripple.x,
			cy: ripple.y,
			r: Math.max(1, reach * (0.12 + k * 0.88)),
			stroke: color,
			strokeAlpha: (1 - k) * 0.45,
			strokeWidth: 1.5,
			round: true
		});
	}

	return out;
}

// #endregion

// #region loop

export interface AmbientGates {
	/** the document is painting; false while the app is backgrounded */
	visible: boolean;
	/** the ion view is the active one in its outlet, since ionic keeps tab pages mounted */
	onScreen: boolean;
	/** the host box intersects the viewport */
	onViewport: boolean;
	/** the host is mounted and holds a drawable context */
	live: boolean;
}

/** everything open except `live`: nothing paints until the host has a context */
export const AMBIENT_GATES_INITIAL: AmbientGates = Object.freeze({
	visible: true,
	onScreen: true,
	onViewport: true,
	live: false
});

/** every gate has to be open; any one of them closing is a reason to stop spending frames */
export function ambientGatesOpen(gates: AmbientGates): boolean {
	return gates.visible && gates.onScreen && gates.onViewport && gates.live;
}

export interface AmbientFrame {
	mode: 'animate' | 'still';
	/** animated ms; paused and idle time is excluded so a resumed scene never teleports */
	elapsed: number;
}

/** injectable clock so the loop is drivable without real time */
export interface AmbientScheduler {
	now: () => number;
	schedule: (run: () => void, ms: number) => unknown;
	cancel: (handle: unknown) => void;
}

export interface AmbientLoopOptions {
	draw: (frame: AmbientFrame) => void;
	scheduler?: AmbientScheduler;
}

export interface AmbientLoop {
	/** true while a frame is scheduled */
	readonly running: boolean;
	/** true once the idle decay has settled the scene */
	readonly idle: boolean;
	readonly elapsed: number;
	/** timers armed since creation; the wakeup count is the whole reason this is not rAF */
	readonly wakeups: number;
	setPlan: (plan: AmbientPlan) => void;
	setGates: (gates: Partial<AmbientGates>) => void;
	/** an interaction: wake from idle and restart the decay window */
	poke: () => void;
	stop: () => void;
}

// a stall longer than this many frames is a gate we missed, not animation to catch up on
const MAX_CATCHUP_FRAMES = 3;

function defaultNow(): number {
	return typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now();
}

const DEFAULT_SCHEDULER: AmbientScheduler = {
	now: defaultNow,
	schedule: (run, ms) => setTimeout(run, ms),
	cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * A self-scheduling ambient frame loop.
 *
 * `setTimeout` at the tier's interval, not `requestAnimationFrame` with a skip test: rAF wakes on
 * every vsync, so a 120Hz phone runs 120 callbacks a second to paint 30 frames. Here the number of
 * wakeups equals the number of frames.
 */
export function createAmbientLoop(options: AmbientLoopOptions): AmbientLoop {
	const clock = options.scheduler ?? DEFAULT_SCHEDULER;
	const draw = options.draw;

	let plan: AmbientPlan = AMBIENT_STILL_PLAN;
	let gates: AmbientGates = { ...AMBIENT_GATES_INITIAL };
	let handle: unknown = null;
	let elapsed = 0;
	let lastAt = 0;
	let lastPoke = 0;
	let idle = false;
	let wakeups = 0;
	let disposed = false;

	function shouldRun(): boolean {
		return !disposed && plan.animate && !idle && ambientGatesOpen(gates);
	}

	function cancel(): void {
		if (handle === null) return;

		clock.cancel(handle);
		handle = null;
	}

	function arm(ms: number): void {
		cancel();
		wakeups += 1;
		handle = clock.schedule(tick, Math.max(1, Math.round(ms)));
	}

	function settle(): void {
		idle = true;
		cancel();
		draw({ mode: 'still', elapsed });
	}

	function tick(): void {
		// a timer that fired after a gate closed must not paint
		handle = null;
		if (!shouldRun()) return;

		const at = clock.now();
		elapsed += Math.min(Math.max(0, at - lastAt), plan.intervalMs * MAX_CATCHUP_FRAMES);
		lastAt = at;

		if (plan.idleMs > 0 && at - lastPoke >= plan.idleMs) {
			settle();
			return;
		}

		draw({ mode: 'animate', elapsed });
		arm(plan.intervalMs - (clock.now() - at));
	}

	function sync(): void {
		if (!shouldRun()) {
			cancel();
			return;
		}

		if (handle !== null) return;

		lastAt = clock.now();
		arm(0);
	}

	return {
		get running() {
			return handle !== null;
		},
		get idle() {
			return idle;
		},
		get elapsed() {
			return elapsed;
		},
		get wakeups() {
			return wakeups;
		},
		setPlan(next) {
			plan = next;
			idle = false;
			lastPoke = clock.now();
			sync();
		},
		setGates(next) {
			const opening = !ambientGatesOpen(gates);
			gates = { ...gates, ...next };
			// coming back on screen restarts the decay window, so re-entry animates rather than
			// resuming into an idle it cannot see
			if (opening && ambientGatesOpen(gates)) {
				idle = false;
				lastPoke = clock.now();
			}
			sync();
		},
		poke() {
			lastPoke = clock.now();
			idle = false;
			sync();
		},
		stop() {
			// one-way: an unmounted host must not be restartable by a gate that resolves late
			disposed = true;
			gates = { ...gates, live: false };
			cancel();
		}
	};
}

// #endregion
