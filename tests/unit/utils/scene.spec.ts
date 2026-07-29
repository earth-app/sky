// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import {
	blendHex,
	blobPath,
	brightenHex,
	dimHex,
	type Gradient,
	linePath,
	paintShapes,
	polylinePath,
	quadPath,
	rgbaCss,
	sceneToSvg
} from '~/utils/scene';
import {
	buildScene,
	NIGHT_FACTORS,
	sceneShapes,
	SETTLED_MOTION,
	timeOfDayFor
} from '~/utils/scene-earth';

const BOX = { width: 240, height: 120 };
const SEED = 'ambient';
const NOON = new Date(2026, 0, 15, 12, 0, 0);
const NIGHT = new Date(2026, 0, 15, 23, 0, 0);

class FakePath2D {
	constructor(readonly d: string) {}
}

beforeAll(() => {
	// node has no Path2D; the painter only ever constructs and hands it back to the context
	(globalThis as { Path2D?: unknown }).Path2D = FakePath2D;
});

// #region canvas mock

interface MockCall {
	op: string;
	args: readonly unknown[];
	alpha: number;
	fillStyle: unknown;
}

function mockContext() {
	const calls: MockCall[] = [];
	const stack: number[] = [];
	let alpha = 1;
	let fillStyle: unknown = '';

	const push = (op: string, ...args: unknown[]) => {
		calls.push({ op, args, alpha, fillStyle });
	};

	const gradientStub = () => {
		const stops: [number, string][] = [];
		return {
			stops,
			addColorStop(at: number, color: string) {
				stops.push([at, color]);
			}
		};
	};

	const ctx = {
		get globalAlpha() {
			return alpha;
		},
		set globalAlpha(value: number) {
			alpha = value;
			push('globalAlpha', value);
		},
		get fillStyle() {
			return fillStyle;
		},
		set fillStyle(value: unknown) {
			fillStyle = value;
		},
		strokeStyle: '' as unknown,
		lineWidth: 1,
		lineCap: 'butt',
		lineJoin: 'miter',
		save: () => {
			stack.push(alpha);
			push('save');
		},
		restore: () => {
			alpha = stack.pop() ?? 1;
			push('restore');
		},
		translate: (x: number, y: number) => push('translate', x, y),
		rotate: (angle: number) => push('rotate', angle),
		clip: (path: unknown) => push('clip', path),
		beginPath: () => push('beginPath'),
		rect: (...args: number[]) => push('rect', ...args),
		arc: (...args: number[]) => push('arc', ...args),
		ellipse: (...args: number[]) => push('ellipse', ...args),
		fill: (path?: unknown) => push('fill', path),
		stroke: (path?: unknown) => push('stroke', path),
		createLinearGradient: (...args: number[]) => {
			push('createLinearGradient', ...args);
			return gradientStub();
		},
		createRadialGradient: (...args: number[]) => {
			push('createRadialGradient', ...args);
			return gradientStub();
		}
	};

	return {
		calls,
		raw: ctx,
		ctx: ctx as unknown as CanvasRenderingContext2D,
		alphaWrites: () => calls.filter((c) => c.op === 'globalAlpha').map((c) => c.args[0]),
		opsOf: (op: string) => calls.filter((c) => c.op === op)
	};
}

const GRADIENT: Gradient = {
	kind: 'linear',
	x1: 0,
	y1: 0,
	x2: 0,
	y2: 10,
	stops: [
		{ at: 0, color: '#ffffff' },
		{ at: 1, color: '#000000', alpha: 0.5 }
	]
};

// #endregion

describe('sceneToSvg', () => {
	it('serialises the settled earth frame byte-for-byte', () => {
		const svg = sceneToSvg(sceneShapes(buildScene(SEED, NOON), BOX, SETTLED_MOTION), {
			...BOX,
			title: 'Ambient Scene',
			radius: 16
		});
		expect(svg).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120" role="img"><title>Ambient Scene</title><defs><clipPath id="skyframe"><rect x="0" y="0" width="240" height="120" rx="16" ry="16"/></clipPath><linearGradient id="sg0" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="70"><stop offset="0" stop-color="#a9dcf5"/><stop offset="1" stop-color="#fbe4c0"/></linearGradient><radialGradient id="sg1" gradientUnits="userSpaceOnUse" cx="48.14" cy="18.2" r="44.2" fx="48.14" fy="18.2"><stop offset="0.12" stop-color="#fff8db" stop-opacity="0.6"/><stop offset="1" stop-color="#fff8db" stop-opacity="0"/></radialGradient><linearGradient id="sg2" gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="120"><stop offset="0" stop-color="#2cbf53"/><stop offset="1" stop-color="#116d2b"/></linearGradient><radialGradient id="sg3" gradientUnits="userSpaceOnUse" cx="120" cy="60" r="192" fx="120" fy="54"><stop offset="0.21" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.1"/></radialGradient></defs><g clip-path="url(#skyframe)"><rect x="0" y="0" width="240" height="71" fill="url(#sg0)"/><circle cx="48.14" cy="18.2" r="44.2" fill="url(#sg1)"/><circle cx="48.14" cy="18.2" r="13" fill="#fff8db"/><ellipse cx="23.67" cy="15.7" rx="21.16" ry="7.2" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="35.95" cy="17.82" rx="12.28" ry="5.08" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="12.24" cy="18.24" rx="10.58" ry="4.66" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="93.15" cy="16.43" rx="20.11" ry="6.84" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="104.81" cy="18.44" rx="11.66" ry="4.83" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="82.29" cy="18.85" rx="10.05" ry="4.42" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="168.21" cy="23.53" rx="21.4" ry="7.28" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="180.62" cy="25.67" rx="12.41" ry="5.14" fill="#fef9f0" fill-opacity="0.32"/><ellipse cx="156.65" cy="26.1" rx="10.7" ry="4.71" fill="#fef9f0" fill-opacity="0.32"/><path d="M-8 74L-8 49.83L2 51.14L12 52.48L22 53.8L32 55.04L42 56.14L52 57.06L62 57.77L72 58.25L82 58.52L92 58.6L102 58.51L112 58.3L122 58.02L132 57.71L142 57.43L152 57.22L162 57.1L172 57.08L182 57.16L192 57.33L202 57.56L212 57.8L222 58L232 58.12L242 58.12L248 74Z" fill="#acd697"/><path d="M-8 74L-8 63.73L2 64.99L12 66.18L22 67.14L32 67.74L42 67.91L52 67.62L62 66.94L72 65.97L82 64.87L92 63.78L102 62.85L112 62.14L122 61.68L132 61.44L142 61.31L152 61.18L162 60.93L172 60.48L182 59.79L192 58.89L202 57.87L212 56.86L222 56.02L232 55.49L242 55.37L248 74Z" fill="#80cf81"/><rect x="0" y="70" width="240" height="50" fill="url(#sg2)"/><rect x="0" y="69" width="240" height="2" fill="#fff7d6" fill-opacity="0.2"/><rect x="0" y="0" width="240" height="120" fill="url(#sg3)"/></g></svg>"`
		);
	});

	it('serialises the settled night frame byte-for-byte', () => {
		// the day frame never exercises the moon branch or any night-scaled colour
		const svg = sceneToSvg(sceneShapes(buildScene(SEED, NIGHT), BOX, SETTLED_MOTION), {
			...BOX,
			title: 'Ambient Scene',
			radius: 16
		});
		expect(svg).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120" role="img"><title>Ambient Scene</title><defs><clipPath id="skyframe"><rect x="0" y="0" width="240" height="120" rx="16" ry="16"/></clipPath><linearGradient id="sg0" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="70"><stop offset="0" stop-color="#0a1836"/><stop offset="1" stop-color="#243056"/></linearGradient><radialGradient id="sg1" gradientUnits="userSpaceOnUse" cx="57.72" cy="21" r="41.6" fx="57.72" fy="21"><stop offset="0.13" stop-color="#e7e6df" stop-opacity="0.34"/><stop offset="1" stop-color="#e7e6df" stop-opacity="0"/></radialGradient><linearGradient id="sg2" gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="120"><stop offset="0" stop-color="#28493a"/><stop offset="1" stop-color="#182b25"/></linearGradient><radialGradient id="sg3" gradientUnits="userSpaceOnUse" cx="120" cy="60" r="192" fx="120" fy="54"><stop offset="0.21" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.3"/></radialGradient></defs><g clip-path="url(#skyframe)"><rect x="0" y="0" width="240" height="71" fill="url(#sg0)"/><circle cx="57.72" cy="21" r="41.6" fill="url(#sg1)"/><g transform="translate(57.72 21)"><circle cx="0" cy="0" r="13" fill="#e7e6df" stroke="#e7e6df" stroke-width="1" stroke-opacity="0.22"/><circle cx="-5.7" cy="2.78" r="1.35" fill="#0d1832" fill-opacity="0.35"/><circle cx="-5.04" cy="0.64" r="2.27" fill="#0d1832" fill-opacity="0.35"/><circle cx="-0.22" cy="4.79" r="1.5" fill="#0d1832" fill-opacity="0.35"/></g><ellipse cx="23.67" cy="15.7" rx="21.16" ry="7.2" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="35.95" cy="17.82" rx="12.28" ry="5.08" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="12.24" cy="18.24" rx="10.58" ry="4.66" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="93.15" cy="16.43" rx="20.11" ry="6.84" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="104.81" cy="18.44" rx="11.66" ry="4.83" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="82.29" cy="18.85" rx="10.05" ry="4.42" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="168.21" cy="23.53" rx="21.4" ry="7.28" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="180.62" cy="25.67" rx="12.41" ry="5.14" fill="#5d6682" fill-opacity="0.04"/><ellipse cx="156.65" cy="26.1" rx="10.7" ry="4.71" fill="#5d6682" fill-opacity="0.04"/><path d="M-8 74L-8 49.83L2 51.14L12 52.48L22 53.8L32 55.04L42 56.14L52 57.06L62 57.77L72 58.25L82 58.52L92 58.6L102 58.51L112 58.3L122 58.02L132 57.71L142 57.43L152 57.22L162 57.1L172 57.08L182 57.16L192 57.33L202 57.56L212 57.8L222 58L232 58.12L242 58.12L248 74Z" fill="#304857"/><path d="M-8 74L-8 63.73L2 64.99L12 66.18L22 67.14L32 67.74L42 67.91L52 67.62L62 66.94L72 65.97L82 64.87L92 63.78L102 62.85L112 62.14L122 61.68L132 61.44L142 61.31L152 61.18L162 60.93L172 60.48L182 59.79L192 58.89L202 57.87L212 56.86L222 56.02L232 55.49L242 55.37L248 74Z" fill="#365558"/><rect x="0" y="70" width="240" height="50" fill="url(#sg2)"/><rect x="0" y="69" width="240" height="2" fill="#cfd9ff" fill-opacity="0.1"/><rect x="0" y="0" width="240" height="120" fill="url(#sg3)"/></g></svg>"`
		);
	});

	it('emits the frame clip and the role, and omits an empty title', () => {
		const svg = sceneToSvg([], { width: 40, height: 20, radius: 4 });
		expect(svg).toBe(
			'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20" role="img">' +
				'<defs><clipPath id="skyframe"><rect x="0" y="0" width="40" height="20" rx="4" ry="4"/></clipPath></defs>' +
				'<g clip-path="url(#skyframe)"></g></svg>'
		);
	});

	it('escapes the title', () => {
		const svg = sceneToSvg([], { title: '<Ambient> & "Sky"' });
		expect(svg).toContain('<title>&lt;Ambient&gt; &amp; &quot;Sky&quot;</title>');
	});

	it('registers every gradient before <defs> is emitted', () => {
		const svg = sceneToSvg([{ kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: GRADIENT }], {
			width: 10,
			height: 10
		});
		// the body is serialised first; if it were not, this def would be missing entirely
		expect(svg).toContain('<linearGradient id="sg0"');
		expect(svg.indexOf('<linearGradient')).toBeLessThan(svg.indexOf('<g clip-path'));
		expect(svg).toContain('fill="url(#sg0)"');
	});

	it('dedupes identical gradients by value and numbers the rest', () => {
		const other: Gradient = { ...GRADIENT, x2: 5 };
		const svg = sceneToSvg(
			[
				{
					kind: 'rect',
					x: 0,
					y: 0,
					w: 10,
					h: 10,
					fill: { ...GRADIENT, stops: [...GRADIENT.stops] }
				},
				{ kind: 'circle', cx: 5, cy: 5, r: 5, fill: { ...GRADIENT, stops: [...GRADIENT.stops] } },
				{ kind: 'circle', cx: 5, cy: 5, r: 2, fill: other }
			],
			{ width: 10, height: 10 }
		);
		expect(svg.match(/<linearGradient/g)).toHaveLength(2);
		expect(svg.match(/url\(#sg0\)/g)).toHaveLength(2);
		expect(svg).toContain('url(#sg1)');
	});

	it('folds a radial inner radius into remapped stop offsets', () => {
		const svg = sceneToSvg(
			[
				{
					kind: 'circle',
					cx: 50,
					cy: 50,
					r: 40,
					fill: {
						kind: 'radial',
						x1: 50,
						y1: 50,
						r1: 10,
						x2: 50,
						y2: 50,
						r2: 40,
						stops: [
							{ at: 0, color: '#ffffff', alpha: 0.6 },
							{ at: 0.5, color: '#ffffff', alpha: 0.3 },
							{ at: 1, color: '#ffffff', alpha: 0 }
						]
					}
				}
			],
			{ width: 100, height: 100 }
		);
		// inner = 10/40 = 0.25, so at' = 0.25 + at * 0.75
		expect(svg).toContain('<stop offset="0.25" stop-color="#ffffff" stop-opacity="0.6"/>');
		expect(svg).toContain('<stop offset="0.63" stop-color="#ffffff" stop-opacity="0.3"/>');
		expect(svg).toContain('<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>');
		expect(svg).toContain('cx="50" cy="50" r="40" fx="50" fy="50"');
	});

	it('leaves linear gradient offsets alone', () => {
		const svg = sceneToSvg([{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: GRADIENT }]);
		expect(svg).toContain('<stop offset="0" stop-color="#ffffff"/>');
		expect(svg).toContain('<stop offset="1" stop-color="#000000" stop-opacity="0.5"/>');
	});

	it('clips a group through a registered clipPath', () => {
		const svg = sceneToSvg([
			{
				kind: 'group',
				x: 3,
				y: 4,
				rotate: 12,
				alpha: 0.5,
				clip: 'M0 0L10 0L10 10Z',
				children: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#1ebb48' }]
			}
		]);
		expect(svg).toContain('<clipPath id="sg0"><path d="M0 0L10 0L10 10Z"/></clipPath>');
		expect(svg).toContain(
			'<g transform="translate(3 4) rotate(12)" opacity="0.5" clip-path="url(#sg0)">'
		);
	});

	it('writes rotation in degrees, the way the IR stores it', () => {
		const svg = sceneToSvg([
			{ kind: 'ellipse', cx: 10, cy: 20, rx: 5, ry: 2, rotate: 45, fill: '#1ebb48' }
		]);
		expect(svg).toContain('transform="rotate(45 10 20)"');
	});

	it('marks a fill-less shape as fill="none" and carries stroke style', () => {
		const svg = sceneToSvg([
			{
				kind: 'path',
				d: 'M0 0L5 5',
				stroke: '#1ebb48',
				strokeAlpha: 0.4,
				strokeWidth: 1.5,
				round: true
			}
		]);
		expect(svg).toBe(
			'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img">' +
				'<defs><clipPath id="skyframe"><rect x="0" y="0" width="640" height="360" rx="0" ry="0"/></clipPath></defs>' +
				'<g clip-path="url(#skyframe)"><path d="M0 0L5 5" fill="none" stroke="#1ebb48" stroke-width="1.5" ' +
				'stroke-opacity="0.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>'
		);
	});

	it('clamps negative sizes instead of emitting them', () => {
		const svg = sceneToSvg([
			{ kind: 'rect', x: 0, y: 0, w: -10, h: -10, fill: '#1ebb48' },
			{ kind: 'circle', cx: 0, cy: 0, r: -4, fill: '#1ebb48' }
		]);
		expect(svg).toContain('width="0" height="0"');
		expect(svg).toContain('r="0"');
	});
});

describe('paintShapes', () => {
	it('balances save and restore around every group', () => {
		const m = mockContext();
		paintShapes(m.ctx, [
			{
				kind: 'group',
				alpha: 0.5,
				children: [
					{
						kind: 'group',
						x: 1,
						children: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#fff' }]
					},
					{ kind: 'group', rotate: 10, children: [] }
				]
			}
		]);

		let depth = 0;
		let lowest = 0;
		for (const call of m.calls) {
			if (call.op === 'save') depth++;
			if (call.op === 'restore') depth--;
			lowest = Math.min(lowest, depth);
		}
		expect(depth).toBe(0);
		expect(lowest).toBe(0);
		expect(m.opsOf('save')).toHaveLength(3);
		expect(m.opsOf('restore')).toHaveLength(3);
	});

	it('multiplies group alpha instead of assigning it', () => {
		const m = mockContext();
		paintShapes(m.ctx, [
			{
				kind: 'group',
				alpha: 0.5,
				children: [
					{
						kind: 'group',
						alpha: 0.5,
						children: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: GRADIENT, fillAlpha: 0.5 }]
					}
				]
			}
		]);

		// 0.5 * 0.5 group, then * 0.5 for the gradient's own alpha
		expect(m.alphaWrites()).toEqual([0.5, 0.25, 0.125, 0.25]);
		expect(m.opsOf('fill')[0]?.alpha).toBe(0.125);
	});

	it('does not touch globalAlpha for a flat fill; it folds alpha into the colour', () => {
		const m = mockContext();
		paintShapes(m.ctx, [{ kind: 'rect', x: 0, y: 0, w: 2, h: 2, fill: '#1ebb48', fillAlpha: 0.4 }]);
		expect(m.alphaWrites()).toEqual([]);
		expect(m.opsOf('fill')[0]?.fillStyle).toBe('rgba(30, 187, 72, 0.400)');
	});

	it('reaches for globalAlpha only when a gradient carries fillAlpha, then puts it back', () => {
		const withAlpha = mockContext();
		paintShapes(withAlpha.ctx, [
			{ kind: 'rect', x: 0, y: 0, w: 2, h: 2, fill: GRADIENT, fillAlpha: 0.25 }
		]);
		expect(withAlpha.alphaWrites()).toEqual([0.25, 1]);

		const withoutAlpha = mockContext();
		paintShapes(withoutAlpha.ctx, [{ kind: 'rect', x: 0, y: 0, w: 2, h: 2, fill: GRADIENT }]);
		expect(withoutAlpha.alphaWrites()).toEqual([]);
	});

	it('converts degrees to radians, but only inside the canvas painter', () => {
		const m = mockContext();
		paintShapes(m.ctx, [
			{
				kind: 'group',
				rotate: 90,
				children: [{ kind: 'ellipse', cx: 1, cy: 2, rx: 3, ry: 4, rotate: 180, fill: '#fff' }]
			}
		]);
		expect(m.opsOf('rotate')[0]?.args[0]).toBeCloseTo(Math.PI / 2, 12);
		expect(m.opsOf('ellipse')[0]?.args[4]).toBeCloseTo(Math.PI, 12);
	});

	it('routes path geometry and clips through Path2D', () => {
		const m = mockContext();
		paintShapes(m.ctx, [
			{
				kind: 'group',
				clip: 'M0 0L9 9Z',
				children: [{ kind: 'path', d: 'M1 1L2 2', fill: '#1ebb48', stroke: '#000000' }]
			}
		]);
		expect((m.opsOf('clip')[0]?.args[0] as FakePath2D).d).toBe('M0 0L9 9Z');
		expect((m.opsOf('fill')[0]?.args[0] as FakePath2D).d).toBe('M1 1L2 2');
		expect((m.opsOf('stroke')[0]?.args[0] as FakePath2D).d).toBe('M1 1L2 2');
		// a path never re-traces onto the context
		expect(m.opsOf('beginPath')).toHaveLength(0);
	});

	it('traces primitives onto the context and applies stroke style', () => {
		const m = mockContext();
		paintShapes(m.ctx, [
			{ kind: 'rect', x: 1, y: 2, w: 3, h: 4, fill: '#1ebb48' },
			{ kind: 'circle', cx: 5, cy: 6, r: 7, stroke: '#000000', strokeAlpha: 0.5, round: true }
		]);
		expect(m.opsOf('rect')[0]?.args).toEqual([1, 2, 3, 4]);
		expect(m.opsOf('arc')[0]?.args.slice(0, 3)).toEqual([5, 6, 7]);
		expect(m.raw.strokeStyle).toBe('rgba(0, 0, 0, 0.500)');
		expect(m.raw.lineCap).toBe('round');
		expect(m.raw.lineJoin).toBe('round');
	});

	it('builds a canvas gradient with clamped stops', () => {
		const m = mockContext();
		paintShapes(m.ctx, [
			{
				kind: 'circle',
				cx: 0,
				cy: 0,
				r: 5,
				fill: {
					kind: 'radial',
					x1: 0,
					y1: 0,
					r1: 2,
					x2: 0,
					y2: 0,
					r2: 5,
					stops: [
						{ at: -1, color: '#ffffff', alpha: 0.5 },
						{ at: 2, color: '#000000' }
					]
				}
			}
		]);
		// the canvas backend keeps the inner radius; only SVG has to fold it away
		expect(m.opsOf('createRadialGradient')[0]?.args).toEqual([0, 0, 2, 0, 0, 5]);
		const gradient = m.opsOf('fill')[0]?.fillStyle as { stops: [number, string][] };
		expect(gradient.stops).toEqual([
			[0, 'rgba(255, 255, 255, 0.500)'],
			[1, '#000000']
		]);
	});

	it('paints the whole earth frame without throwing', () => {
		const m = mockContext();
		paintShapes(m.ctx, sceneShapes(buildScene(SEED, NIGHT), BOX));
		expect(m.calls.length).toBeGreaterThan(20);
		expect(m.opsOf('save')).toHaveLength(m.opsOf('restore').length);
	});
});

describe('path helpers', () => {
	it('rounds coordinates to two decimals', () => {
		expect(polylinePath([{ x: 1.239, y: -0.004 }], false)).toBe('M1.24 0');
	});

	it('opens or closes a polyline', () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 10, y: 5 }
		];
		expect(polylinePath(points, false)).toBe('M0 0L10 5');
		expect(polylinePath(points)).toBe('M0 0L10 5Z');
		expect(polylinePath([])).toBe('');
	});

	it('curves a blob through the midpoints and falls back below three points', () => {
		const blob = blobPath([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 5, y: 10 }
		]);
		expect(blob.startsWith('M2.5 5')).toBe(true);
		expect(blob.match(/Q/g)).toHaveLength(3);
		expect(blob.endsWith('Z')).toBe(true);
		expect(blobPath([{ x: 1, y: 2 }])).toBe('M1 2Z');
	});

	it('writes quads and lines', () => {
		expect(quadPath({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 })).toBe('M0 0Q5 5 10 0');
		expect(linePath(0, 0, 3, 4)).toBe('M0 0L3 4');
	});
});

describe('color helpers', () => {
	it('mixes in srgb and clamps the amount', () => {
		expect(blendHex('#000000', '#ffffff', 0.5)).toBe('#808080');
		expect(blendHex('#000000', '#ffffff', -1)).toBe('#000000');
		expect(blendHex('#000000', '#ffffff', 2)).toBe('#ffffff');
	});

	it('accepts short hex and rgb() input so rgbaCss output round-trips', () => {
		expect(blendHex('#fff', '#fff', 0)).toBe('#ffffff');
		expect(blendHex(rgbaCss('#1ebb48', 0.5), '#1ebb48', 0)).toBe('#1ebb48');
		expect(blendHex('not-a-color', '#ffffff', 0.5)).toBe('#1ebb48');
	});

	it('lightens on a positive amount and darkens on a negative one', () => {
		expect(brightenHex('#1ebb48', 0.5)).toBe('#8fdda4');
		expect(brightenHex('#1ebb48', -0.5)).toBe('#0f5e24');
	});

	it('leaves a colour untouched at night 0', () => {
		expect(dimHex('#1ebb48', 0)).toBe('#1ebb48');
		expect(dimHex('#1ebb48', -1)).toBe('#1ebb48');
	});

	it('desaturates toward luminance grey before cooling toward the night tint', () => {
		const dimmed = dimHex('#1ebb48', 1);
		expect(dimmed).toBe('#386651');

		const channels = (hex: string) => [
			parseInt(hex.slice(1, 3), 16),
			parseInt(hex.slice(3, 5), 16),
			parseInt(hex.slice(5, 7), 16)
		];
		const [r0, g0, b0] = channels('#1ebb48') as [number, number, number];
		const [r1, g1, b1] = channels(dimmed) as [number, number, number];

		// step one: saturation collapses, which a flat multiply could never do
		expect(Math.max(r1, g1, b1) - Math.min(r1, g1, b1)).toBeLessThan(
			Math.max(r0, g0, b0) - Math.min(r0, g0, b0)
		);
		// step two: the night tint pushes blue up relative to a plain darken of the same grey mix
		const [rPlain, , bPlain] = channels(
			brightenHex(blendHex('#1ebb48', '#919191', 0.5), -0.45)
		) as [number, number, number];
		expect(b1 / r1).toBeGreaterThan(bPlain / rPlain);
	});

	it('formats rgba with a clamped alpha and a hex fallback', () => {
		expect(rgbaCss('#1ebb48', 0.5)).toBe('rgba(30, 187, 72, 0.500)');
		expect(rgbaCss('#1ebb48', 4)).toBe('rgba(30, 187, 72, 1.000)');
		expect(rgbaCss('#1ebb48', -1)).toBe('rgba(30, 187, 72, 0.000)');
		expect(rgbaCss('nope', 0.25)).toBe('rgba(30, 187, 72, 0.250)');
	});
});

describe('timeOfDayFor', () => {
	const at = (hour: number, minute: number) => timeOfDayFor(new Date(2026, 0, 15, hour, minute));

	it('buckets every boundary hour on the local clock', () => {
		expect(at(4, 59)).toBe('night');
		expect(at(5, 0)).toBe('dawn');
		expect(at(7, 59)).toBe('dawn');
		expect(at(8, 0)).toBe('day');
		expect(at(16, 59)).toBe('day');
		expect(at(17, 0)).toBe('dusk');
		expect(at(19, 59)).toBe('dusk');
		expect(at(20, 0)).toBe('night');
	});

	it('pairs each bucket with its night scalar', () => {
		expect(NIGHT_FACTORS).toEqual({ dawn: 0.55, day: 0, dusk: 0.68, night: 1 });
	});
});

describe('buildScene', () => {
	it('is deterministic for the same seed and moment', () => {
		expect(buildScene(SEED, NOON)).toEqual(buildScene(SEED, NOON));
		expect(sceneShapes(buildScene(SEED, NOON), BOX)).toEqual(
			sceneShapes(buildScene(SEED, NOON), BOX)
		);
	});

	it('keeps the sky brand green as the ground family in daylight and dims it at night', () => {
		expect(buildScene(SEED, NOON).palette.ground).toBe('#1ebb48');
		expect(buildScene(SEED, NIGHT).palette.ground).toBe('#386651');
		expect(buildScene(SEED, NOON).palette.night).toBe(0);
		expect(buildScene(SEED, NIGHT).palette.night).toBe(1);
	});

	it('warms the horizon toward dusk and dawn hues', () => {
		const dusk = buildScene(SEED, new Date(2026, 0, 15, 18, 0)).palette;
		const night = buildScene(SEED, NIGHT).palette;
		expect(dusk.skyBottom).not.toBe(night.skyBottom);
		expect(dusk.skyBottom).not.toBe(
			buildScene(SEED, new Date(2026, 0, 15, 6, 0)).palette.skyBottom
		);
	});

	it('gives a different seed a different frame', () => {
		expect(sceneShapes(buildScene('other', NOON), BOX)).not.toEqual(
			sceneShapes(buildScene(SEED, NOON), BOX)
		);
	});
});

describe('sceneShapes', () => {
	it('defaults to the settled frame, and the animated path emits it at t=0', () => {
		const scene = buildScene(SEED, NOON);
		expect(sceneShapes(scene, BOX)).toEqual(sceneShapes(scene, BOX, SETTLED_MOTION));
		// the one-code-path rule: every oscillator's settled constant is its own value at t=0
		expect(sceneShapes(scene, BOX, { time: 0, bloom: 1, animate: true })).toEqual(
			sceneShapes(scene, BOX, SETTLED_MOTION)
		);
	});

	it('moves once time advances', () => {
		const scene = buildScene(SEED, NOON);
		expect(sceneShapes(scene, BOX, { time: 5000, bloom: 1, animate: true })).not.toEqual(
			sceneShapes(scene, BOX, SETTLED_MOTION)
		);
	});

	it('paints sky, celestial body, three clouds, horizon, ground and vignette in order', () => {
		const shapes = sceneShapes(buildScene(SEED, NOON), BOX);
		expect(shapes).toHaveLength(17);
		expect(shapes[0]?.kind).toBe('rect');
		expect(shapes.slice(3, 12).every((s) => s.kind === 'ellipse')).toBe(true);
		expect(shapes.slice(12, 14).every((s) => s.kind === 'path')).toBe(true);
		expect(shapes.at(-1)?.kind).toBe('rect');
	});

	it('swaps the sun for a grouped moon at night', () => {
		expect(sceneShapes(buildScene(SEED, NOON), BOX)[2]?.kind).toBe('circle');
		expect(sceneShapes(buildScene(SEED, NIGHT), BOX)[2]?.kind).toBe('group');
	});

	it('scales the vignette with the night scalar', () => {
		for (const [hour, night] of [
			[12, 0],
			[6, 0.55],
			[18, 0.68],
			[23, 1]
		] as const) {
			const shapes = sceneShapes(buildScene(SEED, new Date(2026, 0, 15, hour, 0)), BOX);
			const vignette = shapes.at(-1);
			if (vignette?.kind !== 'rect') throw new Error('vignette must be the last shape');
			const fill = vignette.fill as Gradient;
			expect(fill.kind).toBe('radial');
			expect(fill.stops.at(-1)?.alpha).toBeCloseTo(0.1 + night * 0.2, 12);
		}
	});

	it('survives a degenerate box without emitting NaN', () => {
		const svg = sceneToSvg(sceneShapes(buildScene(SEED, NOON), { width: 0, height: 0 }), {
			width: 1,
			height: 1
		});
		expect(svg).not.toContain('NaN');
	});
});
