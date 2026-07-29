import {
	blendHex,
	brightenHex,
	dimHex,
	NIGHT_TINT,
	polylinePath,
	type SceneBox,
	type ScenePoint,
	type Shape
} from '~/utils/scene';
import { hashString, seededRandom } from '~/utils/seed';

// #region moment

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

/** local-clock buckets; matches crust's circles.ts so web and mobile read the same hour */
export function timeOfDayFor(date: Date): TimeOfDay {
	const h = date.getHours();
	if (h < 5 || h >= 20) return 'night';
	if (h < 8) return 'dawn';
	if (h < 17) return 'day';
	return 'dusk';
}

/** 0 in daylight, 1 at night; the whole palette is a lerp on this one scalar */
export const NIGHT_FACTORS: Record<TimeOfDay, number> = {
	dawn: 0.55,
	day: 0,
	dusk: 0.68,
	night: 1
};

// #endregion

// #region palette

export interface ScenePalette {
	skyTop: string;
	skyBottom: string;
	/** distant hill band before haze */
	hill: string;
	ground: string;
	groundShadow: string;
	light: string;
	/** the scalar every other value was derived from */
	night: number;
}

// the ground family leads with the sky brand green (--ion-color-primary) so the ambient
// scene reads as the app rather than as a stock illustration
const EARTH_PALETTE = {
	skyTop: ['#a9dcf5', '#0a1836'],
	skyBottom: ['#fbe4c0', '#243056'],
	dusk: '#f59e42',
	dawn: '#fca5a5',
	hill: '#35c25a',
	ground: '#1ebb48',
	groundShadow: '#0f5f26',
	light: ['#fff7d6', '#cfd9ff']
} as const;

export function scenePalette(timeOfDay: TimeOfDay): ScenePalette {
	const night = NIGHT_FACTORS[timeOfDay];

	let skyBottom = blendHex(EARTH_PALETTE.skyBottom[0], EARTH_PALETTE.skyBottom[1], night);
	if (timeOfDay === 'dusk') skyBottom = blendHex(skyBottom, EARTH_PALETTE.dusk, 0.28);
	else if (timeOfDay === 'dawn') skyBottom = blendHex(skyBottom, EARTH_PALETTE.dawn, 0.24);

	return {
		skyTop: blendHex(EARTH_PALETTE.skyTop[0], EARTH_PALETTE.skyTop[1], night),
		skyBottom,
		hill: dimHex(EARTH_PALETTE.hill, night),
		ground: dimHex(EARTH_PALETTE.ground, night),
		groundShadow: dimHex(EARTH_PALETTE.groundShadow, night),
		light: blendHex(EARTH_PALETTE.light[0], EARTH_PALETTE.light[1], night),
		night
	};
}

// #endregion

// #region motion

export interface SceneMotion {
	/** ms since the scene started */
	time: number;
	/** 0..1 grow-in; 1 is settled */
	bloom: number;
	/** false pins every oscillator to its settled value */
	animate: boolean;
}

/**
 * The settled frame.
 *
 * There is no second, static renderer. Every oscillator below is written
 * `motion.animate ? Math.sin(motion.time * k + phase) * amp : <settled constant>`, so
 * handing this to the animated renderer emits the export frame - one code path, so an
 * export can never drift from the picture the user is looking at.
 */
export const SETTLED_MOTION: SceneMotion = { time: 0, bloom: 1, animate: false };

// #endregion

// #region scene

export interface EarthScene {
	seed: string;
	timeOfDay: TimeOfDay;
	palette: ScenePalette;
}

/** the scene is a pure function of (seed, clock); nothing is persisted, so it cannot desync */
export function buildScene(seed: string, now: Date): EarthScene {
	const timeOfDay = timeOfDayFor(now);
	return { seed, timeOfDay, palette: scenePalette(timeOfDay) };
}

const SEED_NS = 'sky:scene:v1';

// one stream per subsystem, so adding a subsystem never shifts an existing one
function stream(seed: string, subsystem: string): () => number {
	return seededRandom(hashString(`${SEED_NS}:${seed}:${subsystem}`));
}

interface SceneLayout {
	width: number;
	height: number;
	groundY: number;
	palette: ScenePalette;
}

function layoutFor(scene: EarthScene, box: SceneBox): SceneLayout {
	const width = Math.max(1, box.width);
	const height = Math.max(1, box.height);
	const rng = stream(scene.seed, 'horizon');
	return {
		width,
		height,
		groundY: Math.round(height * (0.58 + rng() * 0.08)),
		palette: scene.palette
	};
}

// #endregion

// #region sky

function skyShape(layout: SceneLayout): Shape {
	const { palette, groundY, width } = layout;
	return {
		kind: 'rect',
		x: 0,
		y: 0,
		w: width,
		h: groundY + 1,
		fill: {
			kind: 'linear',
			x1: 0,
			y1: 0,
			x2: 0,
			y2: groundY,
			stops: [
				{ at: 0, color: palette.skyTop },
				{ at: 1, color: palette.skyBottom }
			]
		}
	};
}

function celestialSpot(scene: EarthScene, layout: SceneLayout) {
	const lean = stream(scene.seed, 'celestial')() * 2 - 1;
	const r = Math.max(13, Math.min(layout.width * 0.05, layout.height * 0.075));
	switch (scene.timeOfDay) {
		case 'dawn':
			return { x: layout.width * (0.5 + lean * 0.3), y: layout.groundY * 0.62, r };
		case 'dusk':
			return { x: layout.width * (0.5 + lean * 0.32), y: layout.groundY * 0.6, r };
		case 'night':
			return { x: layout.width * (0.5 + lean * 0.26), y: layout.groundY * 0.3, r };
		default:
			return { x: layout.width * (0.5 + lean * 0.3), y: layout.groundY * 0.26, r };
	}
}

function sunShapes(scene: EarthScene, layout: SceneLayout, motion: SceneMotion): Shape[] {
	const { x, y, r } = celestialSpot(scene, layout);
	const low = scene.timeOfDay !== 'day';
	const core = low
		? blendHex(layout.palette.light, '#ffb066', 0.35)
		: brightenHex(layout.palette.light, 0.12);
	const pulse = motion.animate ? 0.6 + Math.sin(motion.time * 0.0006) * 0.08 : 0.6;
	const halo = r * 3.4 * (0.7 + motion.bloom * 0.3);

	return [
		{
			kind: 'circle',
			cx: x,
			cy: y,
			r: halo,
			fill: {
				kind: 'radial',
				x1: x,
				y1: y,
				r1: r * 0.4,
				x2: x,
				y2: y,
				r2: halo,
				stops: [
					{ at: 0, color: core, alpha: pulse },
					{ at: 1, color: core, alpha: 0 }
				]
			}
		},
		{ kind: 'circle', cx: x, cy: y, r: r * (0.6 + motion.bloom * 0.4), fill: core }
	];
}

const MOON_CRATERS = 3;

function moonShapes(scene: EarthScene, layout: SceneLayout, motion: SceneMotion): Shape[] {
	const { x, y, r } = celestialSpot(scene, layout);
	const rng = stream(scene.seed, 'moon');
	const face = blendHex('#f5f3ea', layout.palette.skyTop, 0.06);
	const shadow = blendHex(NIGHT_TINT, layout.palette.skyTop, 0.45);
	const glow = motion.animate ? 0.34 + Math.sin(motion.time * 0.0004) * 0.06 : 0.34;
	const halo = r * 3.2 * (0.7 + motion.bloom * 0.3);

	const craters: Shape[] = [];
	for (let i = 0; i < MOON_CRATERS; i++) {
		craters.push({
			kind: 'circle',
			cx: (rng() * 2 - 1) * r * 0.45,
			cy: (rng() * 2 - 1) * r * 0.45,
			r: r * (0.1 + rng() * 0.12),
			fill: shadow,
			fillAlpha: 0.35
		});
	}

	return [
		{
			kind: 'circle',
			cx: x,
			cy: y,
			r: halo,
			fill: {
				kind: 'radial',
				x1: x,
				y1: y,
				r1: r * 0.4,
				x2: x,
				y2: y,
				r2: halo,
				stops: [
					{ at: 0, color: face, alpha: glow },
					{ at: 1, color: face, alpha: 0 }
				]
			}
		},
		{
			kind: 'group',
			x,
			y,
			children: [
				{
					kind: 'circle',
					cx: 0,
					cy: 0,
					r: r * (0.6 + motion.bloom * 0.4),
					fill: face,
					stroke: face,
					strokeAlpha: 0.22,
					strokeWidth: 1
				},
				...craters
			]
		}
	];
}

const CLOUD_COUNT = 3;

interface Cloud {
	x: number;
	y: number;
	s: number;
	speed: number;
}

function cloudLayer(scene: EarthScene, layout: SceneLayout): Cloud[] {
	const rng = stream(scene.seed, 'clouds');
	const out: Cloud[] = [];
	for (let i = 0; i < CLOUD_COUNT; i++) {
		out.push({
			// one cloud per band of the width; a free draw clustered all three on unlucky seeds
			x: ((i + rng()) / CLOUD_COUNT) * layout.width,
			y: layout.groundY * (0.12 + rng() * 0.3),
			s: layout.width * (0.08 + rng() * 0.07),
			speed: 0.0014 + rng() * 0.002
		});
	}
	return out;
}

function cloudShapes(scene: EarthScene, layout: SceneLayout, motion: SceneMotion): Shape[] {
	const { palette, width } = layout;
	const tint = blendHex('#ffffff', palette.skyBottom, 0.24 + palette.night * 0.5);
	const out: Shape[] = [];

	for (const cloud of cloudLayer(scene, layout)) {
		// wrap on a span wider than the box so a cloud leaves and re-enters off-frame
		const span = width + cloud.s * 4;
		const drift = motion.animate ? motion.time * cloud.speed : 0;
		const x = ((cloud.x + drift) % span) - cloud.s * 2;
		const alpha = 0.32 * (1 - palette.night * 0.88) * motion.bloom;
		out.push(
			{
				kind: 'ellipse',
				cx: x,
				cy: cloud.y,
				rx: cloud.s,
				ry: cloud.s * 0.34,
				fill: tint,
				fillAlpha: alpha
			},
			{
				kind: 'ellipse',
				cx: x + cloud.s * 0.58,
				cy: cloud.y + cloud.s * 0.1,
				rx: cloud.s * 0.58,
				ry: cloud.s * 0.24,
				fill: tint,
				fillAlpha: alpha
			},
			{
				kind: 'ellipse',
				cx: x - cloud.s * 0.54,
				cy: cloud.y + cloud.s * 0.12,
				rx: cloud.s * 0.5,
				ry: cloud.s * 0.22,
				fill: tint,
				fillAlpha: alpha
			}
		);
	}

	return out;
}

// #endregion

// #region ground

function horizonShapes(scene: EarthScene, layout: SceneLayout, motion: SceneMotion): Shape[] {
	const { palette, groundY, width, height } = layout;
	const phase = stream(scene.seed, 'ridge')() * Math.PI * 2;
	const sway = motion.animate ? Math.sin(motion.time * 0.00008) * 0.35 : 0;
	const bands = [
		{ amp: height * 0.11, lift: height * 0.09, freq: 0.011, haze: 0.6 },
		{ amp: height * 0.08, lift: height * 0.03, freq: 0.017, haze: 0.38 }
	];

	return bands.map((band, index) => {
		const points: ScenePoint[] = [{ x: -8, y: groundY + 4 }];
		for (let x = -8; x <= width + 8; x += 10) {
			const wave = Math.sin(x * band.freq + phase + sway + index) * 0.5 + 0.5;
			const ripple = Math.sin(x * band.freq * 2.7 + phase + sway) * 0.16;
			points.push({ x, y: groundY - band.lift - (wave + ripple) * band.amp });
		}
		points.push({ x: width + 8, y: groundY + 4 });
		return {
			kind: 'path' as const,
			d: polylinePath(points, true),
			fill: blendHex(palette.hill, palette.skyBottom, band.haze)
		};
	});
}

function groundShapes(layout: SceneLayout, motion: SceneMotion): Shape[] {
	const { palette, groundY, width, height } = layout;
	const seam = motion.animate ? 0.2 + Math.sin(motion.time * 0.0005) * 0.04 : 0.2;
	// dimHex desaturates toward luminance grey, which for a bright green barely darkens it;
	// without this the night ground read brighter than its own sky
	const sink = palette.night * 0.34;

	return [
		{
			kind: 'rect',
			x: 0,
			y: groundY,
			w: width,
			h: height - groundY,
			fill: {
				kind: 'linear',
				x1: 0,
				y1: groundY,
				x2: 0,
				y2: height,
				stops: [
					{ at: 0, color: brightenHex(palette.ground, 0.06 - sink) },
					{
						at: 1,
						color: brightenHex(blendHex(palette.ground, palette.groundShadow, 0.85), -sink)
					}
				]
			}
		},
		{
			kind: 'rect',
			x: 0,
			y: groundY - 1,
			w: width,
			h: 2,
			fill: palette.light,
			fillAlpha: seam * (1 - palette.night * 0.5)
		}
	];
}

function vignetteShape(layout: SceneLayout): Shape {
	const { width, height, palette } = layout;
	const inner = Math.min(width, height) * 0.34;
	const outer = Math.max(width, height) * 0.8;
	return {
		kind: 'rect',
		x: 0,
		y: 0,
		w: width,
		h: height,
		fill: {
			kind: 'radial',
			x1: width * 0.5,
			y1: height * 0.45,
			r1: inner,
			x2: width * 0.5,
			y2: height * 0.5,
			r2: outer,
			stops: [
				{ at: 0, color: '#000000', alpha: 0 },
				{ at: 1, color: '#000000', alpha: 0.1 + palette.night * 0.2 }
			]
		}
	};
}

// #endregion

// #region frame

/** the whole frame, in paint order; `motion` defaults to the settled export frame */
export function sceneShapes(
	scene: EarthScene,
	box: SceneBox,
	motion: SceneMotion = SETTLED_MOTION
): Shape[] {
	const layout = layoutFor(scene, box);
	const night = scene.timeOfDay === 'night';

	return [
		skyShape(layout),
		...(night ? moonShapes(scene, layout, motion) : sunShapes(scene, layout, motion)),
		...cloudShapes(scene, layout, motion),
		...horizonShapes(scene, layout, motion),
		...groundShapes(layout, motion),
		vignetteShape(layout)
	];
}

// #endregion
