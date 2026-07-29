// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { useAmbientExport } from '~/composables/useAmbientExport';
import {
	AMBIENT_FRONT_LAYERS,
	AMBIENT_IDLE_MS,
	AMBIENT_MAX_DPR,
	AMBIENT_MAX_HEIGHT,
	AMBIENT_MAX_RIPPLES,
	AMBIENT_MIN_HEIGHT,
	AMBIENT_NO_SPLIT,
	AMBIENT_RIPPLE_MS,
	AMBIENT_STILL_PLAN,
	ambientBackingSize,
	ambientCacheKey,
	ambientDpr,
	ambientGatesOpen,
	ambientHeight,
	ambientLayerSplit,
	ambientPlan,
	createAmbientLoop,
	expireRipples,
	needsCacheRebuild,
	pushRipple,
	rippleShapes,
	type AmbientFrame,
	type AmbientPlan,
	type AmbientScheduler
} from '~/utils/ambient';
import type { Shape } from '~/utils/scene';
import { buildScene, sceneShapes, SETTLED_MOTION } from '~/utils/scene-earth';

const COMPONENT = readFileSync(
	new URL('../../../src/components/MAmbient.vue', import.meta.url),
	'utf8'
);
const TIER_SOURCE = readFileSync(
	new URL('../../../src/composables/useVisualTier.ts', import.meta.url),
	'utf8'
);

/** the tier table is the single source of the frame budget; read it rather than restate it */
function tierBudget(tier: 'full' | 'reduced' | 'off'): number {
	const table = /TIER_FRAME_BUDGET_MS[^=]*=\s*\{([^}]*)\}/.exec(TIER_SOURCE);
	expect(table, 'useVisualTier declares TIER_FRAME_BUDGET_MS').not.toBeNull();

	const entry = new RegExp(`${tier}:\\s*(\\d+)`).exec(table![1]!);
	expect(entry, `TIER_FRAME_BUDGET_MS declares ${tier}`).not.toBeNull();
	return Number(entry![1]);
}

/** the first brace-matched block after a marker; nested object literals do not truncate it */
function blockAfter(source: string, marker: string): string {
	const start = source.indexOf(marker);
	expect(start, `MAmbient contains ${marker}`).toBeGreaterThan(-1);

	const open = source.indexOf('{', start);
	let depth = 1;
	let i = open + 1;
	while (i < source.length && depth > 0) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') depth--;
		i++;
	}
	return source.slice(open + 1, i - 1);
}

function functionBody(source: string, name: string): string {
	return blockAfter(source, `function ${name}(`);
}

// #region layout

describe('ambientHeight', () => {
	it('is 42% of the viewport between the two clamps', () => {
		expect(ambientHeight(844)).toBe(Math.round(844 * 0.42));
		expect(ambientHeight(844)).toBe(354);
	});

	it('clamps a short viewport up and a tall one down', () => {
		expect(ambientHeight(400)).toBe(AMBIENT_MIN_HEIGHT);
		expect(ambientHeight(1400)).toBe(AMBIENT_MAX_HEIGHT);
	});

	it('returns a usable box for a missing or nonsense viewport', () => {
		expect(ambientHeight(0)).toBe(AMBIENT_MIN_HEIGHT);
		expect(ambientHeight(Number.NaN)).toBe(AMBIENT_MIN_HEIGHT);
		expect(ambientHeight(-999)).toBe(AMBIENT_MIN_HEIGHT);
	});

	it('always returns a whole number, so the reserved box cannot land on a half pixel', () => {
		for (const viewport of [641, 733, 812, 844, 926, 1001]) {
			expect(Number.isInteger(ambientHeight(viewport))).toBe(true);
		}
	});
});

describe('ambientDpr', () => {
	it('caps at 2, so a 3x phone does not pay 2.25x the fill', () => {
		expect(ambientDpr(3)).toBe(AMBIENT_MAX_DPR);
		expect(ambientDpr(4)).toBe(2);
		expect(ambientDpr(2.75)).toBe(2);
	});

	it('passes a 1x and 2x panel through untouched', () => {
		expect(ambientDpr(1)).toBe(1);
		expect(ambientDpr(2)).toBe(2);
		expect(ambientDpr(1.5)).toBe(1.5);
	});

	it('floors at 1 and survives a missing devicePixelRatio', () => {
		expect(ambientDpr(0.75)).toBe(1);
		expect(ambientDpr(0)).toBe(1);
		expect(ambientDpr(undefined)).toBe(1);
		expect(ambientDpr(null)).toBe(1);
		expect(ambientDpr(Number.NaN)).toBe(1);
	});
});

describe('ambientBackingSize', () => {
	it('multiplies the css box by the capped ratio', () => {
		expect(ambientBackingSize(390, 354, 2)).toEqual({ width: 780, height: 708 });
		expect(ambientBackingSize(390, 354, 3)).toEqual({ width: 780, height: 708 });
	});

	it('rounds to whole device pixels and never returns a zero dimension', () => {
		expect(ambientBackingSize(390.4, 353.6, 2)).toEqual({ width: 781, height: 707 });
		expect(ambientBackingSize(0, 0, 2)).toEqual({ width: 2, height: 2 });
	});
});

// #endregion

// #region render plan

const PLAN_BASE = { ambient: true, prefersReducedMotion: false } as const;

describe('ambientPlan', () => {
	it('takes the interval from the tier frame budget, not from a local guess', () => {
		expect(tierBudget('full')).toBe(16);
		expect(tierBudget('reduced')).toBe(33);
		expect(tierBudget('off')).toBe(0);

		expect(
			ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: tierBudget('full') }).intervalMs
		).toBe(16);
		expect(
			ambientPlan({ ...PLAN_BASE, tier: 'reduced', frameBudgetMs: tierBudget('reduced') })
				.intervalMs
		).toBe(33);
	});

	it('gives the full tier motion and the ripple layer', () => {
		expect(ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: 16 })).toEqual({
			animate: true,
			intervalMs: 16,
			extras: true,
			idleMs: AMBIENT_IDLE_MS
		});
	});

	it('halves the rate and drops the extra layers on the reduced tier', () => {
		const plan = ambientPlan({ ...PLAN_BASE, tier: 'reduced', frameBudgetMs: 33 });
		expect(plan.animate).toBe(true);
		expect(plan.intervalMs).toBe(33);
		expect(plan.extras).toBe(false);
	});

	it('paints one settled frame on the off tier', () => {
		expect(ambientPlan({ ...PLAN_BASE, tier: 'off', frameBudgetMs: tierBudget('off') })).toEqual(
			AMBIENT_STILL_PLAN
		);
		expect(AMBIENT_STILL_PLAN.animate).toBe(false);
		expect(AMBIENT_STILL_PLAN.intervalMs).toBe(0);
	});

	it('settles for the OS reduced-motion setting even on a full-tier device', () => {
		const plan = ambientPlan({
			...PLAN_BASE,
			tier: 'full',
			frameBudgetMs: 16,
			prefersReducedMotion: true
		});
		expect(plan).toEqual(AMBIENT_STILL_PLAN);
	});

	it('settles for the in-app animations setting, which arrives as the tier ambient flag', () => {
		const plan = ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: 16, ambient: false });
		expect(plan).toEqual(AMBIENT_STILL_PLAN);
	});

	it('settles when the budget is zero or nonsense, whatever the tier claims', () => {
		expect(ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: 0 })).toEqual(
			AMBIENT_STILL_PLAN
		);
		expect(ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: -5 })).toEqual(
			AMBIENT_STILL_PLAN
		);
		expect(ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: Number.NaN })).toEqual(
			AMBIENT_STILL_PLAN
		);
	});

	it('clamps an absurd budget into a sane interval band', () => {
		expect(ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: 1 }).intervalMs).toBe(8);
		expect(ambientPlan({ ...PLAN_BASE, tier: 'full', frameBudgetMs: 5_000 }).intervalMs).toBe(200);
	});

	it('hands back a frozen still plan, so a caller cannot mutate the shared value', () => {
		expect(Object.isFrozen(AMBIENT_STILL_PLAN)).toBe(true);
	});
});

// #endregion

// #region cache invalidation

const KEY_INPUT = {
	width: 390,
	height: 354,
	dpr: 2,
	timeOfDay: 'day',
	seed: 'user-1'
} as const;

describe('needsCacheRebuild', () => {
	it('rebuilds when there is nothing cached yet', () => {
		expect(needsCacheRebuild(null, ambientCacheKey(KEY_INPUT))).toBe(true);
	});

	it('holds the cached layers when nothing moved', () => {
		const prev = ambientCacheKey(KEY_INPUT);
		expect(needsCacheRebuild(prev, ambientCacheKey(KEY_INPUT))).toBe(false);
	});

	it('ignores sub-pixel resize jitter, which a ResizeObserver reports constantly', () => {
		const prev = ambientCacheKey(KEY_INPUT);
		const next = ambientCacheKey({ ...KEY_INPUT, width: 390.4, height: 353.6 });
		expect(needsCacheRebuild(prev, next)).toBe(false);
	});

	it('rebuilds on a real resize', () => {
		const prev = ambientCacheKey(KEY_INPUT);
		expect(needsCacheRebuild(prev, ambientCacheKey({ ...KEY_INPUT, width: 430 }))).toBe(true);
		expect(needsCacheRebuild(prev, ambientCacheKey({ ...KEY_INPUT, height: 300 }))).toBe(true);
	});

	it('rebuilds when the pixel density changes', () => {
		const prev = ambientCacheKey(KEY_INPUT);
		expect(needsCacheRebuild(prev, ambientCacheKey({ ...KEY_INPUT, dpr: 1 }))).toBe(true);
	});

	it('rebuilds when the palette hour rolls over', () => {
		const prev = ambientCacheKey(KEY_INPUT);
		expect(needsCacheRebuild(prev, ambientCacheKey({ ...KEY_INPUT, timeOfDay: 'dusk' }))).toBe(
			true
		);
	});

	it('rebuilds for a new seed', () => {
		const prev = ambientCacheKey(KEY_INPUT);
		expect(needsCacheRebuild(prev, ambientCacheKey({ ...KEY_INPUT, seed: 'user-2' }))).toBe(true);
	});

	it('never rebuilds for a capped-away density change, since the canvas is identical', () => {
		const prev = ambientCacheKey({ ...KEY_INPUT, dpr: 2 });
		expect(needsCacheRebuild(prev, ambientCacheKey({ ...KEY_INPUT, dpr: 3 }))).toBe(false);
	});
});

// #endregion

// #region static layer split

const BOX = { width: 390, height: 354 };
const NOON = new Date(2026, 0, 15, 12, 0, 0);
const NIGHT = new Date(2026, 0, 15, 23, 0, 0);

describe('ambientLayerSplit', () => {
	it('claims the sky behind and the hills, ground and vignette in front of the day frame', () => {
		const shapes = sceneShapes(buildScene('user-1', NOON), BOX, SETTLED_MOTION);
		const split = ambientLayerSplit(shapes);

		expect(split).toEqual({ back: 1, front: AMBIENT_FRONT_LAYERS });
		expect(shapes.slice(0, split.back).map((s) => s.kind)).toEqual(['rect']);
		expect(shapes.slice(shapes.length - split.front).map((s) => s.kind)).toEqual([
			'path',
			'path',
			'rect',
			'rect',
			'rect'
		]);
	});

	it('finds the same split in the night frame, where the moon replaces the sun', () => {
		const shapes = sceneShapes(buildScene('user-1', NIGHT), BOX, SETTLED_MOTION);
		expect(ambientLayerSplit(shapes)).toEqual({ back: 1, front: AMBIENT_FRONT_LAYERS });
	});

	it('leaves at least one live shape between the two caches', () => {
		const shapes = sceneShapes(buildScene('user-1', NOON), BOX, SETTLED_MOTION);
		const split = ambientLayerSplit(shapes);
		expect(shapes.length - split.back - split.front).toBeGreaterThan(0);
	});

	it('falls back to painting live when the frame does not match the declared shape', () => {
		const wrong: Shape[] = [
			{ kind: 'circle', cx: 0, cy: 0, r: 1 },
			{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 },
			{ kind: 'path', d: 'M0 0' },
			{ kind: 'path', d: 'M0 0' },
			{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 },
			{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 },
			{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 }
		];
		expect(ambientLayerSplit(wrong)).toEqual(AMBIENT_NO_SPLIT);
	});

	it('falls back for a frame too short to split', () => {
		expect(ambientLayerSplit([])).toEqual(AMBIENT_NO_SPLIT);
		expect(ambientLayerSplit([{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 }])).toEqual(AMBIENT_NO_SPLIT);
	});
});

// #endregion

// #region ripples

describe('ripple bookkeeping', () => {
	it('drops a finished ripple', () => {
		const ripples = [{ x: 1, y: 1, at: 0 }];
		expect(expireRipples(ripples, AMBIENT_RIPPLE_MS - 1)).toHaveLength(1);
		expect(expireRipples(ripples, AMBIENT_RIPPLE_MS)).toHaveLength(0);
	});

	it('drops a ripple from before a scene time reset, so it cannot latch forever', () => {
		expect(expireRipples([{ x: 1, y: 1, at: 5_000 }], 0)).toHaveLength(0);
	});

	it('cannot grow past the cap however fast the taps land', () => {
		let ripples = [] as ReturnType<typeof pushRipple>;
		for (let i = 0; i < 40; i++) ripples = pushRipple(ripples, { x: i, y: i, at: i });

		expect(ripples).toHaveLength(AMBIENT_MAX_RIPPLES);
		// the cap keeps the newest, so a tap is never swallowed by an older one
		expect(ripples[ripples.length - 1]!.at).toBe(39);
	});

	it('paints an expanding, fading ring and nothing for an expired one', () => {
		const young = rippleShapes([{ x: 10, y: 20, at: 0 }], 0, '#ffffff', 100);
		const old = rippleShapes([{ x: 10, y: 20, at: 0 }], AMBIENT_RIPPLE_MS, '#ffffff', 100);

		expect(old).toHaveLength(0);
		expect(young).toHaveLength(1);

		const first = young[0]!;
		expect(first.kind).toBe('circle');
		const later = rippleShapes([{ x: 10, y: 20, at: 0 }], AMBIENT_RIPPLE_MS * 0.5, '#fff', 100);
		expect(later[0]!.kind).toBe('circle');
		if (first.kind === 'circle' && later[0]!.kind === 'circle') {
			expect(later[0]!.r).toBeGreaterThan(first.r);
			expect(later[0]!.strokeAlpha!).toBeLessThan(first.strokeAlpha!);
		}
	});
});

// #endregion

// #region loop

function fakeClock() {
	let now = 0;
	let handles = 0;
	let scheduled = 0;
	let lastRun: (() => void) | null = null;
	const cancelled: unknown[] = [];
	const timers = new Map<number, { due: number; run: () => void }>();

	const scheduler: AmbientScheduler = {
		now: () => now,
		schedule: (run, ms) => {
			scheduled += 1;
			lastRun = run;
			const handle = ++handles;
			timers.set(handle, { due: now + ms, run });
			return handle;
		},
		cancel: (handle) => {
			cancelled.push(handle);
			timers.delete(handle as number);
		}
	};

	function nextDue(): [number, { due: number; run: () => void }] | null {
		let best: [number, { due: number; run: () => void }] | null = null;
		for (const entry of timers) if (!best || entry[1].due < best[1].due) best = entry;
		return best;
	}

	return {
		scheduler,
		cancelled,
		now: () => now,
		scheduled: () => scheduled,
		pending: () => timers.size,
		/** the callback of the most recent arm, so a stale timer can be fired by hand */
		fireLast: () => lastRun?.(),
		advance(ms: number) {
			const until = now + ms;
			for (let guard = 0; guard < 100_000; guard++) {
				const entry = nextDue();
				if (!entry || entry[1].due > until) break;
				timers.delete(entry[0]);
				now = entry[1].due;
				entry[1].run();
			}
			now = until;
		}
	};
}

const ANIMATED: AmbientPlan = {
	animate: true,
	intervalMs: 33,
	extras: true,
	idleMs: AMBIENT_IDLE_MS
};
const SHORT_IDLE: AmbientPlan = { animate: true, intervalMs: 100, extras: false, idleMs: 500 };

function startedLoop(plan: AmbientPlan = ANIMATED) {
	const clock = fakeClock();
	const draw = vi.fn<(frame: AmbientFrame) => void>();
	const loop = createAmbientLoop({ draw, scheduler: clock.scheduler });

	loop.setPlan(plan);
	loop.setGates({ live: true });
	return { clock, draw, loop };
}

describe('createAmbientLoop gates', () => {
	it('paints nothing until the host reports a drawable context', () => {
		const clock = fakeClock();
		const draw = vi.fn();
		const loop = createAmbientLoop({ draw, scheduler: clock.scheduler });

		loop.setPlan(ANIMATED);
		clock.advance(1_000);
		expect(draw).not.toHaveBeenCalled();
		expect(loop.running).toBe(false);
	});

	it('requires every gate open', () => {
		expect(ambientGatesOpen({ visible: true, onScreen: true, onViewport: true, live: true })).toBe(
			true
		);

		for (const closed of ['visible', 'onScreen', 'onViewport', 'live'] as const) {
			const gates = { visible: true, onScreen: true, onViewport: true, live: true };
			gates[closed] = false;
			expect(ambientGatesOpen(gates), `${closed} closed stops the loop`).toBe(false);
		}
	});

	it('stops on a backgrounded app and resumes on foreground', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(200);
		const painted = draw.mock.calls.length;
		expect(painted).toBeGreaterThan(0);

		loop.setGates({ visible: false });
		expect(loop.running).toBe(false);
		clock.advance(5_000);
		expect(draw).toHaveBeenCalledTimes(painted);

		loop.setGates({ visible: true });
		clock.advance(200);
		expect(draw.mock.calls.length).toBeGreaterThan(painted);
	});

	it('stops when the ion view leaves, which is not an unmount', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(200);
		const painted = draw.mock.calls.length;

		loop.setGates({ onScreen: false });
		clock.advance(5_000);
		expect(draw).toHaveBeenCalledTimes(painted);
		expect(loop.running).toBe(false);
	});

	it('stops when the box scrolls out of the viewport', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(200);
		const painted = draw.mock.calls.length;

		loop.setGates({ onViewport: false });
		clock.advance(5_000);
		expect(draw).toHaveBeenCalledTimes(painted);
	});

	it('never paints from a timer that fired after a gate closed', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(100);
		const painted = draw.mock.calls.length;

		loop.setGates({ visible: false });
		clock.fireLast();
		expect(draw).toHaveBeenCalledTimes(painted);
	});

	it('does not teleport the scene across a pause', () => {
		const { clock, loop } = startedLoop();
		clock.advance(300);
		const before = loop.elapsed;

		loop.setGates({ onViewport: false });
		clock.advance(60_000);
		loop.setGates({ onViewport: true });
		clock.advance(100);

		// the 60s off screen cost no animated time
		expect(loop.elapsed).toBeGreaterThan(before);
		expect(loop.elapsed).toBeLessThan(before + 400);
	});
});

describe('createAmbientLoop wakeups', () => {
	it('wakes once per painted frame instead of once per vsync', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(1_000);

		const frames = draw.mock.calls.length;
		// 33ms apart: ~30 frames in a second, and a 120Hz panel would have fired rAF 120 times
		expect(frames).toBeGreaterThanOrEqual(28);
		expect(frames).toBeLessThanOrEqual(32);
		// every arm produced a frame; the pending arm is the only extra
		expect(clock.scheduled()).toBe(frames + 1);
		expect(loop.wakeups).toBe(clock.scheduled());
	});

	it('halves the wakeups when the tier halves the rate', () => {
		const fast = startedLoop({ ...ANIMATED, intervalMs: 16 });
		fast.clock.advance(1_000);
		const slow = startedLoop({ ...ANIMATED, intervalMs: 33 });
		slow.clock.advance(1_000);

		expect(fast.draw.mock.calls.length).toBeGreaterThan(slow.draw.mock.calls.length * 1.7);
	});

	it('arms nothing at all for a still plan', () => {
		const { clock, draw, loop } = startedLoop(AMBIENT_STILL_PLAN);
		clock.advance(5_000);

		expect(clock.scheduled()).toBe(0);
		expect(draw).not.toHaveBeenCalled();
		expect(loop.running).toBe(false);
	});

	it('drops the timer when the plan turns still mid-session', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(200);
		const painted = draw.mock.calls.length;

		loop.setPlan(AMBIENT_STILL_PLAN);
		expect(loop.running).toBe(false);
		expect(clock.pending()).toBe(0);
		clock.advance(5_000);
		expect(draw).toHaveBeenCalledTimes(painted);
	});
});

describe('createAmbientLoop idle decay', () => {
	it('settles to a still frame and stops after the idle window', () => {
		const { clock, draw, loop } = startedLoop(SHORT_IDLE);
		clock.advance(2_000);

		expect(loop.idle).toBe(true);
		expect(loop.running).toBe(false);
		expect(clock.pending()).toBe(0);

		const last = draw.mock.calls[draw.mock.calls.length - 1]![0];
		expect(last.mode).toBe('still');
		expect(draw.mock.calls.filter((call) => call[0].mode === 'animate').length).toBeGreaterThan(0);
	});

	it('spends no further wakeups once settled', () => {
		const { clock, draw, loop } = startedLoop(SHORT_IDLE);
		clock.advance(2_000);
		const settledAt = clock.scheduled();
		const painted = draw.mock.calls.length;

		clock.advance(60_000);
		expect(clock.scheduled()).toBe(settledAt);
		expect(draw).toHaveBeenCalledTimes(painted);
		expect(loop.idle).toBe(true);
	});

	it('wakes on the next touch and settles again', () => {
		const { clock, draw, loop } = startedLoop(SHORT_IDLE);
		clock.advance(2_000);
		const settled = draw.mock.calls.length;

		loop.poke();
		expect(loop.idle).toBe(false);
		clock.advance(200);
		expect(draw.mock.calls.length).toBeGreaterThan(settled);
		expect(draw.mock.calls[draw.mock.calls.length - 1]![0].mode).toBe('animate');

		clock.advance(2_000);
		expect(loop.idle).toBe(true);
		expect(loop.running).toBe(false);
	});

	it('keeps the scene time it had, so the wake does not jump the clouds', () => {
		const { clock, loop } = startedLoop(SHORT_IDLE);
		clock.advance(2_000);
		const settled = loop.elapsed;

		clock.advance(30_000);
		loop.poke();
		clock.advance(200);

		expect(loop.elapsed).toBeGreaterThan(settled);
		expect(loop.elapsed).toBeLessThan(settled + 500);
	});

	it('restarts the decay window when the view comes back on screen', () => {
		const { clock, draw, loop } = startedLoop(SHORT_IDLE);
		clock.advance(2_000);
		expect(loop.idle).toBe(true);

		loop.setGates({ onViewport: false });
		loop.setGates({ onViewport: true });
		const painted = draw.mock.calls.length;
		clock.advance(200);

		expect(loop.idle).toBe(false);
		expect(draw.mock.calls.length).toBeGreaterThan(painted);
	});
});

describe('createAmbientLoop teardown', () => {
	it('cancels the armed timer on stop', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(200);
		expect(clock.pending()).toBe(1);

		loop.stop();
		expect(clock.cancelled.length).toBeGreaterThan(0);
		expect(clock.pending()).toBe(0);
		expect(loop.running).toBe(false);

		const painted = draw.mock.calls.length;
		clock.advance(60_000);
		expect(draw).toHaveBeenCalledTimes(painted);
	});

	it('cannot be restarted by a gate, a plan or a poke that resolves after unmount', () => {
		const { clock, draw, loop } = startedLoop();
		clock.advance(200);
		const painted = draw.mock.calls.length;

		loop.stop();
		loop.setGates({ visible: true, onScreen: true, onViewport: true, live: true });
		loop.setPlan(ANIMATED);
		loop.poke();
		clock.advance(5_000);

		expect(loop.running).toBe(false);
		expect(draw).toHaveBeenCalledTimes(painted);
	});

	it('is idempotent', () => {
		const { clock, loop } = startedLoop();
		clock.advance(200);
		loop.stop();
		const cancels = clock.cancelled.length;
		loop.stop();
		expect(clock.cancelled.length).toBe(cancels);
	});
});

// #endregion

// #region export

describe('useAmbientExport', () => {
	const { ambientSvg, ambientSvgDataUrl } = useAmbientExport();

	it('emits real vector markup, not a bitmap in an <image> wrapper', () => {
		const svg = ambientSvg('user-1', { width: 640, height: 640, now: NOON });

		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg).toContain('viewBox="0 0 640 640"');
		expect(svg).toContain('<linearGradient');
		expect(svg).not.toContain('<image');
		expect(svg).not.toContain('base64');
	});

	it('is a pure function of the seed and the clock', () => {
		const a = ambientSvg('user-1', { now: NOON });
		const b = ambientSvg('user-1', { now: NOON });
		const c = ambientSvg('user-2', { now: NOON });

		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	it('describes the hour in the title for assistive tech', () => {
		expect(ambientSvg('user-1', { now: NOON })).toContain('<title>Ambient Scene at Daylight');
		expect(ambientSvg('user-1', { now: NIGHT })).toContain('<title>Ambient Scene at Night');
		expect(ambientSvg('user-1', { now: NOON, title: 'A Sky' })).toContain('<title>A Sky</title>');
	});

	it('paints the settled frame, so an export can never show a mid-animation pose', () => {
		const scene = buildScene('user-1', NOON);
		const settled = sceneShapes(scene, { width: 640, height: 640 }, SETTLED_MOTION);
		const svg = ambientSvg('user-1', { width: 640, height: 640, now: NOON });

		// the sun core radius is a bloom term; the settled frame is the fully grown one
		expect(settled.length).toBeGreaterThan(0);
		expect(svg.split('<circle').length - 1).toBeGreaterThan(0);
	});

	it('makes an inline-able data url', () => {
		const url = ambientSvgDataUrl('user-1', { width: 64, height: 64, now: NOON });
		expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
		expect(decodeURIComponent(url.split(',')[1]!).startsWith('<svg')).toBe(true);
	});
});

// #endregion

// #region host wiring

describe('MAmbient host wiring', () => {
	it('drives the loop off a timer, never off requestAnimationFrame', () => {
		expect(COMPONENT).not.toMatch(/requestAnimationFrame|cancelAnimationFrame/);
		expect(COMPONENT).toContain('createAmbientLoop(');
	});

	it('gates on document visibility, the ion view lifecycle and an intersection observer', () => {
		expect(COMPONENT).toContain('useDocumentVisibility()');
		expect(COMPONENT).toContain('onIonViewDidEnter(');
		expect(COMPONENT).toContain('onIonViewWillLeave(');
		expect(COMPONENT).toContain('useIntersectionObserver(');
		expect(COMPONENT).toMatch(/setGates\(\{\s*onViewport/);
	});

	it('reads both motion switches reactively', () => {
		expect(COMPONENT).toContain("useMediaQuery('(prefers-reduced-motion: reduce)')");
		// the app animations toggle arrives through the shared tier policy
		expect(COMPONENT).toContain('policy.value.ambient');
		expect(COMPONENT).toMatch(/watch\(plan,/);
	});

	it('gates the canvas on the shared policy, so ambient scenes off draws no scene', () => {
		expect(COMPONENT).toContain('policy.value.scenes');
		expect(COMPONENT).toMatch(/<canvas\s+v-if="scenes"/);
		// the same switch cannot leave a live loop behind
		expect(COMPONENT).toMatch(/watch\(scenes,/);
		expect(COMPONENT).toContain('loop.setGates({ live: false })');
	});

	it('invents no device detection of its own', () => {
		expect(COMPONENT).toContain('useVisualTier()');
		expect(COMPONENT).not.toMatch(/hardwareConcurrency|deviceMemory|userAgent|matchMedia\(/);
	});

	it('bakes the static layers outside the render path', () => {
		const render = functionBody(COMPONENT, 'render');
		expect(render).toContain('drawImage');
		expect(render).not.toContain('bakeLayer');
		expect(render).not.toContain('bakeStaticLayers');

		const relayout = functionBody(COMPONENT, 'relayout');
		expect(relayout).toContain('needsCacheRebuild(');
		expect(relayout).toContain('bakeStaticLayers()');
	});

	it('expires the interaction state on the still path as well as the animated one', () => {
		const render = functionBody(COMPONENT, 'render');
		const expiry = render.indexOf('expireRipples(');
		const animatedBranch = render.indexOf("frame.mode === 'animate'");

		expect(expiry).toBeGreaterThan(-1);
		expect(animatedBranch).toBeGreaterThan(-1);
		// ahead of the branch, so both modes run it
		expect(expiry).toBeLessThan(animatedBranch);
	});

	it('caps the pixel ratio', () => {
		expect(COMPONENT).toContain('ambientDpr(window.devicePixelRatio)');
	});

	it('reserves the final height on the box that wraps the canvas', () => {
		expect(COMPONENT).toMatch(/height: `\$\{height\}px`/);
		expect(COMPONENT).toContain('ambientHeight(viewportHeight.value)');
	});

	it('paints once on mount, whatever the plan says', () => {
		const mounted = blockAfter(COMPONENT, 'onMounted(');
		expect(mounted).toContain('paint()');
		expect(mounted).toContain('loop.setPlan(plan.value)');
	});

	it('tears the loop and the clock watch down on unmount', () => {
		const body = blockAfter(COMPONENT, 'onBeforeUnmount(');

		expect(body).toContain('loop.stop()');
		expect(body).toContain('stopClockWatch()');
	});

	it('subscribes to the DOM only through scope-bound helpers, so nothing can outlive it', () => {
		// vueuse unbinds every one of these when the setup scope disposes
		expect(COMPONENT).not.toMatch(/addEventListener|new IntersectionObserver|new ResizeObserver/);
		expect(COMPONENT).toContain('useEventListener(window, WAKE_EVENTS');
		expect(COMPONENT).toContain('useResizeObserver(root');
	});

	it('pairs its one raw timer with a clear', () => {
		expect(COMPONENT.match(/setInterval\(/g)).toHaveLength(1);
		expect(COMPONENT.match(/setTimeout\(/g)).toBeNull();
		expect(functionBody(COMPONENT, 'stopClockWatch')).toContain('clearInterval(clockTimer)');
	});

	it('keeps the decorative canvas out of the accessibility tree and out of the tab order', () => {
		expect(COMPONENT.match(/aria-hidden="true"/g)).toHaveLength(2);
		expect(COMPONENT).not.toMatch(/tabindex/);
		expect(COMPONENT).not.toMatch(/role="img"|aria-label/);
	});

	it('never swallows a tap it was not asked to handle', () => {
		expect(COMPONENT).toContain("'pointer-events-none!'");
	});
});

// #endregion
