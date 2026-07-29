import type { BrowserContext, Page } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { hexToOklch } from '../../unit/design/oklch';

/**
 * Visual-quality measurement harness.
 *
 * Deliberately NOT a screenshot-comparison suite: rasterization is
 * GPU-dependent and binaries do not belong in the repo, so PNGs go to
 * `/tmp/sky-visual-eval/` and only computed numbers are kept.
 *
 * Three families of numbers:
 *
 *   1. AIM-style pixel metrics (edge density, contour congestion, figure-ground
 *      contrast) against the published top-10-commercial-site baselines from
 *      Aalto Interface Metrics (interfacemetrics.aalto.fi). These are a TREND,
 *      not a pass/fail: our kernels are dependency-free Sobel/Otsu proxies, not
 *      AIM's exact Canny pipeline, so absolute values differ by construction.
 *   2. A complexity budget per screen. Reinecke et al. (CHI 2013) measured the
 *      three strongest negative predictors of perceived visual appeal as non-text
 *      area (beta = .515), text area (.407) and text-group count (.344).
 *   3. Two hard budgets: one hero per screen (at ~500ms exposure a viewer only
 *      resolves global structure, so two heroes read as none) and a chroma cap
 *      (high-chroma paint has to stay an accent, not a field).
 */

// #region tunables

/** where screenshots + the JSON report land; never inside the repo */
export const SCREEN_DIR = '/tmp/sky-visual-eval';

/** where maestro's `eval`-tagged flows drop real device frames */
export const DEVICE_SHOT_DIR = '/tmp/maestro-shots';

/** Aalto Interface Metrics, top-10 commercial sites */
export const AIM_BASELINES = {
	edgeDensity: 0.115,
	contourCongestion: 11.165,
	figureGroundContrast: 0.206
} as const;

/** Reinecke et al. 2013 (CHI) standardized betas, kept for the printed report */
export const APPEAL_PREDICTORS = {
	nonTextAreaRatio: -0.515,
	textAreaRatio: -0.407,
	textGroupCount: -0.344
} as const;

/** OKLCH chroma above this reads as saturated paint rather than a neutral surface */
export const CHROMA_LIMIT = 0.12;

/** high-chroma paint stays an accent below this share of the viewport */
export const CHROMA_AREA_BUDGET = 0.05;

/** one salient region = one hero */
export const MAX_HERO_REGIONS = 1;

// analysis resolutions: metrics at 480px wide, the hero glance at 120px wide
const WORK_WIDTH = 480;
const HERO_WIDTH = 120;
// normalized Sobel magnitude that counts as an edge (raw max is sqrt(32))
const EDGE_THRESHOLD = 0.1;
// chebyshev radius of the neighbourhood the congestion proxy counts over
const CONGESTION_RADIUS = 3;
// luma distance from the background mode that counts as salient in the glance test
const HERO_SALIENCY_DELTA = 0.25;
// salient blobs smaller than this share of the thumbnail are texture, not structure
const HERO_MIN_AREA_RATIO = 0.015;
// bits per channel kept when histogramming colors (6 -> 64 levels)
const QUANT_BITS = 6;
// css px per occupancy-grid cell for the complexity budget
const GRID_CELL = 8;
// gap under which two text boxes read as one group
const TEXT_GROUP_GAP = 12;

// #endregion

// #region types

export interface PixelMetrics {
	width: number;
	height: number;
	edgeDensity: number;
	contourCongestion: number;
	figureGroundContrast: number;
	heroRegions: number;
	heroAreaRatios: number[];
	colors: { keys: number[]; counts: number[]; sampled: number };
}

export interface ComplexityMetrics {
	textGroupCount: number;
	textLeafCount: number;
	textAreaRatio: number;
	nonTextAreaRatio: number;
	imageAreaCount: number;
	imageAreaRatio: number;
}

export interface ChromaMetrics {
	highChromaRatio: number;
	maxChroma: number;
	distinctColors: number;
}

export interface ScreenReport {
	name: string;
	path: string;
	screenshot: string;
	pixels: PixelMetrics;
	complexity: ComplexityMetrics;
	chroma: ChromaMetrics;
}

// #endregion

// #region pixel kernel

interface KernelArgs {
	dataUrl: string;
	workWidth: number;
	heroWidth: number;
	edgeThreshold: number;
	congestionRadius: number;
	heroDelta: number;
	heroMinAreaRatio: number;
	quantBits: number;
}

/**
 * Runs inside a scratch page: the only dependency-free PNG decoder available is
 * the browser's own image pipeline plus a canvas.
 */
async function pixelKernel(args: KernelArgs): Promise<PixelMetrics> {
	const img = new Image();
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('screenshot failed to decode'));
		img.src = args.dataUrl;
	});

	const read = (w: number, h: number, smooth: boolean): Uint8ClampedArray => {
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		ctx.imageSmoothingEnabled = smooth;
		ctx.drawImage(img, 0, 0, w, h);
		return ctx.getImageData(0, 0, w, h).data;
	};

	const toGray = (data: Uint8ClampedArray, n: number): Float32Array => {
		const gray = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const o = i * 4;
			gray[i] = (0.2126 * data[o]! + 0.7152 * data[o + 1]! + 0.0722 * data[o + 2]!) / 255;
		}
		return gray;
	};

	// #region work-resolution metrics
	const scale = Math.min(1, args.workWidth / img.naturalWidth);
	const w = Math.max(3, Math.round(img.naturalWidth * scale));
	const h = Math.max(3, Math.round(img.naturalHeight * scale));
	const gray = toGray(read(w, h, true), w * h);

	// sobel magnitude, normalized by its own maximum (sqrt(4^2 + 4^2))
	const SOBEL_MAX = Math.sqrt(32);
	const edge = new Uint8Array(w * h);
	let edgeCount = 0;
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			const tl = gray[i - w - 1]!;
			const t = gray[i - w]!;
			const tr = gray[i - w + 1]!;
			const l = gray[i - 1]!;
			const r = gray[i + 1]!;
			const bl = gray[i + w - 1]!;
			const b = gray[i + w]!;
			const br = gray[i + w + 1]!;
			const gx = tl + 2 * l + bl - (tr + 2 * r + br);
			const gy = tl + 2 * t + tr - (bl + 2 * b + br);
			if (Math.sqrt(gx * gx + gy * gy) / SOBEL_MAX >= args.edgeThreshold) {
				edge[i] = 1;
				edgeCount++;
			}
		}
	}
	const edgeDensity = edgeCount / (w * h);

	// contour congestion proxy: mean count of OTHER edge pixels inside a
	// (2r+1)^2 window centred on each edge pixel, via an integral image
	const iw = w + 1;
	const integral = new Int32Array(iw * (h + 1));
	for (let y = 0; y < h; y++) {
		let rowSum = 0;
		for (let x = 0; x < w; x++) {
			rowSum += edge[y * w + x]!;
			integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)]! + rowSum;
		}
	}
	const boxSum = (x0: number, y0: number, x1: number, y1: number): number => {
		const ax = Math.max(0, x0);
		const ay = Math.max(0, y0);
		const bx = Math.min(w - 1, x1);
		const by = Math.min(h - 1, y1);
		return (
			integral[(by + 1) * iw + (bx + 1)]! -
			integral[ay * iw + (bx + 1)]! -
			integral[(by + 1) * iw + ax]! +
			integral[ay * iw + ax]!
		);
	};
	let congestionSum = 0;
	const rad = args.congestionRadius;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!edge[y * w + x]) continue;
			congestionSum += boxSum(x - rad, y - rad, x + rad, y + rad) - 1;
		}
	}
	const contourCongestion = edgeCount > 0 ? congestionSum / edgeCount : 0;

	// figure-ground contrast: otsu split, then the gap between the two class means
	const bins = new Int32Array(256);
	for (let i = 0; i < gray.length; i++) {
		const bin = Math.min(255, Math.round(gray[i]! * 255));
		bins[bin] = bins[bin]! + 1;
	}
	const total = gray.length;
	let sumAll = 0;
	for (let v = 0; v < 256; v++) sumAll += v * bins[v]!;
	let wB = 0;
	let sumB = 0;
	let bestVar = -1;
	let threshold = 128;
	for (let v = 0; v < 256; v++) {
		wB += bins[v]!;
		if (wB === 0) continue;
		const wF = total - wB;
		if (wF === 0) break;
		sumB += v * bins[v]!;
		const mB = sumB / wB;
		const mF = (sumAll - sumB) / wF;
		const between = wB * wF * (mB - mF) * (mB - mF);
		if (between > bestVar) {
			bestVar = between;
			threshold = v;
		}
	}
	let darkCount = 0;
	let darkSum = 0;
	let lightCount = 0;
	let lightSum = 0;
	for (let i = 0; i < gray.length; i++) {
		const v = gray[i]! * 255;
		if (v <= threshold) {
			darkCount++;
			darkSum += v;
		} else {
			lightCount++;
			lightSum += v;
		}
	}
	const darkMean = darkCount ? darkSum / darkCount / 255 : 0;
	const lightMean = lightCount ? lightSum / lightCount / 255 : 0;
	const figureGroundContrast = Math.abs(lightMean - darkMean);
	// #endregion

	// #region hero glance at 120px wide
	const hScale = Math.min(1, args.heroWidth / img.naturalWidth);
	const hw = Math.max(3, Math.round(img.naturalWidth * hScale));
	const hh = Math.max(3, Math.round(img.naturalHeight * hScale));
	const heroGray = toGray(read(hw, hh, true), hw * hh);

	// background = the modal luma bucket; everything far from it is salient
	const heroBins = new Int32Array(32);
	for (let i = 0; i < heroGray.length; i++) {
		const bin = Math.min(31, Math.floor(heroGray[i]! * 32));
		heroBins[bin] = heroBins[bin]! + 1;
	}
	let modeBin = 0;
	for (let b = 1; b < 32; b++) if (heroBins[b]! > heroBins[modeBin]!) modeBin = b;
	const background = (modeBin + 0.5) / 32;

	const salient = new Uint8Array(hw * hh);
	for (let i = 0; i < heroGray.length; i++) {
		if (Math.abs(heroGray[i]! - background) > args.heroDelta) salient[i] = 1;
	}

	// 4-neighbour connected components over the salient mask
	const seen = new Uint8Array(hw * hh);
	const stack: number[] = [];
	const areas: number[] = [];
	for (let start = 0; start < salient.length; start++) {
		if (!salient[start] || seen[start]) continue;
		let area = 0;
		stack.push(start);
		seen[start] = 1;
		while (stack.length) {
			const i = stack.pop()!;
			area++;
			const x = i % hw;
			const y = (i - x) / hw;
			if (x > 0 && salient[i - 1] && !seen[i - 1]) {
				seen[i - 1] = 1;
				stack.push(i - 1);
			}
			if (x < hw - 1 && salient[i + 1] && !seen[i + 1]) {
				seen[i + 1] = 1;
				stack.push(i + 1);
			}
			if (y > 0 && salient[i - hw] && !seen[i - hw]) {
				seen[i - hw] = 1;
				stack.push(i - hw);
			}
			if (y < hh - 1 && salient[i + hw] && !seen[i + hw]) {
				seen[i + hw] = 1;
				stack.push(i + hw);
			}
		}
		areas.push(area / (hw * hh));
	}
	const heroAreaRatios = areas
		.filter((a) => a >= args.heroMinAreaRatio)
		.sort((a, b) => b - a)
		.map((a) => Math.round(a * 10_000) / 10_000);
	// #endregion

	// #region color histogram at native resolution
	const fw = img.naturalWidth;
	const fh = img.naturalHeight;
	const full = read(fw, fh, false);
	const shift = 8 - args.quantBits;
	const histogram = new Map<number, number>();
	let sampled = 0;
	// every 2nd pixel in both axes: a quarter of the pixels, identical area ratios
	for (let y = 0; y < fh; y += 2) {
		for (let x = 0; x < fw; x += 2) {
			const o = (y * fw + x) * 4;
			const key =
				((full[o]! >> shift) << (args.quantBits * 2)) |
				((full[o + 1]! >> shift) << args.quantBits) |
				(full[o + 2]! >> shift);
			histogram.set(key, (histogram.get(key) ?? 0) + 1);
			sampled++;
		}
	}
	// #endregion

	return {
		width: fw,
		height: fh,
		edgeDensity,
		contourCongestion,
		figureGroundContrast,
		heroRegions: heroAreaRatios.length,
		heroAreaRatios,
		colors: {
			keys: Array.from(histogram.keys()),
			counts: Array.from(histogram.values()),
			sampled
		}
	};
}

// #endregion

// #region measurement entry points

function slug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/** Screenshot the viewport, write the PNG to /tmp, and hand back the bytes. */
export async function captureScreen(
	page: Page,
	name: string
): Promise<{ file: string; png: Buffer }> {
	mkdirSync(SCREEN_DIR, { recursive: true });
	// scale:'css' keeps the analysis in css pixels so DPR never moves the numbers
	const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
	const file = join(SCREEN_DIR, `${slug(name)}.png`);
	writeFileSync(file, png);
	return { file, png };
}

export async function measurePixels(context: BrowserContext, png: Buffer): Promise<PixelMetrics> {
	const scratch = await context.newPage();
	try {
		await scratch.setContent('<div id="scratch"></div>');
		return await scratch.evaluate(pixelKernel, {
			dataUrl: `data:image/png;base64,${png.toString('base64')}`,
			workWidth: WORK_WIDTH,
			heroWidth: HERO_WIDTH,
			edgeThreshold: EDGE_THRESHOLD,
			congestionRadius: CONGESTION_RADIUS,
			heroDelta: HERO_SALIENCY_DELTA,
			heroMinAreaRatio: HERO_MIN_AREA_RATIO,
			quantBits: QUANT_BITS
		});
	} finally {
		await scratch.close();
	}
}

/**
 * OKLCH chroma budget. Runs in node so it can reuse the project's Oklab helper
 * instead of shipping a second implementation into the page.
 */
export function measureChroma(colors: PixelMetrics['colors']): ChromaMetrics {
	const shift = 8 - QUANT_BITS;
	const mask = (1 << QUANT_BITS) - 1;
	// bit replication, so the top quantized level maps back to 0xff instead of 0xfc
	const channel = (v: number) =>
		(((v << shift) | (v >> (QUANT_BITS - shift))) & 0xff).toString(16).padStart(2, '0');

	let high = 0;
	let maxChroma = 0;
	for (let i = 0; i < colors.keys.length; i++) {
		const key = colors.keys[i]!;
		const count = colors.counts[i]!;
		const hex = `#${channel((key >> (QUANT_BITS * 2)) & mask)}${channel((key >> QUANT_BITS) & mask)}${channel(key & mask)}`;
		const { c } = hexToOklch(hex);
		if (c > maxChroma) maxChroma = c;
		if (c > CHROMA_LIMIT) high += count;
	}
	return {
		highChromaRatio: colors.sampled ? high / colors.sampled : 0,
		maxChroma,
		distinctColors: colors.keys.length
	};
}

/**
 * Complexity budget straight off the DOM: how much of the viewport is text, how
 * much is non-text paint, and how many separate text groups a viewer has to
 * parse. Areas are unioned on an 8px occupancy grid so nested containers cannot
 * double-count.
 */
export async function measureComplexity(page: Page): Promise<ComplexityMetrics> {
	return await page.evaluate(
		({ cell, gap }) => {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const cols = Math.max(1, Math.ceil(vw / cell));
			const rows = Math.max(1, Math.ceil(vh / cell));

			const inHiddenSubtree = (el: Element): boolean => {
				for (let n: Element | null = el; n; n = n.parentElement) {
					if (n.getAttribute('aria-hidden') === 'true') return true;
					if (
						n.classList.contains('ion-page-hidden') ||
						n.classList.contains('ion-page-invisible') ||
						n.classList.contains('overlay-hidden')
					) {
						return true;
					}
					if (n.tagName === 'ION-MODAL' && !n.classList.contains('show-modal')) return true;
				}
				return false;
			};

			const visible = (el: Element, rect: DOMRect): boolean => {
				if (rect.width <= 0 || rect.height <= 0) return false;
				const cs = getComputedStyle(el);
				if (cs.visibility !== 'visible' || cs.display === 'none') return false;
				if (Number(cs.opacity) === 0) return false;
				// ionic parks the outgoing view one viewport to the left during a transition
				if (rect.right <= 0 || rect.left >= vw || rect.bottom <= 0 || rect.top >= vh) return false;
				return !inHiddenSubtree(el);
			};

			const stamp = (grid: Set<number>, rect: DOMRect): void => {
				const x0 = Math.max(0, Math.floor(rect.left / cell));
				const x1 = Math.min(cols - 1, Math.floor((rect.right - 1) / cell));
				const y0 = Math.max(0, Math.floor(rect.top / cell));
				const y1 = Math.min(rows - 1, Math.floor((rect.bottom - 1) / cell));
				for (let y = y0; y <= y1; y++) {
					for (let x = x0; x <= x1; x++) grid.add(y * cols + x);
				}
			};

			const hasDirectText = (el: Element): boolean =>
				Array.from(el.childNodes).some(
					(n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== ''
				);

			const IMAGE_TAGS = new Set(['IMG', 'ION-IMG', 'PICTURE', 'SVG', 'CANVAS', 'VIDEO']);
			const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'TITLE', 'NOSCRIPT', 'HEAD', 'META']);

			const textCells = new Set<number>();
			const nonTextCells = new Set<number>();
			const imageCells = new Set<number>();
			const textRects: DOMRect[] = [];
			let imageAreaCount = 0;

			for (const el of Array.from(document.querySelectorAll('*'))) {
				if (SKIP.has(el.tagName)) continue;
				const rect = el.getBoundingClientRect();
				if (!visible(el, rect)) continue;
				const cs = getComputedStyle(el);

				if (hasDirectText(el)) {
					textRects.push(rect);
					stamp(textCells, rect);
					continue;
				}

				const isImage =
					IMAGE_TAGS.has(el.tagName) ||
					(cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('linear-gradient'));
				if (isImage && rect.width >= 24 && rect.height >= 24) {
					imageAreaCount++;
					stamp(imageCells, rect);
					stamp(nonTextCells, rect);
					continue;
				}

				// a full-bleed painted surface is the ground, not a non-text element; counting
				// ion-app / ion-content backgrounds pins the ratio at 1.000 on every screen
				if (rect.width * rect.height >= 0.9 * vw * vh) continue;

				// only painted surfaces count toward non-text area; a bare layout wrapper is invisible
				const paints =
					(cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
					cs.backgroundImage !== 'none' ||
					Number.parseFloat(cs.borderTopWidth) > 0 ||
					Number.parseFloat(cs.borderBottomWidth) > 0 ||
					cs.boxShadow !== 'none';
				if (paints) stamp(nonTextCells, rect);
			}

			// group text boxes that sit within `gap` px of each other in both axes
			const parent = textRects.map((_, i) => i);
			const find = (i: number): number => {
				let root = i;
				while (parent[root] !== root) root = parent[root]!;
				while (parent[i] !== root) {
					const next = parent[i]!;
					parent[i] = root;
					i = next;
				}
				return root;
			};
			const union = (a: number, b: number): void => {
				const ra = find(a);
				const rb = find(b);
				if (ra !== rb) parent[rb] = ra;
			};
			for (let i = 0; i < textRects.length; i++) {
				for (let j = i + 1; j < textRects.length; j++) {
					const a = textRects[i]!;
					const b = textRects[j]!;
					const near =
						a.left - gap < b.right &&
						b.left - gap < a.right &&
						a.top - gap < b.bottom &&
						b.top - gap < a.bottom;
					if (near) union(i, j);
				}
			}
			const groups = new Set<number>();
			for (let i = 0; i < textRects.length; i++) groups.add(find(i));

			const cells = cols * rows;
			return {
				textGroupCount: groups.size,
				textLeafCount: textRects.length,
				textAreaRatio: textCells.size / cells,
				nonTextAreaRatio: nonTextCells.size / cells,
				imageAreaCount,
				imageAreaRatio: imageCells.size / cells
			};
		},
		{ cell: GRID_CELL, gap: TEXT_GROUP_GAP }
	);
}

/** Settle, screenshot, and compute every metric for one screen. */
export async function measureScreen(
	page: Page,
	context: BrowserContext,
	name: string,
	path: string
): Promise<ScreenReport> {
	// lazy: keeps the playwright fixtures out of the module graph for the node-side
	// consumers (scripts/visual-eval.ts, the unit spec) that only score PNGs
	const { settleAnimations } = await import('./a11y-helpers');
	await settleAnimations(page, name);
	const { file, png } = await captureScreen(page, name);
	const pixels = await measurePixels(context, png);
	const complexity = await measureComplexity(page);
	return {
		name,
		path,
		screenshot: file,
		pixels,
		complexity,
		chroma: measureChroma(pixels.colors)
	};
}

// #endregion

// #region reporting

export interface VisualEvalReport {
	generatedAt: string;
	baselines: typeof AIM_BASELINES;
	appealPredictors: typeof APPEAL_PREDICTORS;
	budgets: { chromaLimit: number; chromaAreaBudget: number; maxHeroRegions: number };
	screens: (Omit<ScreenReport, 'pixels'> & {
		pixels: Omit<PixelMetrics, 'colors'>;
	})[];
}

export const REPORT_FILE = join(SCREEN_DIR, 'report.json');

/** Drops the raw color histogram; the report keeps numbers, not payloads. */
export function writeReport(screens: ScreenReport[]): string {
	mkdirSync(SCREEN_DIR, { recursive: true });
	const report: VisualEvalReport = {
		generatedAt: new Date().toISOString(),
		baselines: AIM_BASELINES,
		appealPredictors: APPEAL_PREDICTORS,
		budgets: {
			chromaLimit: CHROMA_LIMIT,
			chromaAreaBudget: CHROMA_AREA_BUDGET,
			maxHeroRegions: MAX_HERO_REGIONS
		},
		screens: screens.map((screen) => {
			const { colors: _colors, ...pixels } = screen.pixels;
			return { ...screen, pixels };
		})
	};
	writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
	return REPORT_FILE;
}

function pad(value: string, width: number, right = false): string {
	return right ? value.padStart(width) : value.padEnd(width);
}

function num(value: number, digits = 3): string {
	return value.toFixed(digits);
}

function delta(value: number, baseline: number, digits = 3): string {
	const d = value - baseline;
	return `${d >= 0 ? '+' : ''}${d.toFixed(digits)}`;
}

/** Fixed-width table; three blocks so each family of numbers stays readable. */
export function formatTable(report: VisualEvalReport): string {
	const nameWidth = Math.max(6, ...report.screens.map((s) => s.name.length));
	const lines: string[] = [];

	lines.push('AIM pixel metrics (trend vs top-10 commercial baseline)');
	lines.push(
		[
			pad('screen', nameWidth),
			pad('edge dens', 11, true),
			pad('delta', 9, true),
			pad('congestion', 11, true),
			pad('delta', 9, true),
			pad('fig/gnd', 9, true),
			pad('delta', 9, true)
		].join(' ')
	);
	for (const s of report.screens) {
		lines.push(
			[
				pad(s.name, nameWidth),
				pad(num(s.pixels.edgeDensity), 11, true),
				pad(delta(s.pixels.edgeDensity, report.baselines.edgeDensity), 9, true),
				pad(num(s.pixels.contourCongestion, 2), 11, true),
				pad(delta(s.pixels.contourCongestion, report.baselines.contourCongestion, 2), 9, true),
				pad(num(s.pixels.figureGroundContrast), 9, true),
				pad(delta(s.pixels.figureGroundContrast, report.baselines.figureGroundContrast), 9, true)
			].join(' ')
		);
	}
	lines.push(
		`baseline: edge density ${report.baselines.edgeDensity}, contour congestion ${report.baselines.contourCongestion}, figure-ground contrast ${report.baselines.figureGroundContrast} (interfacemetrics.aalto.fi)`
	);

	lines.push('');
	lines.push('complexity budget (Reinecke et al. 2013: non-text .515, text .407, groups .344)');
	lines.push(
		[
			pad('screen', nameWidth),
			pad('text grps', 10, true),
			pad('text area', 10, true),
			pad('non-text', 10, true),
			pad('images', 8, true),
			pad('img area', 9, true)
		].join(' ')
	);
	for (const s of report.screens) {
		lines.push(
			[
				pad(s.name, nameWidth),
				pad(String(s.complexity.textGroupCount), 10, true),
				pad(num(s.complexity.textAreaRatio), 10, true),
				pad(num(s.complexity.nonTextAreaRatio), 10, true),
				pad(String(s.complexity.imageAreaCount), 8, true),
				pad(num(s.complexity.imageAreaRatio), 9, true)
			].join(' ')
		);
	}

	lines.push('');
	lines.push('hero + chroma budgets');
	lines.push(
		[
			pad('screen', nameWidth),
			pad('heroes', 7, true),
			pad('limit', 6, true),
			pad('hi-chroma', 10, true),
			pad('budget', 7, true),
			pad('max C', 7, true),
			pad('colors', 8, true)
		].join(' ')
	);
	for (const s of report.screens) {
		lines.push(
			[
				pad(s.name, nameWidth),
				pad(String(s.pixels.heroRegions), 7, true),
				pad(String(report.budgets.maxHeroRegions), 6, true),
				pad(num(s.chroma.highChromaRatio), 10, true),
				pad(num(report.budgets.chromaAreaBudget, 2), 7, true),
				pad(num(s.chroma.maxChroma), 7, true),
				pad(String(s.chroma.distinctColors), 8, true)
			].join(' ')
		);
	}

	return lines.join('\n');
}

// #endregion

// #region device frames

/**
 * Device frames produced by maestro's `eval`-tagged flows, scored by the SAME
 * kernel the browser lane uses so there is one visual harness, not two.
 *
 * A PNG has no DOM behind it, so the complexity budget (which reads the live
 * layout) cannot apply here. Everything pixel-derived does: the AIM metrics as a
 * trend, and the hero + chroma budgets as hard gates.
 */

export const DEVICE_REPORT_FILE = join(SCREEN_DIR, 'device-report.json');

export interface DeviceScreenReport {
	name: string;
	screenshot: string;
	pixels: PixelMetrics;
	chroma: ChromaMetrics;
}

export interface DeviceEvalReport {
	generatedAt: string;
	shotDir: string;
	baselines: typeof AIM_BASELINES;
	budgets: { chromaLimit: number; chromaAreaBudget: number; maxHeroRegions: number };
	frames: (Omit<DeviceScreenReport, 'pixels'> & { pixels: Omit<PixelMetrics, 'colors'> })[];
}

/** Every PNG under `dir`; maestro nests them per flow and per takeScreenshot name. */
export function collectDeviceShots(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { recursive: true })
		.map((entry) => String(entry))
		.filter((entry) => entry.toLowerCase().endsWith('.png'))
		.map((entry) => join(dir, entry))
		.sort();
}

/** dir-relative path without the extension, so `ios/launch/dashboard` stays legible */
export function deviceShotName(dir: string, file: string): string {
	return relative(dir, file).replace(/\.png$/i, '');
}

export async function measureDeviceShot(
	context: BrowserContext,
	dir: string,
	file: string
): Promise<DeviceScreenReport> {
	const pixels = await measurePixels(context, readFileSync(file));
	return {
		name: deviceShotName(dir, file),
		screenshot: file,
		pixels,
		chroma: measureChroma(pixels.colors)
	};
}

export async function measureDeviceShots(
	context: BrowserContext,
	dir: string
): Promise<DeviceScreenReport[]> {
	const frames: DeviceScreenReport[] = [];
	// serial on purpose: each frame decodes in its own scratch page
	for (const file of collectDeviceShots(dir)) {
		frames.push(await measureDeviceShot(context, dir, file));
	}
	return frames;
}

export interface BudgetBreach {
	screen: string;
	budget: string;
	detail: string;
}

/** The two hard budgets. The AIM numbers stay a trend and never fail a run. */
export function checkHardBudgets(
	frames: Pick<DeviceScreenReport, 'name' | 'pixels' | 'chroma'>[]
): BudgetBreach[] {
	const breaches: BudgetBreach[] = [];
	for (const frame of frames) {
		if (frame.pixels.heroRegions > MAX_HERO_REGIONS) {
			breaches.push({
				screen: frame.name,
				budget: 'hero',
				detail: `${frame.pixels.heroRegions} salient regions (max ${MAX_HERO_REGIONS}), areas ${frame.pixels.heroAreaRatios.join(', ')}`
			});
		}
		if (frame.chroma.highChromaRatio > CHROMA_AREA_BUDGET) {
			breaches.push({
				screen: frame.name,
				budget: 'chroma',
				detail: `${(frame.chroma.highChromaRatio * 100).toFixed(1)}% of pixels over C ${CHROMA_LIMIT}, budget ${(CHROMA_AREA_BUDGET * 100).toFixed(0)}%`
			});
		}
	}
	return breaches;
}

/** Drops the raw color histogram, same as the browser report. */
export function writeDeviceReport(
	dir: string,
	frames: DeviceScreenReport[],
	file: string = DEVICE_REPORT_FILE
): string {
	mkdirSync(dirname(file), { recursive: true });
	const report: DeviceEvalReport = {
		generatedAt: new Date().toISOString(),
		shotDir: dir,
		baselines: AIM_BASELINES,
		budgets: {
			chromaLimit: CHROMA_LIMIT,
			chromaAreaBudget: CHROMA_AREA_BUDGET,
			maxHeroRegions: MAX_HERO_REGIONS
		},
		frames: frames.map((frame) => {
			const { colors: _colors, ...pixels } = frame.pixels;
			return { ...frame, pixels };
		})
	};
	writeFileSync(file, JSON.stringify(report, null, 2));
	return file;
}

export function formatDeviceTable(report: DeviceEvalReport): string {
	const nameWidth = Math.max(6, ...report.frames.map((f) => f.name.length));
	const lines: string[] = [];

	lines.push('device frames (same kernel as the browser lane; no DOM, so no complexity budget)');
	lines.push(
		[
			pad('frame', nameWidth),
			pad('size', 12, true),
			pad('edge dens', 11, true),
			pad('delta', 9, true),
			pad('congestion', 11, true),
			pad('delta', 9, true),
			pad('fig/gnd', 9, true),
			pad('heroes', 7, true),
			pad('hi-chroma', 10, true),
			pad('max C', 7, true)
		].join(' ')
	);
	for (const f of report.frames) {
		lines.push(
			[
				pad(f.name, nameWidth),
				pad(`${f.pixels.width}x${f.pixels.height}`, 12, true),
				pad(num(f.pixels.edgeDensity), 11, true),
				pad(delta(f.pixels.edgeDensity, report.baselines.edgeDensity), 9, true),
				pad(num(f.pixels.contourCongestion, 2), 11, true),
				pad(delta(f.pixels.contourCongestion, report.baselines.contourCongestion, 2), 9, true),
				pad(num(f.pixels.figureGroundContrast), 9, true),
				pad(String(f.pixels.heroRegions), 7, true),
				pad(num(f.chroma.highChromaRatio), 10, true),
				pad(num(f.chroma.maxChroma), 7, true)
			].join(' ')
		);
	}
	lines.push(
		`budgets: max ${report.budgets.maxHeroRegions} hero, high-chroma area <= ${num(report.budgets.chromaAreaBudget, 2)} (C > ${report.budgets.chromaLimit})`
	);

	return lines.join('\n');
}

// #endregion
