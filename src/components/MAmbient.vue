<template>
	<div
		ref="root"
		aria-hidden="true"
		:class="[
			'm-ambient relative overflow-hidden select-none',
			interactive ? 'touch-manipulation' : 'pointer-events-none!'
		]"
		:style="{ height: `${height}px`, background: backdrop }"
		@pointerdown="onPointerDown"
	>
		<canvas
			v-if="scenes"
			ref="surface"
			aria-hidden="true"
			class="block! size-full!"
		/>
	</div>
</template>

<script setup lang="ts">
import { onIonViewDidEnter, onIonViewWillLeave } from '@ionic/vue';
import { useAmbientExport, type AmbientExportOptions } from '~/composables/useAmbientExport';
import {
	AMBIENT_NO_SPLIT,
	ambientBackingSize,
	ambientCacheKey,
	ambientDpr,
	ambientHeight,
	ambientLayerSplit,
	ambientPlan,
	createAmbientLoop,
	expireRipples,
	needsCacheRebuild,
	pushRipple,
	rippleShapes,
	type AmbientCacheKey,
	type AmbientFrame,
	type AmbientLayerSplit,
	type AmbientRipple
} from '~/utils/ambient';
import { paintShapes, type SceneBox, type Shape } from '~/utils/scene';
import {
	buildScene,
	scenePalette,
	sceneShapes,
	SETTLED_MOTION,
	timeOfDayFor,
	type EarthScene,
	type SceneMotion,
	type TimeOfDay
} from '~/utils/scene-earth';

const props = withDefaults(
	defineProps<{
		/** account-scoped, never a device value; the same id must always paint the same scene */
		seed: string;
		height?: number;
		interactive?: boolean;
	}>(),
	{ height: undefined, interactive: false }
);

const BLOOM_MS = 900;
const CLOCK_TICK_MS = 60_000;
const RIPPLE_REACH = 0.32;
// capture phase, so a scroll inside ion-content's own scroller still counts as a wake
const WAKE_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'scroll', 'keydown'] as const;

const root = ref<HTMLElement | null>(null);
const surface = ref<HTMLCanvasElement | null>(null);

const { width: windowWidth, height: windowHeight } = useWindowSize();
// captured, not tracked: ios changes innerHeight as its toolbar collapses, and reserving a height
// that moves with the scroll is the layout shift this box exists to avoid
const viewportHeight = ref(windowHeight.value);
const height = computed(() =>
	Math.max(1, Math.round(props.height ?? ambientHeight(viewportHeight.value)))
);

const timeOfDay = ref<TimeOfDay>(timeOfDayFor(new Date()));
const { ambientSvg } = useAmbientExport();

// #region policy

const visibility = useDocumentVisibility();
// reactive, so toggling the OS setting mid-session lands without a remount
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const { policy } = useVisualTier();

const plan = computed(() =>
	ambientPlan({
		tier: policy.value.tier,
		frameBudgetMs: policy.value.frameBudgetMs,
		ambient: policy.value.ambient,
		prefersReducedMotion: prefersReducedMotion.value
	})
);

// the Ambient Scenes setting, resolved with the tier rather than beside it; off drops the canvas and
// leaves the css backdrop as the whole scene
const scenes = computed(() => policy.value.scenes);

/**
 * The css fallback under the canvas.
 *
 * A 2D context can be refused (webkit under memory pressure), and a hole where the sky was is worse
 * than an approximate sky; the horizon stop is the middle of the seeded 58-66% band, which only
 * shows when there is no bitmap to cover it.
 */
const backdrop = computed(() => {
	const palette = scenePalette(timeOfDay.value);
	return `linear-gradient(180deg, ${palette.skyTop} 0%, ${palette.skyBottom} 62%, ${palette.ground} 62%)`;
});

// #endregion

// #region render state

let scene: EarthScene = buildScene(props.seed, new Date());
let ctx: CanvasRenderingContext2D | null = null;
let backLayer: HTMLCanvasElement | null = null;
let frontLayer: HTMLCanvasElement | null = null;
let split: AmbientLayerSplit = AMBIENT_NO_SPLIT;
let cacheKey: AmbientCacheKey | null = null;
let ripples: AmbientRipple[] = [];
let cssW = 1;
let cssH = 1;
let dpr = 1;
let clockTimer: ReturnType<typeof setInterval> | null = null;

function easeOut(k: number): number {
	return 1 - (1 - k) ** 3;
}

function box(): SceneBox {
	return { width: cssW, height: cssH };
}

function bakeLayer(reuse: HTMLCanvasElement | null, shapes: Shape[]): HTMLCanvasElement | null {
	const size = ambientBackingSize(cssW, cssH, dpr);
	const canvas = reuse ?? document.createElement('canvas');

	// assigning either dimension clears the bitmap and the transform, which is what a rebuild wants
	canvas.width = size.width;
	canvas.height = size.height;

	const c = canvas.getContext('2d');
	if (!c) return null;

	c.setTransform(dpr, 0, 0, dpr, 0, 0);
	paintShapes(c, shapes);
	return canvas;
}

/** the two static halves of the frame, painted once per resize instead of once per frame */
function bakeStaticLayers(): void {
	const settled = sceneShapes(scene, box(), SETTLED_MOTION);
	split = ambientLayerSplit(settled);
	if (split.back === 0) {
		backLayer = null;
		frontLayer = null;
		return;
	}

	backLayer = bakeLayer(backLayer, settled.slice(0, split.back));
	frontLayer = bakeLayer(frontLayer, settled.slice(settled.length - split.front));

	if (!backLayer || !frontLayer) {
		backLayer = null;
		frontLayer = null;
		split = AMBIENT_NO_SPLIT;
	}
}

function render(frame: AmbientFrame): void {
	const c = ctx;
	if (!c) return;

	// both paths expire it, so interaction state cannot accumulate while motion is off
	ripples = expireRipples(ripples, frame.elapsed);

	const motion: SceneMotion =
		frame.mode === 'animate'
			? {
					time: frame.elapsed,
					bloom: easeOut(Math.min(1, frame.elapsed / BLOOM_MS)),
					animate: true
				}
			: SETTLED_MOTION;
	const shapes = sceneShapes(scene, box(), motion);

	c.clearRect(0, 0, cssW, cssH);
	if (split.back > 0 && backLayer && frontLayer) {
		c.drawImage(backLayer, 0, 0, cssW, cssH);
		paintShapes(c, shapes.slice(split.back, shapes.length - split.front));
		c.drawImage(frontLayer, 0, 0, cssW, cssH);
	} else {
		paintShapes(c, shapes);
	}

	if (ripples.length > 0) {
		const reach = Math.min(cssW, cssH) * RIPPLE_REACH;
		paintShapes(c, rippleShapes(ripples, frame.elapsed, scene.palette.light, reach));
	}
}

const loop = createAmbientLoop({ draw: render });

function paint(): void {
	render({ mode: plan.value.animate ? 'animate' : 'still', elapsed: loop.elapsed });
}

function relayout(): boolean {
	const host = root.value;
	const canvas = surface.value;
	if (!host || !canvas) return false;

	cssW = Math.max(1, Math.round(host.clientWidth || 1));
	cssH = Math.max(1, Math.round(host.clientHeight || height.value));
	dpr = ambientDpr(window.devicePixelRatio);

	const size = ambientBackingSize(cssW, cssH, dpr);
	if (canvas.width !== size.width) canvas.width = size.width;
	if (canvas.height !== size.height) canvas.height = size.height;

	const c = canvas.getContext('2d');
	if (!c) {
		ctx = null;
		return false;
	}

	c.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx = c;

	const key = ambientCacheKey({
		width: cssW,
		height: cssH,
		dpr,
		timeOfDay: scene.timeOfDay,
		seed: props.seed
	});
	if (needsCacheRebuild(cacheKey, key)) {
		cacheKey = key;
		bakeStaticLayers();
	}

	return true;
}

function refresh(): void {
	if (relayout()) paint();
}

// #endregion

// #region lifecycle

function startClockWatch(): void {
	if (clockTimer !== null) return;

	// the palette is a function of the hour, so a page left open across dusk has to roll over
	clockTimer = setInterval(() => {
		if (visibility.value === 'hidden') return;

		const next = timeOfDayFor(new Date());
		if (next === timeOfDay.value) return;

		timeOfDay.value = next;
		scene = buildScene(props.seed, new Date());
		refresh();
	}, CLOCK_TICK_MS);
}

function stopClockWatch(): void {
	if (clockTimer === null) return;

	clearInterval(clockTimer);
	clockTimer = null;
}

onMounted(() => {
	// ahead of the context check: with no bitmap the css backdrop is the scene, and it still rolls over
	startClockWatch();
	if (!relayout()) return;

	loop.setPlan(plan.value);
	loop.setGates({ visible: visibility.value !== 'hidden', live: true });
	paint();
});

onBeforeUnmount(() => {
	loop.stop();
	stopClockWatch();
	backLayer = null;
	frontLayer = null;
	ctx = null;
});

// ionic keeps tab pages mounted, so leaving a tab is a lifecycle event and not an unmount
onIonViewDidEnter(() => loop.setGates({ onScreen: true }));
onIonViewWillLeave(() => loop.setGates({ onScreen: false }));

watch(visibility, (state) => loop.setGates({ visible: state !== 'hidden' }));

// a page ionic keeps mounted but hides still reports no intersection, which covers the tab switch
// the ion hooks miss when this sits inside a page rather than being one
useIntersectionObserver(root, (entries) => {
	const entry = entries[0];
	loop.setGates({ onViewport: entry ? entry.isIntersecting : true });
});

useEventListener(window, WAKE_EVENTS, () => loop.poke(), { passive: true, capture: true });

useResizeObserver(root, () => refresh());

// declared ahead of the plan watcher so the context is dropped before anything tries to paint on it
watch(scenes, async (on) => {
	if (!on) {
		loop.setGates({ live: false });
		ctx = null;
		backLayer = null;
		frontLayer = null;
		// forget the cache key with the layers, so turning scenes back on re-bakes them
		cacheKey = null;
		return;
	}

	await nextTick();
	if (!relayout()) return;

	loop.setGates({ live: true });
	paint();
});

watch(plan, (next) => {
	loop.setPlan(next);
	// still is a settled frame, never a blank box
	if (!next.animate) paint();
});

watch(height, () => refresh(), { flush: 'post' });

// a rotation is a real viewport change; a collapsing ios toolbar is not
watch(windowWidth, () => (viewportHeight.value = windowHeight.value));

watch(
	() => props.seed,
	(seed) => {
		scene = buildScene(seed, new Date());
		timeOfDay.value = scene.timeOfDay;
		ripples = [];
		refresh();
	}
);

// #endregion

// #region interaction

function onPointerDown(event: PointerEvent): void {
	if (!props.interactive) return;

	loop.poke();
	// only the full tier carries the ripple layer, and only an animating loop can resolve one
	if (!plan.value.extras) return;

	const host = root.value;
	if (!host) return;

	const rect = host.getBoundingClientRect();
	ripples = pushRipple(ripples, {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
		at: loop.elapsed
	});
}

// #endregion

// #region export

function sceneBox(): SceneBox {
	return box();
}

/** the on-screen box as vector markup; off the render path, for a share card */
function toSvg(options: AmbientExportOptions = {}): string {
	return ambientSvg(props.seed, {
		...options,
		width: options.width ?? cssW,
		height: options.height ?? cssH
	});
}

defineExpose({ toSvg, sceneBox });

// #endregion
</script>
