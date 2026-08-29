import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './fixtures';

// #region animation settling

export async function settleAnimations(page: Page, surface: string): Promise<void> {
	await page.evaluate(() => {
		(window as unknown as { __a11yQuiet?: number }).__a11yQuiet = 0;
	});
	await expect
		.poll(
			async () =>
				await page.evaluate(() => {
					const w = window as unknown as { __a11yQuiet?: number };
					const root = document.querySelector('ion-router-outlet') ?? document.documentElement;
					const running = root.getAnimations({ subtree: true }).filter((a) => {
						if (a.playState !== 'running') return false;
						// spinners and pulses never end; they would stall the poll forever
						return a.effect?.getComputedTiming?.().iterations !== Infinity;
					});
					w.__a11yQuiet = running.length === 0 ? (w.__a11yQuiet ?? 0) + 1 : 0;
					return (w.__a11yQuiet ?? 0) >= 3;
				}),
			{ timeout: 10_000, message: `${surface}: ion-router-outlet animations never settled` }
		)
		.toBe(true);
	// ionic holds an entering page at opacity 0 until its transition runs, and playwright
	// calls such an element visible, so a ready() check passes on a page that paints nothing
	await expect
		.poll(
			async () =>
				await page.evaluate(() => {
					const content = Array.from(document.querySelectorAll('ion-content')).find(
						(el) => (el as HTMLElement).offsetParent !== null
					);
					const host = content?.closest('.ion-page') as HTMLElement | null;
					if (!host) return 1;
					return Number(getComputedStyle(host).opacity);
				}),
			{ timeout: 10_000, message: `${surface}: the active ion-page never painted` }
		)
		.toBeGreaterThan(0.99);
	// webfont swap reflows text, which would poison the clipping measurements
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * Same idea as {@link settleAnimations}, document-wide. Ionic appends overlays next
 * to `ion-router-outlet` rather than inside it, and a sheet modal animates its own
 * height, so an outlet-scoped settle returns while the sheet is still growing.
 */
export async function settleOverlayAnimations(page: Page, surface: string): Promise<void> {
	await page.evaluate(() => {
		(window as unknown as { __overlayQuiet?: number }).__overlayQuiet = 0;
	});
	await expect
		.poll(
			async () =>
				await page.evaluate(() => {
					const w = window as unknown as { __overlayQuiet?: number };
					const running = document.getAnimations().filter((a) => {
						if (a.playState !== 'running') return false;
						// spinners and pulses never end; they would stall the poll forever
						return a.effect?.getComputedTiming?.().iterations !== Infinity;
					});
					w.__overlayQuiet = running.length === 0 ? (w.__overlayQuiet ?? 0) + 1 : 0;
					return (w.__overlayQuiet ?? 0) >= 3;
				}),
			{ timeout: 10_000, message: `${surface}: overlay animations never settled` }
		)
		.toBe(true);
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

// #endregion

// #region running-animation census

export interface AnimationRecord {
	label: string;
	name: string;
	playState: string;
	/** one iteration, in ms; `-1` when the timing model reports `auto` */
	iterationMs: number;
	/** `-1` stands in for Infinity, which does not survive JSON */
	iterations: number;
	/** total active duration in ms; `-1` stands in for Infinity */
	activeMs: number;
}

/**
 * Every animation the document still considers live. Snapshot semantics: an
 * animation that already finished is gone, which is exactly the WCAG 2.2.2
 * question (is something STILL moving).
 *
 * `document.getAnimations()` reaches into shadow trees, so ion-spinner and the
 * other Ionic internals are covered; `documentElement.getAnimations({subtree})`
 * would not see them.
 */
export async function collectRunningAnimations(page: Page): Promise<AnimationRecord[]> {
	return await page.evaluate(() => {
		const label = (el: Element | null, pseudo: string): string => {
			if (!el) return '(no target)';
			const tag = el.tagName.toLowerCase();
			const id = el.id ? `#${el.id}` : '';
			const cls = Array.from(el.classList)
				.filter((c) => !/^(hydrated|ion-(activatable|focusable)|md|ios)$/.test(c))
				.slice(0, 3)
				.map((c) => `.${c}`)
				.join('');
			const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
			const name = text ? ` "${text}"` : '';
			return `${tag}${id}${cls}${pseudo}${name}`;
		};

		const num = (v: unknown): number => {
			if (v === Infinity) return -1;
			return typeof v === 'number' && Number.isFinite(v) ? v : -1;
		};

		const out: AnimationRecord[] = [];
		for (const anim of document.getAnimations()) {
			// finished/idle animations are not moving, so they are out of scope
			if (anim.playState === 'finished' || anim.playState === 'idle') continue;
			const effect = anim.effect as KeyframeEffect | null;
			const timing = effect?.getComputedTiming?.();
			const target = effect && 'target' in effect ? effect.target : null;
			const pseudo = (effect && 'pseudoElement' in effect ? effect.pseudoElement : null) ?? '';
			const a = anim as Animation & {
				animationName?: string;
				transitionProperty?: string;
			};
			out.push({
				label: label(target as Element | null, pseudo),
				name: a.animationName || a.transitionProperty || anim.id || '(script)',
				playState: anim.playState,
				iterationMs: num(timing?.duration),
				iterations: num(timing?.iterations),
				activeMs: num(timing?.activeDuration)
			});
		}
		return out;
	});
}

/** `iterations === -1` is the JSON-safe stand-in for Infinity. */
export function isEndless(record: AnimationRecord): boolean {
	return record.iterations === -1 || record.activeMs === -1;
}

export function describeAnimation(record: AnimationRecord): string {
	const iterations = record.iterations === -1 ? 'infinite' : String(record.iterations);
	const iteration = record.iterationMs === -1 ? 'auto' : `${record.iterationMs}ms`;
	const active = record.activeMs === -1 ? 'infinite' : `${Math.round(record.activeMs)}ms`;
	return `${record.label} :: "${record.name}" (${iteration} x ${iterations} = ${active}, ${record.playState})`;
}

// #endregion

// #region Web Animations API recorder

export interface AnimateCall {
	label: string;
	id: string;
	durationMs: number;
	inOutlet: boolean;
	isPage: boolean;
}

export async function installAnimateRecorder(context: BrowserContext): Promise<void> {
	await context.addInitScript(() => {
		const w = window as unknown as { __waapi?: AnimateCall[] };
		w.__waapi = [];
		const original = Element.prototype.animate;
		Element.prototype.animate = function (
			this: Element,
			keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
			options?: number | KeyframeAnimationOptions
		): Animation {
			const animation = original.call(this, keyframes, options);
			try {
				const raw = typeof options === 'number' ? options : options?.duration;
				const ms = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
				const cls = Array.from(this.classList).slice(0, 3).join('.');
				w.__waapi!.push({
					label: `${this.tagName.toLowerCase()}${this.id ? `#${this.id}` : ''}${cls ? `.${cls}` : ''}`,
					id: typeof options === 'object' && options?.id ? options.id : '',
					durationMs: ms,
					inOutlet: !!this.closest?.('ion-router-outlet'),
					isPage: this.classList.contains('ion-page')
				});
			} catch {
				// never let the recorder break a real animation
			}
			return animation;
		};
	});
}

export async function clearAnimateRecords(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as unknown as { __waapi?: unknown[] }).__waapi = [];
	});
}

export async function readAnimateRecords(page: Page): Promise<AnimateCall[]> {
	return await page.evaluate(
		() => (window as unknown as { __waapi?: AnimateCall[] }).__waapi ?? []
	);
}

// #endregion

// #region overflow + clipping audit

export interface OverflowReport {
	viewport: { width: number; height: number };
	scrollWidth: number;
	clientWidth: number;
	scanned: number;
	/** innermost elements whose right edge is past the viewport */
	overflow: string[];
	/** visible-overflow text boxes shorter/narrower than their own text */
	clipped: string[];
	/** overflow:hidden text boxes cutting their own text with no clamp or ellipsis */
	clippedHidden: string[];
}

/**
 * One in-page pass over the surface: horizontal bleed plus two flavours of text
 * clipping. `slack` absorbs sub-pixel and line-height rounding.
 */
export async function collectOverflow(
	page: Page,
	opts: { rootSelector?: string; slack?: number } = {}
): Promise<OverflowReport> {
	const report = await page.evaluate(
		({ rootSelector, slack }) => {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const scope: ParentNode | null = rootSelector
				? document.querySelector(rootSelector)
				: document;
			if (!scope) return null;

			const round = (n: number) => Math.round(n * 10) / 10;

			const label = (el: Element): string => {
				const tag = el.tagName.toLowerCase();
				const id = el.id ? `#${el.id}` : '';
				const cls = Array.from(el.classList)
					.filter((c) => !/^(hydrated|ion-(activatable|focusable)|md|ios)$/.test(c))
					.slice(0, 2)
					.map((c) => `.${c}`)
					.join('');
				const aria = el.getAttribute('aria-label');
				const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
				const name = aria ? ` [aria-label="${aria}"]` : text ? ` "${text}"` : '';
				return `${tag}${id}${cls}${name}`;
			};

			// closed ion-modals stay in the DOM, and ionic hides parked pages by class
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

			const isVisible = (el: Element, rect: DOMRect): boolean => {
				if (rect.width <= 0 || rect.height <= 0) return false;
				const cs = getComputedStyle(el);
				if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
				if (cs.display === 'none' || cs.contentVisibility === 'hidden') return false;
				return !inHiddenSubtree(el);
			};

			// ionic parks the outgoing view one viewport to the left during a transition, so
			// anything fully offstage belongs to the previous page, not the one under audit
			const onstage = (rect: DOMRect): boolean =>
				rect.right > 0 && rect.left < vw && rect.bottom > 0 && rect.top < vh;

			const hasDirectText = (el: Element): boolean =>
				Array.from(el.childNodes).some(
					(n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== ''
				);

			// a real text box: only inline, in-flow children, so a tall child cannot inflate scrollHeight
			const onlyInlineChildren = (el: Element): boolean =>
				Array.from(el.children).every((c) => {
					const cs = getComputedStyle(c);
					if (cs.position === 'absolute' || cs.position === 'fixed') return false;
					return cs.display.startsWith('inline') || cs.display === 'contents';
				});

			const SKIP = new Set([
				'SCRIPT',
				'STYLE',
				'TEMPLATE',
				'TITLE',
				'NOSCRIPT',
				'OPTION',
				'TEXTAREA',
				'SELECT',
				'BR'
			]);

			const bleeding: Element[] = [];
			const clipped: string[] = [];
			const clippedHidden: string[] = [];
			let scanned = 0;

			for (const el of Array.from(scope.querySelectorAll('*'))) {
				if (SKIP.has(el.tagName) || el instanceof SVGElement) continue;
				const rect = el.getBoundingClientRect();
				if (!isVisible(el, rect)) continue;
				if (rect.bottom <= 0 || rect.top >= vh) continue;
				scanned++;

				// only content that starts onscreen can genuinely bleed right; an element parked
				// entirely to one side is a transition artifact
				if (rect.left >= -1 && rect.left < vw && rect.right > vw + 1) bleeding.push(el);

				if (!onstage(rect)) continue;
				// the sr-only pattern is a 1px overflow:hidden box BY DESIGN, so it always reports as
				// cutting its own text; it is announced, not rendered, and there is nothing to measure
				if (rect.width * rect.height < 4) continue;
				if (el.closest('[data-allow-clip]')) continue;
				const cs = getComputedStyle(el);
				// an author-declared clamp or ellipsis is an intentional truncation, not a defect
				if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue;
				if (cs.textOverflow === 'ellipsis') continue;
				if (!hasDirectText(el) || !onlyInlineChildren(el)) continue;
				// an inline box reports no scroll/client metrics at all
				if (el.clientHeight === 0 && el.clientWidth === 0) continue;

				const visibleBox =
					cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible';
				// auto/scroll boxes are intentional scrollers; hidden/clip silently destroys text
				const cutsContent =
					/^(hidden|clip)$/.test(cs.overflowY) || /^(hidden|clip)$/.test(cs.overflowX);

				const tallerBy = el.scrollHeight - el.clientHeight;
				const widerBy = el.scrollWidth - el.clientWidth;
				const detail =
					tallerBy > widerBy
						? `height ${el.scrollHeight} > ${el.clientHeight}`
						: `width ${el.scrollWidth} > ${el.clientWidth}`;

				if (visibleBox) {
					if (tallerBy > 1) {
						clipped.push(`${label(el)} -> height ${el.scrollHeight} > ${el.clientHeight}`);
					} else if (widerBy > 1) {
						clipped.push(`${label(el)} -> width ${el.scrollWidth} > ${el.clientWidth}`);
					}
				} else if (cutsContent && (tallerBy > slack || widerBy > slack)) {
					clippedHidden.push(`${label(el)} -> ${detail}`);
				}
			}

			// report the innermost offender only; every ancestor stretches with it
			const overflow = bleeding
				.filter((el) => !bleeding.some((other) => other !== el && el.contains(other)))
				.map((el) => `${label(el)} -> right edge ${round(el.getBoundingClientRect().right)}`);

			const se = document.scrollingElement ?? document.documentElement;
			return {
				viewport: { width: vw, height: vh },
				scrollWidth: se.scrollWidth,
				clientWidth: se.clientWidth,
				scanned,
				overflow,
				clipped,
				clippedHidden
			};
		},
		{ rootSelector: opts.rootSelector, slack: opts.slack ?? 4 }
	);

	expect(report, `overflow audit found no root matching "${opts.rootSelector}"`).not.toBeNull();
	return report as OverflowReport;
}

/** Keep a failure message readable when a surface has dozens of offenders. */
export function summarize(items: string[], max = 25): string {
	if (items.length <= max) return items.join('\n');
	return [...items.slice(0, max), `... and ${items.length - max} more`].join('\n');
}

// #endregion

// #region typography overrides

export interface ScaleSample {
	label: string;
	beforePx: number;
	afterPx: number;
	/** matched one of the caller's exempt selectors */
	exempt: boolean;
}

/**
 * How every onscreen text box reacts to an `--app-ui-scale` change - the in-app text-size
 * setting, which `useSettings` writes as the same custom property. Measured in a single
 * in-page pass so both readings come from the same element; re-querying after the reflow
 * would rebuild the list and lose the pairing.
 *
 * `exemptSelectors` names the boxes whose size comes from Ionic's own component CSS
 * instead of a `--text-*` token, matched with `closest()` so slotted text counts too.
 * The scale is left applied when this returns, ready for the reflow audit.
 */
export async function measureScaleResponse(
	page: Page,
	scale: number,
	exemptSelectors: string[]
): Promise<ScaleSample[]> {
	return await page.evaluate(
		({ scale, exemptSelectors }) => {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const exempt = exemptSelectors.join(',');

			// same onscreen-text-box predicate as measureTypography; in-page code cannot import it
			const boxes: Element[] = [];
			for (const el of Array.from(document.querySelectorAll('*'))) {
				const hasText = Array.from(el.childNodes).some(
					(n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== ''
				);
				if (!hasText) continue;
				const rect = el.getBoundingClientRect();
				if (rect.width <= 0 || rect.height <= 0) continue;
				if (rect.right <= 0 || rect.left >= vw || rect.bottom <= 0 || rect.top >= vh) continue;
				const cs = getComputedStyle(el);
				if (cs.visibility !== 'visible' || cs.display === 'none') continue;
				if (!Number.isFinite(Number.parseFloat(cs.fontSize))) continue;
				// sr-only text is clipped to a 1px box on purpose, so it can never grow with the
				// scale and is not a legible surface worth measuring
				if (rect.width * rect.height < 4) continue;
				boxes.push(el);
			}

			const label = (el: Element): string => {
				const cls = Array.from(el.classList).slice(0, 3).join('.');
				const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
				return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
			};

			const before = boxes.map((el) => Number.parseFloat(getComputedStyle(el).fontSize));
			document.documentElement.style.setProperty('--app-ui-scale', String(scale));

			return boxes.map((el, i) => ({
				label: label(el),
				beforePx: before[i]!,
				afterPx: Number.parseFloat(getComputedStyle(el).fontSize),
				exempt: exempt ? !!el.closest(exempt) : false
			}));
		},
		{ scale, exemptSelectors }
	);
}

/** Browser-level text zoom: every rem-based token grows with the root font size. */
export async function setRootFontSize(page: Page, px: number): Promise<void> {
	await page.evaluate((v) => {
		document.documentElement.style.setProperty('font-size', `${v}px`, 'important');
	}, px);
}

export const TEXT_SPACING_CSS = `
* {
	line-height: 1.5 !important;
	letter-spacing: 0.12em !important;
	word-spacing: 0.16em !important;
}
p {
	margin-bottom: 2em !important;
}
`;

/**
 * All four WCAG 1.4.12 user overrides at once; the SC requires them together.
 *
 * The stylesheet alone is not enough. Sky ships `!`-important Tailwind utilities,
 * and an important declaration inside a cascade layer outranks an important one
 * in an unlayered author sheet - so `* { line-height: 1.5 !important }` loses to
 * `text-4xl!`. Real assistive tooling injects a USER-origin sheet, which beats
 * every author rule; the closest author-side equivalent is an element-attached
 * important declaration, which outranks layers. Both are applied: the sheet
 * reaches text that inherits into shadow DOM, the inline pass guarantees the
 * light-DOM boxes actually take the override.
 */
export async function applyTextSpacing(page: Page): Promise<void> {
	await page.addStyleTag({ content: TEXT_SPACING_CSS });
	await page.evaluate(() => {
		for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
			el.style.setProperty('line-height', '1.5', 'important');
			el.style.setProperty('letter-spacing', '0.12em', 'important');
			el.style.setProperty('word-spacing', '0.16em', 'important');
			if (el.tagName === 'P') el.style.setProperty('margin-bottom', '2em', 'important');
		}
	});
}

export interface TypographySample {
	rootFontPx: number;
	/** the largest onscreen text box, and the metrics of that same box */
	sample: string;
	fontPx: number;
	lineHeightPx: number;
	letterSpacingPx: number;
	wordSpacingPx: number;
	/**
	 * median font size across every onscreen text box. The lever checks read this
	 * rather than the max, so one hardcoded-px outlier cannot mask a working scale
	 * (or fake a broken one).
	 */
	medianFontPx: number;
	textBoxes: number;
}

/**
 * The typography actually in force across the onscreen text boxes. Every resize
 * lever is asserted against this before/after, otherwise a lever that silently
 * failed to apply would leave the whole audit passing on unchanged layout.
 */
export async function measureTypography(page: Page): Promise<TypographySample> {
	return await page.evaluate(() => {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let best: Element | null = null;
		let bestPx = 0;
		const sizes: number[] = [];

		for (const el of Array.from(document.querySelectorAll('*'))) {
			const hasText = Array.from(el.childNodes).some(
				(n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== ''
			);
			if (!hasText) continue;
			const rect = el.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) continue;
			if (rect.right <= 0 || rect.left >= vw || rect.bottom <= 0 || rect.top >= vh) continue;
			const cs = getComputedStyle(el);
			if (cs.visibility !== 'visible' || cs.display === 'none') continue;
			const size = Number.parseFloat(cs.fontSize);
			if (!Number.isFinite(size) || size <= 0) continue;
			sizes.push(size);
			if (size > bestPx) {
				bestPx = size;
				best = el;
			}
		}

		sizes.sort((a, b) => a - b);
		const medianFontPx = sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)]! : 0;
		const cs = best ? getComputedStyle(best) : null;
		const px = (value: string | undefined) => {
			const n = Number.parseFloat(value ?? '');
			return Number.isFinite(n) ? n : 0;
		};
		const describe = (el: Element | null): string => {
			if (!el) return '(no text box)';
			const cls = Array.from(el.classList).slice(0, 3).join('.');
			const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
			return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
		};

		return {
			rootFontPx: px(getComputedStyle(document.documentElement).fontSize),
			sample: describe(best),
			fontPx: bestPx,
			lineHeightPx: px(cs?.lineHeight),
			letterSpacingPx: px(cs?.letterSpacing),
			wordSpacingPx: px(cs?.wordSpacing),
			medianFontPx,
			textBoxes: sizes.length
		};
	});
}

// #endregion

// #region network holds

// content listings the dashboard feed and discover fan out to; holding these keeps a
// surface in its loading state long enough to audit the skeletons
const HELD_LISTING_PATHS = [
	/^\/v2\/(activities|articles|prompts|events)(\/|$)/,
	/^\/v2\/users\/?$/,
	/^\/v2\/users\/current\/activities\/recommend\/?$/,
	/^\/v1\/(articles|events|users)\/recommend/
];

/**
 * Stall every content-listing GET so the skeleton state stays on screen. Auth,
 * quest and notification routes are left alone so the shell still boots.
 */
export async function holdContentListings(page: Page, ms = 25_000): Promise<void> {
	await page.route(
		(url) => HELD_LISTING_PATHS.some((re) => re.test(url.pathname)),
		async (route) => {
			if (route.request().method() !== 'GET') return route.fallback();
			await new Promise((resolve) => setTimeout(resolve, ms));
			try {
				await route.abort();
			} catch {
				// page closed while the hold was pending
			}
		}
	);
}

// #endregion

// #region UI coherence audit

/** Everything the layout gates treat as tappable, plus the Ionic rows sky wires @click onto. */
export const INTERACTIVE_SELECTOR = [
	'button',
	'a[href]',
	'ion-button',
	'ion-tab-button',
	'ion-chip[role="button"]',
	'input',
	'ion-toggle',
	'ion-checkbox',
	'ion-radio',
	'ion-select',
	'ion-item',
	'[role="button"]',
	'[role="radio"]',
	'[role="option"]',
	'ion-fab-button',
	'ion-back-button',
	'ion-segment-button'
].join(', ');

export interface CoherenceReport {
	viewport: { width: number; height: number };
	scrollWidth: number;
	clientWidth: number;
	/** visible onstage text/interactive boxes the clip pass considered */
	candidates: number;
	/** visible onstage interactive boxes the overlap pass compared */
	interactives: number;
	tables: number;
	tableRows: number;
	/** consecutive stacked text-block pairs the spacing pass compared */
	pairs: number;
	/** text boxes the line-height pass considered */
	textBoxes: number;
	/** boxes whose rect leaves the client rect of a clipping ancestor */
	clipped: string[];
	/** scroll containers scrolling sideways that are not a deliberate rail */
	hscroll: string[];
	/** interactive pairs intersecting past the area budget */
	overlaps: string[];
	/** malformed tables: ragged rows, zero-size cells, spilling cells, misaligned columns */
	tableIssues: string[];
	/** stacked text blocks whose ink touches, or whose boxes overlap outright */
	tightGaps: string[];
	/** text boxes shorter than one line of their own text */
	shortLines: string[];
}

export interface CoherenceOptions {
	/** audit only inside this element (e.g. `ion-modal.show-modal`) */
	rootSelector?: string;
	/** smallest acceptable gap between two stacked text blocks, in px */
	minGapPx?: number;
	/** share of the smaller box two interactive boxes may share before it reads as crammed */
	maxOverlapRatio?: number;
}

/**
 * One in-page geometry pass looking for incoherent layout: content cut off by an
 * ancestor, sideways scroll nobody asked for, interactive boxes sitting on top of
 * each other, malformed tables, and text crammed into too little space.
 *
 * Same measurement approach as `collectOverflow` above (single frame, Ionic's
 * mounted-but-hidden and parked-offstage boxes filtered out), aimed at the
 * surfaces that only exist after an interaction - modals, sheets, drawers,
 * popovers, the toast host.
 */
export async function collectCoherence(
	page: Page,
	opts: CoherenceOptions = {}
): Promise<CoherenceReport> {
	const report = await page.evaluate(
		({ rootSelector, interactive, minGap, maxOverlap }) => {
			const SLACK = 1;
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const root: Element | null = rootSelector
				? document.querySelector(rootSelector)
				: document.body;
			if (!root) return null;

			const round = (n: number) => Math.round(n * 10) / 10;
			const box = (r: DOMRect | { left: number; top: number; right: number; bottom: number }) =>
				`(${round(r.left)},${round(r.top)})-(${round(r.right)},${round(r.bottom)})`;

			const label = (el: Element): string => {
				const tag = el.tagName.toLowerCase();
				const id = el.id ? `#${el.id}` : '';
				const cls = Array.from(el.classList)
					.filter((c) => !/^(hydrated|ion-(activatable|focusable)|md|ios)$/.test(c))
					.slice(0, 2)
					.map((c) => `.${c}`)
					.join('');
				const aria = el.getAttribute('aria-label');
				const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
				const name = aria ? ` [aria-label="${aria}"]` : text ? ` "${text}"` : '';
				return `${tag}${id}${cls}${name}`;
			};

			// closed ion-modals stay in the DOM, and ionic hides parked pages by class
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

			// every box is read against one frame, so a live style object per element is safe to
			// keep; the clip walk re-visits the same ancestors hundreds of times on a full page
			const styles = new WeakMap<Element, CSSStyleDeclaration>();
			const styleOf = (el: Element): CSSStyleDeclaration => {
				let cs = styles.get(el);
				if (!cs) {
					cs = getComputedStyle(el);
					styles.set(el, cs);
				}
				return cs;
			};

			const isVisible = (el: Element, rect: DOMRect): boolean => {
				if (rect.width <= 0 || rect.height <= 0) return false;
				const cs = styleOf(el);
				if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
				if (cs.display === 'none' || cs.contentVisibility === 'hidden') return false;
				if (Number.parseFloat(cs.opacity) === 0) return false;
				return !inHiddenSubtree(el);
			};

			// ionic parks the outgoing view one viewport to the left during a transition, so
			// anything fully offstage belongs to the previous page, not the one under audit
			const onstage = (rect: DOMRect): boolean =>
				rect.right > 0 && rect.left < vw && rect.bottom > 0 && rect.top < vh;

			const hasDirectText = (el: Element): boolean =>
				Array.from(el.childNodes).some(
					(n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== ''
				);

			// an author-declared clamp or ellipsis is intentional truncation, not a defect
			const truncates = (cs: CSSStyleDeclaration): boolean =>
				cs.textOverflow === 'ellipsis' || (!!cs.webkitLineClamp && cs.webkitLineClamp !== 'none');

			/**
			 * Content past the client rect is only reachable when the author asked for a
			 * scroller AND there is something to scroll. `overflow: hidden` past the edge is
			 * destroyed content no matter how big scrollWidth reports.
			 */
			const scrollableX = (el: Element, cs: CSSStyleDeclaration): boolean =>
				/^(auto|scroll)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
			const scrollableY = (el: Element, cs: CSSStyleDeclaration): boolean =>
				/^(auto|scroll)$/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;

			const SKIP = new Set([
				'SCRIPT',
				'STYLE',
				'TEMPLATE',
				'TITLE',
				'NOSCRIPT',
				'OPTION',
				'SELECT',
				'BR',
				'HEAD',
				'META',
				'LINK'
			]);

			// the scroll viewport and every overlay host own their own clipping; content below
			// the fold of one of these is reachable by scrolling, not destroyed. their real
			// scrollers live in shadow DOM, so their light-DOM metrics would lie
			const CLIP_STOP = new Set([
				'ION-CONTENT',
				'ION-MODAL',
				'ION-POPOVER',
				'ION-ACTION-SHEET',
				'ION-ALERT',
				'ION-TOAST',
				'ION-HEADER',
				'ION-FOOTER',
				'ION-TOOLBAR',
				'ION-TAB-BAR',
				'ION-TABS',
				'ION-ROUTER-OUTLET',
				'ION-APP',
				'ION-INFINITE-SCROLL',
				'ION-REFRESHER',
				'BODY',
				'HTML'
			]);
			const isClipStop = (el: Element): boolean =>
				CLIP_STOP.has(el.tagName) || el.classList.contains('ion-page');

			const all = Array.from(root.querySelectorAll('*')).filter(
				(el) => !SKIP.has(el.tagName) && !(el instanceof SVGElement)
			);
			// the root itself can be the offender (a modal body that scrolls sideways)
			const withRoot = [root, ...all];

			const clipped: string[] = [];
			const hscroll: string[] = [];
			const overlaps: string[] = [];
			const tableIssues: string[] = [];
			const tightGaps: string[] = [];
			const shortLines: string[] = [];

			// #region clipped by an ancestor
			/**
			 * The nearest ancestor that cuts `el` off. An absolutely positioned box is only
			 * clipped by ancestors in its containing-block chain, and an axis a container can
			 * actually scroll is reachable, so neither counts as destroyed content.
			 */
			const clipOffense = (el: Element, rect: DOMRect): string | null => {
				if (styleOf(el).position === 'fixed') return null;
				let escapes = false;
				let child: Element = el;
				for (let anc = el.parentElement; anc; child = anc, anc = anc.parentElement) {
					if (isClipStop(anc)) return null;
					const ccs = styleOf(child);
					if (ccs.position === 'fixed') return null;
					if (ccs.position === 'absolute') escapes = true;
					const acs = styleOf(anc);
					const establishesCB =
						acs.position !== 'static' ||
						acs.transform !== 'none' ||
						acs.filter !== 'none' ||
						acs.perspective !== 'none' ||
						acs.willChange.includes('transform') ||
						/paint|layout|strict|content/.test(acs.contain);
					if (escapes && !establishesCB) continue;
					if (establishesCB) escapes = false;
					if (anc.hasAttribute('data-allow-clip')) return null;
					if (truncates(acs)) continue;
					if (anc.clientWidth === 0 && anc.clientHeight === 0) continue;

					const ab = anc.getBoundingClientRect();
					const left = ab.left + anc.clientLeft;
					const top = ab.top + anc.clientTop;
					const right = left + anc.clientWidth;
					const bottom = top + anc.clientHeight;
					const cutsX = /^(hidden|clip|auto|scroll)$/.test(acs.overflowX);
					const cutsY = /^(hidden|clip|auto|scroll)$/.test(acs.overflowY);
					const parts: string[] = [];
					if (cutsX && !scrollableX(anc, acs)) {
						if (rect.left < left - SLACK) parts.push(`left ${round(rect.left)} < ${round(left)}`);
						if (rect.right > right + SLACK)
							parts.push(`right ${round(rect.right)} > ${round(right)}`);
					}
					if (cutsY && !scrollableY(anc, acs)) {
						if (rect.top < top - SLACK) parts.push(`top ${round(rect.top)} < ${round(top)}`);
						if (rect.bottom > bottom + SLACK) {
							parts.push(`bottom ${round(rect.bottom)} > ${round(bottom)}`);
						}
					}
					if (parts.length) {
						return `${label(el)} ${box(rect)} cut by ${label(anc)} client ${box({ left, top, right, bottom })} [${parts.join(', ')}]`;
					}
				}
				return null;
			};

			let candidates = 0;
			for (const el of all) {
				const rect = el.getBoundingClientRect();
				if (!isVisible(el, rect) || !onstage(rect)) continue;
				if (!hasDirectText(el) && !el.matches(interactive)) continue;
				// sr-only is a 1px clipped box BY DESIGN, so it always reports as clipping its own
				// text; it is announced, not rendered, and there is nothing to measure
				if (rect.width * rect.height < 4) continue;
				candidates++;
				const offense = clipOffense(el, rect);
				if (offense) clipped.push(offense);
			}
			// #endregion

			// #region unintended horizontal scroll
			for (const el of withRoot) {
				const rect = el.getBoundingClientRect();
				if (!isVisible(el, rect) || !onstage(rect)) continue;
				const cs = styleOf(el);
				if (!/^(hidden|clip|auto|scroll)$/.test(cs.overflowX)) continue;
				if (el.clientWidth === 0) continue;
				if (el.scrollWidth <= el.clientWidth + 1) continue;
				// the sr-only clip technique IS a 1px box with hidden overflow, so every
				// screen-reader label reads as a sideways scroller; nobody can scroll it
				if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;

				// a deliberate rail: an author-declared x scroller whose overflow comes from one
				// wider-than-client track (a single wide child, a nowrap row, or an x snap axis)
				const optedIn = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
				const kids = Array.from(el.children);
				const wideChild = kids.some((c) => c.getBoundingClientRect().width > el.clientWidth + 1);
				const rowTrack =
					kids.length >= 2 &&
					((cs.display.includes('flex') &&
						cs.flexDirection.startsWith('row') &&
						cs.flexWrap === 'nowrap') ||
						(cs.display.includes('grid') && cs.gridAutoFlow.startsWith('column')));
				const snapsX = /(^|\s)(x|both)(\s|$)/.test(cs.scrollSnapType);
				if (optedIn && (wideChild || rowTrack || snapsX)) continue;

				hscroll.push(
					`${label(el)} -> overflow-x:${cs.overflowX} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`
				);
			}
			// #endregion

			// #region overlapping interactive boxes
			// an ionic overlay, the toast host and the create fab each float in their own plane,
			// so a box in one legitimately covers a box in another
			const LAYERS =
				'ion-modal, ion-popover, ion-action-sheet, ion-alert, ion-toast, ion-loading, .m-toast-host, ion-fab, div.ion-page, [role="dialog"]';
			const layerOf = (el: Element): Element | null => el.closest(LAYERS);

			// these ionic form controls use SCOPED (not shadow) encapsulation, so their internals
			// are real light-DOM siblings - a searchbar's clear button is meant to sit inside the
			// input's box. one control's own parts stacking is not two controls colliding
			const CONTROL_PARTS =
				'ion-searchbar, ion-input, ion-textarea, ion-select, ion-toggle, ion-checkbox, ion-radio, ion-range, ion-datetime, ion-picker';
			const controlOf = (el: Element): Element | null => el.closest(CONTROL_PARTS);

			interface Hit {
				el: Element;
				rect: DOMRect;
				layer: Element | null;
				control: Element | null;
			}
			const hits: Hit[] = [];
			for (const el of Array.from(root.querySelectorAll(interactive))) {
				const rect = el.getBoundingClientRect();
				if (!isVisible(el, rect) || !onstage(rect)) continue;
				if (styleOf(el).pointerEvents === 'none') continue;
				hits.push({ el, rect, layer: layerOf(el), control: controlOf(el) });
			}
			hits.sort((a, b) => a.rect.top - b.rect.top);
			for (let i = 0; i < hits.length; i++) {
				const a = hits[i]!;
				for (let j = i + 1; j < hits.length; j++) {
					const b = hits[j]!;
					// sorted by top, so once b starts below a's bottom nothing after it can touch a
					if (b.rect.top >= a.rect.bottom) break;
					if (a.layer !== b.layer) continue;
					if (a.control && a.control === b.control) continue;
					if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
					const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
					const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
					if (w <= 0 || h <= 0) continue;
					const areaA = a.rect.width * a.rect.height;
					const areaB = b.rect.width * b.rect.height;
					const ratio = (w * h) / Math.min(areaA, areaB);
					if (ratio <= maxOverlap) continue;
					overlaps.push(
						`${label(a.el)} ${box(a.rect)} overlaps ${label(b.el)} ${box(b.rect)} by ${Math.round(ratio * 100)}%`
					);
				}
			}
			// #endregion

			// #region tables and grids
			const CELL = (el: Element): boolean =>
				el.tagName === 'TD' ||
				el.tagName === 'TH' ||
				el.getAttribute('role') === 'cell' ||
				el.getAttribute('role') === 'gridcell' ||
				el.getAttribute('role') === 'columnheader';
			const cellsOf = (row: Element): Element[] => Array.from(row.children).filter(CELL);
			const spanOf = (cell: Element): number => {
				const raw = cell.getAttribute('colspan') ?? cell.getAttribute('aria-colspan');
				const n = Number.parseInt(raw ?? '1', 10);
				return Number.isFinite(n) && n > 0 ? n : 1;
			};

			const tableEls = Array.from(root.querySelectorAll('table, [role="table"], [role="grid"]'));
			let tableRows = 0;
			for (const table of tableEls) {
				const tRect = table.getBoundingClientRect();
				if (!isVisible(table, tRect) || !onstage(tRect)) continue;
				const rows = Array.from(table.querySelectorAll('tr, [role="row"]'));
				if (rows.length === 0) {
					tableIssues.push(`${label(table)} -> renders no rows at all`);
					continue;
				}
				const headRow =
					table.querySelector('thead tr, thead [role="row"]') ??
					rows.find((r) => cellsOf(r).some((c) => c.tagName === 'TH')) ??
					rows[0]!;
				const headCells = cellsOf(headRow);
				const headCols = headCells.reduce((n, c) => n + spanOf(c), 0);
				if (headCols === 0) {
					tableIssues.push(`${label(table)} -> header row has no cells`);
					continue;
				}

				let index = 0;
				for (const row of rows) {
					if (row === headRow) continue;
					const rRect = row.getBoundingClientRect();
					if (!isVisible(row, rRect)) continue;
					index++;
					tableRows++;
					const cells = cellsOf(row);
					const cols = cells.reduce((n, c) => n + spanOf(c), 0);
					if (cols !== headCols) {
						tableIssues.push(
							`${label(table)} row ${index} -> ${cols} cells, header declares ${headCols} ("${(row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}")`
						);
					}

					for (let k = 0; k < cells.length; k++) {
						const cell = cells[k]!;
						const cRect = cell.getBoundingClientRect();
						if (cRect.width <= 0 || cRect.height <= 0) {
							tableIssues.push(
								`${label(table)} row ${index} cell ${k + 1} -> zero size ${round(cRect.width)}x${round(cRect.height)}`
							);
							continue;
						}
						const ccs = styleOf(cell);
						// a cell the author made scrollable can hold more than it shows
						if (!truncates(ccs) && !scrollableX(cell, ccs) && !scrollableY(cell, ccs)) {
							if (cell.scrollWidth > cell.clientWidth + SLACK) {
								tableIssues.push(
									`${label(table)} row ${index} cell ${k + 1} "${(cell.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}" -> content ${cell.scrollWidth}px wide in a ${cell.clientWidth}px box`
								);
							} else if (cell.scrollHeight > cell.clientHeight + SLACK) {
								tableIssues.push(
									`${label(table)} row ${index} cell ${k + 1} "${(cell.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}" -> content ${cell.scrollHeight}px tall in a ${cell.clientHeight}px box`
								);
							}
						}
						// a column whose body cell does not line up under its header is not a table
						const head = headCells[k];
						if (!head || cols !== headCols || spanOf(cell) !== 1 || spanOf(head) !== 1) continue;
						const hRect = head.getBoundingClientRect();
						if (hRect.width <= 0) continue;
						const dLeft = Math.abs(hRect.left - cRect.left);
						const dRight = Math.abs(hRect.right - cRect.right);
						if (dLeft > 2 || dRight > 2) {
							tableIssues.push(
								`${label(table)} column ${k + 1} misaligned -> header ${box(hRect)} vs row ${index} cell ${box(cRect)} (left off by ${round(dLeft)}, right off by ${round(dRight)})`
							);
						}
					}
				}
			}
			// #endregion

			// #region too compact
			// only leaf text: a wrapper's box gap says nothing about how close the words are
			const isTextBlock = (el: Element, cs: CSSStyleDeclaration): boolean => {
				if (!hasDirectText(el)) return false;
				if (cs.display === 'inline' || cs.display === 'contents') return false;
				if (cs.position === 'absolute' || cs.position === 'fixed') return false;
				return true;
			};

			/**
			 * Half-leading: the empty band a line box puts above and below the glyphs. Two
			 * boxes with a 0px gap and 1.5 line-height are 6px apart to the eye, which is why
			 * the gap is measured between the INK and not between the border boxes - otherwise
			 * every legitimate zero-margin title/subtitle pair reads as a defect.
			 */
			const leading = (cs: CSSStyleDeclaration): number => {
				const lh = Number.parseFloat(cs.lineHeight);
				const fs = Number.parseFloat(cs.fontSize);
				if (!Number.isFinite(lh) || !Number.isFinite(fs)) return 0;
				return Math.max(0, (lh - fs) / 2);
			};

			let pairs = 0;
			for (const parent of withRoot) {
				const kids = Array.from(parent.children).filter((c) => !SKIP.has(c.tagName));
				if (kids.length < 2) continue;

				let prev: { el: Element; rect: DOMRect; cs: CSSStyleDeclaration } | null = null;
				for (const kid of kids) {
					const rect = kid.getBoundingClientRect();
					const cs = styleOf(kid);
					if (!isVisible(kid, rect) || !onstage(rect) || !isTextBlock(kid, cs)) continue;
					if (prev) {
						// only a genuine vertical stack: the boxes share a column and step downward
						const share =
							Math.min(prev.rect.right, rect.right) - Math.max(prev.rect.left, rect.left);
						const narrower = Math.min(prev.rect.width, rect.width);
						if (share > narrower * 0.5 && rect.top >= prev.rect.top) {
							pairs++;
							const gap = rect.top - prev.rect.bottom;
							const inkGap = gap + leading(prev.cs) + leading(cs);
							if (gap < -SLACK) {
								tightGaps.push(
									`${label(prev.el)} ${box(prev.rect)} OVERLAPS ${label(kid)} ${box(rect)} by ${round(-gap)}px inside ${label(parent)}`
								);
							} else if (inkGap < minGap) {
								tightGaps.push(
									`${label(prev.el)} ${box(prev.rect)} then ${label(kid)} ${box(rect)} -> ${round(inkGap)}px between the text (box gap ${round(gap)}px, no leading to spare) inside ${label(parent)}`
								);
							}
						}
					}
					prev = { el: kid, rect, cs };
				}
			}

			let textBoxes = 0;
			for (const el of all) {
				const rect = el.getBoundingClientRect();
				if (!isVisible(el, rect) || !onstage(rect)) continue;
				if (!hasDirectText(el)) continue;
				const cs = styleOf(el);
				// an inline box reports the font's ink box, which is always under the line box
				if (cs.display === 'inline' || cs.display === 'contents') continue;
				if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue;
				// the sr-only pattern is a 1px clipped box on purpose
				if (rect.width * rect.height < 4) continue;
				const lineHeight = Number.parseFloat(cs.lineHeight);
				if (!Number.isFinite(lineHeight) || lineHeight <= 0) continue;
				textBoxes++;
				if (rect.height + SLACK < lineHeight) {
					shortLines.push(
						`${label(el)} -> ${round(rect.height)}px tall for a ${round(lineHeight)}px line`
					);
				}
			}
			// #endregion

			const se = document.scrollingElement ?? document.documentElement;
			return {
				viewport: { width: vw, height: vh },
				scrollWidth: se.scrollWidth,
				clientWidth: se.clientWidth,
				candidates,
				interactives: hits.length,
				tables: tableEls.length,
				tableRows,
				pairs,
				textBoxes,
				clipped,
				hscroll,
				overlaps,
				tableIssues,
				tightGaps,
				shortLines
			};
		},
		{
			rootSelector: opts.rootSelector,
			interactive: INTERACTIVE_SELECTOR,
			minGap: opts.minGapPx ?? 2,
			maxOverlap: opts.maxOverlapRatio ?? 0.25
		}
	);

	expect(report, `coherence audit found no root matching "${opts.rootSelector}"`).not.toBeNull();
	return report as CoherenceReport;
}

// #endregion
