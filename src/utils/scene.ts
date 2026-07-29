// #region shape ir

export interface GradientStop {
	at: number;
	color: string;
	alpha?: number;
}

export interface Gradient {
	kind: 'linear' | 'radial';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	/** radial only; the inner circle radius, which SVG folds into the stop offsets */
	r1?: number;
	r2?: number;
	stops: readonly GradientStop[];
}

export type Fill = string | Gradient;

export interface ShapeStyle {
	fill?: Fill;
	fillAlpha?: number;
	stroke?: string;
	strokeAlpha?: number;
	strokeWidth?: number;
	/** round caps and joins; strokes that end mid-air need it */
	round?: boolean;
}

/**
 * One scene described once as data, then painted by either backend.
 *
 * Two hand-written painters (canvas for the screen, SVG for an export) drift, and a drifted
 * export shows the user a different picture than the one they were looking at. Rotation is
 * DEGREES throughout - SVG's unit - and only the canvas painter converts to radians. Only a
 * `group` can clip, via a path `d` string.
 */
export type Shape =
	| ({ kind: 'rect'; x: number; y: number; w: number; h: number } & ShapeStyle)
	| ({ kind: 'circle'; cx: number; cy: number; r: number } & ShapeStyle)
	| ({
			kind: 'ellipse';
			cx: number;
			cy: number;
			rx: number;
			ry: number;
			/** degrees */
			rotate?: number;
	  } & ShapeStyle)
	| ({ kind: 'path'; d: string } & ShapeStyle)
	| {
			kind: 'group';
			x?: number;
			y?: number;
			/** degrees */
			rotate?: number;
			alpha?: number;
			/** a path `d`; children are clipped to it */
			clip?: string;
			children: Shape[];
	  };

export interface ScenePoint {
	x: number;
	y: number;
}

export interface SceneBox {
	width: number;
	height: number;
}

// #endregion

// #region geometry

const TAU = Math.PI * 2;

// two decimals is under a display pixel at 6x and keeps the svg byte-stable
function f(n: number): string {
	const rounded = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
	return String(rounded === 0 ? 0 : rounded);
}

export function polylinePath(points: readonly ScenePoint[], closed = true): string {
	const first = points[0];
	if (!first) return '';
	let d = `M${f(first.x)} ${f(first.y)}`;
	for (let i = 1; i < points.length; i++) {
		const p = points[i] as ScenePoint;
		d += `L${f(p.x)} ${f(p.y)}`;
	}
	return closed ? `${d}Z` : d;
}

/** closed curve through the midpoints, so a seeded polygon reads as an organic lump */
export function blobPath(points: readonly ScenePoint[]): string {
	const n = points.length;
	if (n < 3) return polylinePath(points, true);
	const at = (i: number) => points[((i % n) + n) % n] as ScenePoint;
	const mid = (a: ScenePoint, b: ScenePoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

	const start = mid(at(-1), at(0));
	let d = `M${f(start.x)} ${f(start.y)}`;
	for (let i = 0; i < n; i++) {
		const cur = at(i);
		const next = mid(at(i), at(i + 1));
		d += `Q${f(cur.x)} ${f(cur.y)} ${f(next.x)} ${f(next.y)}`;
	}
	return `${d}Z`;
}

export function quadPath(from: ScenePoint, control: ScenePoint, to: ScenePoint): string {
	return `M${f(from.x)} ${f(from.y)}Q${f(control.x)} ${f(control.y)} ${f(to.x)} ${f(to.y)}`;
}

export function linePath(x1: number, y1: number, x2: number, y2: number): string {
	return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
}

// #endregion

// #region color

const FALLBACK_COLOR = '#1ebb48';

interface Rgb {
	r: number;
	g: number;
	b: number;
}

function expand(digit: string): number {
	return parseInt(`${digit}${digit}`, 16);
}

// the IR speaks hex; rgb()/rgba() is accepted so `rgbaCss` output round-trips back in
function parseColor(color: string): Rgb | null {
	const value = color.trim();

	const hex = /^#([0-9a-f]+)$/i.exec(value);
	if (hex) {
		const d = hex[1] as string;
		if (d.length === 3 || d.length === 4) {
			return { r: expand(d[0] as string), g: expand(d[1] as string), b: expand(d[2] as string) };
		}
		if (d.length === 6 || d.length === 8) {
			return {
				r: parseInt(d.slice(0, 2), 16),
				g: parseInt(d.slice(2, 4), 16),
				b: parseInt(d.slice(4, 6), 16)
			};
		}
		return null;
	}

	const fn = /^rgba?\(([^)]*)\)$/i.exec(value);
	if (fn) {
		const parts = (fn[1] as string)
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map(Number);
		if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
		return { r: parts[0] as number, g: parts[1] as number, b: parts[2] as number };
	}

	return null;
}

function byte(n: number): number {
	return Math.round(n < 0 ? 0 : n > 255 ? 255 : n);
}

function toHex(c: Rgb): string {
	const part = (n: number) => byte(n).toString(16).padStart(2, '0');
	return `#${part(c.r)}${part(c.g)}${part(c.b)}`;
}

/** srgb mix that stays hex, so a palette value round-trips through both painters */
export function blendHex(from: string, to: string, amount: number): string {
	const a = parseColor(from);
	const b = parseColor(to);
	if (!a || !b) return a ? toHex(a) : FALLBACK_COLOR;
	const k = amount < 0 ? 0 : amount > 1 ? 1 : amount;
	return toHex({ r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k });
}

/** positive lightens toward white, negative darkens toward black; amount is 0..1 */
export function brightenHex(color: string, amount: number): string {
	return amount >= 0 ? blendHex(color, '#ffffff', amount) : blendHex(color, '#000000', -amount);
}

export const NIGHT_TINT = '#10182e';

/**
 * Desaturate, then cool toward the night sky; `night` of 0 leaves the color untouched.
 *
 * Two steps, not one flat multiply: a multiply keeps full saturation and reads as the same
 * picture with the lights turned down, while dropping toward luminance grey first is what
 * makes colour genuinely leave the scene the way it does at dusk.
 */
export function dimHex(color: string, night: number): string {
	const parsed = parseColor(color);
	if (!parsed) return FALLBACK_COLOR;
	const base = toHex(parsed);
	if (night <= 0) return base;
	const lum = 0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b;
	const grey = toHex({ r: lum, g: lum, b: lum });
	return blendHex(blendHex(base, grey, night * 0.5), NIGHT_TINT, night * 0.45);
}

export function rgbaCss(color: string, alpha: number): string {
	const parsed = parseColor(color) ?? { r: 30, g: 187, b: 72 };
	const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
	return `rgba(${byte(parsed.r)}, ${byte(parsed.g)}, ${byte(parsed.b)}, ${a.toFixed(3)})`;
}

// #endregion

// #region canvas backend

function canvasGradient(c: CanvasRenderingContext2D, g: Gradient): CanvasGradient {
	const grad =
		g.kind === 'linear'
			? c.createLinearGradient(g.x1, g.y1, g.x2, g.y2)
			: c.createRadialGradient(g.x1, g.y1, g.r1 ?? 0, g.x2, g.y2, g.r2 ?? 1);
	for (const stop of g.stops) {
		grad.addColorStop(
			Math.min(1, Math.max(0, stop.at)),
			stop.alpha === undefined ? stop.color : rgbaCss(stop.color, stop.alpha)
		);
	}
	return grad;
}

function tracePath(c: CanvasRenderingContext2D, shape: Shape) {
	switch (shape.kind) {
		case 'rect':
			c.beginPath();
			c.rect(shape.x, shape.y, Math.max(0, shape.w), Math.max(0, shape.h));
			break;
		case 'circle':
			c.beginPath();
			c.arc(shape.cx, shape.cy, Math.max(0, shape.r), 0, TAU);
			break;
		case 'ellipse':
			c.beginPath();
			c.ellipse(
				shape.cx,
				shape.cy,
				Math.max(0, shape.rx),
				Math.max(0, shape.ry),
				((shape.rotate ?? 0) * Math.PI) / 180,
				0,
				TAU
			);
			break;
		default:
			break;
	}
}

/** paints the IR onto a 2D context; the SVG backend serialises the very same shapes */
export function paintShapes(c: CanvasRenderingContext2D, shapes: readonly Shape[]): void {
	for (const shape of shapes) {
		if (shape.kind === 'group') {
			c.save();
			if (shape.x || shape.y) c.translate(shape.x ?? 0, shape.y ?? 0);
			if (shape.rotate) c.rotate((shape.rotate * Math.PI) / 180);
			// multiply, never assign, so a nested group composites against its parent
			if (shape.alpha !== undefined) c.globalAlpha *= shape.alpha;
			if (shape.clip) c.clip(new Path2D(shape.clip));
			paintShapes(c, shape.children);
			c.restore();
			continue;
		}

		const geometry = shape.kind === 'path' ? new Path2D(shape.d) : null;
		if (!geometry) tracePath(c, shape);

		if (shape.fill !== undefined) {
			// a flat fill folds its alpha into the colour; only a gradient has to reach for
			// globalAlpha, and then it multiplies whatever the enclosing group set
			const gradient = typeof shape.fill !== 'string';
			const scoped = gradient && shape.fillAlpha !== undefined;
			const prior = c.globalAlpha;
			if (scoped) c.globalAlpha = prior * (shape.fillAlpha as number);
			c.fillStyle = gradient
				? canvasGradient(c, shape.fill as Gradient)
				: shape.fillAlpha === undefined
					? (shape.fill as string)
					: rgbaCss(shape.fill as string, shape.fillAlpha);
			if (geometry) c.fill(geometry);
			else c.fill();
			if (scoped) c.globalAlpha = prior;
		}

		if (shape.stroke !== undefined) {
			c.strokeStyle =
				shape.strokeAlpha === undefined ? shape.stroke : rgbaCss(shape.stroke, shape.strokeAlpha);
			c.lineWidth = shape.strokeWidth ?? 1;
			c.lineCap = shape.round ? 'round' : 'butt';
			c.lineJoin = shape.round ? 'round' : 'miter';
			if (geometry) c.stroke(geometry);
			else c.stroke();
		}
	}
}

// #endregion

// #region svg backend

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

class GradientRegistry {
	private readonly ids = new Map<string, string>();
	readonly defs: string[] = [];

	ref(g: Gradient): string {
		const key = JSON.stringify(g);
		const existing = this.ids.get(key);
		if (existing) return existing;

		const id = `sg${this.ids.size}`;
		this.ids.set(key, id);

		// SVG radial gradients have no inner radius, so an inner circle folds into the stop
		// offsets instead; the focal point carries the offset centre
		const inner = g.kind === 'radial' ? (g.r1 ?? 0) / Math.max(1e-6, g.r2 ?? 1) : 0;
		const stops = g.stops
			.map((stop) => {
				const at = g.kind === 'radial' ? inner + stop.at * (1 - inner) : stop.at;
				const alpha = stop.alpha === undefined ? '' : ` stop-opacity="${f(stop.alpha)}"`;
				return `<stop offset="${f(Math.min(1, Math.max(0, at)))}" stop-color="${stop.color}"${alpha}/>`;
			})
			.join('');

		this.defs.push(
			g.kind === 'linear'
				? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(g.x1)}" y1="${f(g.y1)}" x2="${f(g.x2)}" y2="${f(g.y2)}">${stops}</linearGradient>`
				: `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(g.x2)}" cy="${f(g.y2)}" r="${f(g.r2 ?? 1)}" fx="${f(g.x1)}" fy="${f(g.y1)}">${stops}</radialGradient>`
		);
		return id;
	}

	clip(d: string): string {
		const key = `clip:${d}`;
		const existing = this.ids.get(key);
		if (existing) return existing;
		const id = `sg${this.ids.size}`;
		this.ids.set(key, id);
		this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
		return id;
	}
}

function styleAttrs(
	shape: Shape & { kind: 'rect' | 'circle' | 'ellipse' | 'path' },
	defs: GradientRegistry
): string {
	let out = '';
	if (shape.fill === undefined) out += ' fill="none"';
	else if (typeof shape.fill === 'string') out += ` fill="${shape.fill}"`;
	else out += ` fill="url(#${defs.ref(shape.fill)})"`;
	if (shape.fillAlpha !== undefined) out += ` fill-opacity="${f(shape.fillAlpha)}"`;
	if (shape.stroke !== undefined) {
		out += ` stroke="${shape.stroke}" stroke-width="${f(shape.strokeWidth ?? 1)}"`;
		if (shape.strokeAlpha !== undefined) out += ` stroke-opacity="${f(shape.strokeAlpha)}"`;
		if (shape.round) out += ' stroke-linecap="round" stroke-linejoin="round"';
	}
	return out;
}

function shapeToSvg(shape: Shape, defs: GradientRegistry): string {
	if (shape.kind === 'group') {
		const transform: string[] = [];
		if (shape.x || shape.y) transform.push(`translate(${f(shape.x ?? 0)} ${f(shape.y ?? 0)})`);
		if (shape.rotate) transform.push(`rotate(${f(shape.rotate)})`);
		let attrs = transform.length ? ` transform="${transform.join(' ')}"` : '';
		if (shape.alpha !== undefined) attrs += ` opacity="${f(shape.alpha)}"`;
		if (shape.clip) attrs += ` clip-path="url(#${defs.clip(shape.clip)})"`;
		return `<g${attrs}>${shape.children.map((child) => shapeToSvg(child, defs)).join('')}</g>`;
	}

	const style = styleAttrs(shape, defs);
	switch (shape.kind) {
		case 'rect':
			return `<rect x="${f(shape.x)}" y="${f(shape.y)}" width="${f(Math.max(0, shape.w))}" height="${f(Math.max(0, shape.h))}"${style}/>`;
		case 'circle':
			return `<circle cx="${f(shape.cx)}" cy="${f(shape.cy)}" r="${f(Math.max(0, shape.r))}"${style}/>`;
		case 'ellipse': {
			const spin = shape.rotate
				? ` transform="rotate(${f(shape.rotate)} ${f(shape.cx)} ${f(shape.cy)})"`
				: '';
			return `<ellipse cx="${f(shape.cx)}" cy="${f(shape.cy)}" rx="${f(Math.max(0, shape.rx))}" ry="${f(Math.max(0, shape.ry))}"${spin}${style}/>`;
		}
		default:
			return `<path d="${shape.d}"${style}/>`;
	}
}

export interface SceneSvgOptions {
	/** viewBox size; the shapes were laid out in these units */
	width?: number;
	height?: number;
	/** an SVG <title>, for assistive tech; omitted when blank */
	title?: string;
	/** corner radius on the frame clip */
	radius?: number;
}

/**
 * The same shapes as real vector output.
 *
 * Self-contained by construction: no DOM, no external font, no raster fallback, no script -
 * pure string building, so it runs in a worker, a test, or on a Capacitor webview thread
 * with no canvas at all.
 */
export function sceneToSvg(shapes: readonly Shape[], opts: SceneSvgOptions = {}): string {
	const width = Math.max(1, Math.round(opts.width ?? 640));
	const height = Math.max(1, Math.round(opts.height ?? 360));
	const radius = Math.max(0, opts.radius ?? 0);

	const defs = new GradientRegistry();
	// serialise the body first so every gradient and clip is registered before <defs>
	const body = shapes.map((shape) => shapeToSvg(shape, defs)).join('');
	const frameId = 'skyframe';
	const frame = `<clipPath id="${frameId}"><rect x="0" y="0" width="${width}" height="${height}" rx="${f(radius)}" ry="${f(radius)}"/></clipPath>`;
	const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : '';

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="0 0 ${width} ${height}" role="img">` +
		title +
		`<defs>${frame}${defs.defs.join('')}</defs>` +
		`<g clip-path="url(#${frameId})">${body}</g>` +
		`</svg>`
	);
}

// #endregion
