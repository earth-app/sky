import type { Page } from '@playwright/test';
import { suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestDetail } from './utils/quest-helpers';

/**
 * Layout-quality gate: real geometry at phone width, three audits per surface -
 * tap targets against their tier floor, nothing bleeding past the right edge, and
 * no text box clipping its own content unless it opts into clamping.
 *
 * Everything is measured in one in-page pass so every element is read against the
 * same frame; `getBoundingClientRect()` is the box Playwright's `boundingBox()`
 * reports. No screenshots are taken or compared.
 */

/**
 * Two tiers, matching the floors `main.css` actually enforces.
 *
 * WCAG 2.2 SC 2.5.8 (AA) is the real conformance requirement at 24px. Apple's HIG 44pt is a
 * recommendation, so it is held only for the primary navigation targets - applying it to every
 * inline button made `size="small"` identical to default and squared the round icon buttons.
 */
const MIN_TAP = 24;
const MIN_TAP_PRIMARY = 44;
// nav controls only. `shape="round"` is NOT a signal here - in ionic it just means pill-shaped,
// which an ordinary small text button legitimately is
const PRIMARY_TARGETS = 'ion-tab-button, ion-fab-button, ion-back-button';

const INTERACTIVE = [
	'button',
	'a[href]',
	'ion-button',
	'ion-tab-button',
	'ion-chip[role="button"]',
	'input',
	'ion-toggle',
	'ion-checkbox',
	'[role="button"]',
	'ion-fab-button',
	'ion-back-button',
	'ion-segment-button'
].join(', ');

interface LayoutReport {
	viewport: { width: number; height: number };
	scrollWidth: number;
	clientWidth: number;
	counted: number;
	scanned: number;
	tap: string[];
	overflow: string[];
	clipped: string[];
}

/**
 * Wait until the Ionic router outlet has no finite animation running. A fixed
 * delay lands mid-slide, and mid-slide the outgoing page is still onstage.
 */
async function settle(page: Page, surface: string): Promise<void> {
	await page.evaluate(() => {
		(window as unknown as { __layoutQuiet?: number }).__layoutQuiet = 0;
	});
	await expect
		.poll(
			async () =>
				await page.evaluate(() => {
					const w = window as unknown as { __layoutQuiet?: number };
					const root = document.querySelector('ion-router-outlet') ?? document.documentElement;
					const running = root.getAnimations({ subtree: true }).filter((a) => {
						if (a.playState !== 'running') return false;
						// spinners and pulses never end; they would stall the poll forever
						return a.effect?.getComputedTiming?.().iterations !== Infinity;
					});
					w.__layoutQuiet = running.length === 0 ? (w.__layoutQuiet ?? 0) + 1 : 0;
					return (w.__layoutQuiet ?? 0) >= 3;
				}),
			{ timeout: 10_000, message: `${surface}: ion-router-outlet animations never settled` }
		)
		.toBe(true);
	// webfont swap reflows text, which would poison the clipping measurements
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function collect(page: Page, rootSelector?: string): Promise<LayoutReport> {
	const report = await page.evaluate(
		({ interactive, rootSelector, minTap, minTapPrimary, primaryTargets }) => {
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

			const isDisabled = (el: Element): boolean =>
				el.hasAttribute('disabled') ||
				el.getAttribute('aria-disabled') === 'true' ||
				el.classList.contains('button-disabled') ||
				!!el.closest('[disabled]');

			// #region tap targets
			const tap: string[] = [];
			let counted = 0;
			for (const el of Array.from(scope.querySelectorAll(interactive))) {
				const rect = el.getBoundingClientRect();
				if (!isVisible(el, rect) || !onstage(rect)) continue;
				// a disabled control cannot be tapped, so the HIG floor does not apply to it
				if (isDisabled(el)) continue;
				counted++;
				const floor = el.matches(primaryTargets) ? minTapPrimary : minTap;
				if (rect.width < floor || rect.height < floor) {
					tap.push(`${label(el)} -> ${round(rect.width)}x${round(rect.height)} (floor ${floor})`);
				}
			}
			// #endregion

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

			// #region overflow + clipping (single pass)
			const bleeding: Element[] = [];
			const clipped: string[] = [];
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
				if (el.closest('[data-allow-clip]')) continue;
				const cs = getComputedStyle(el);
				if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
					continue;
				}
				if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue;
				if (cs.textOverflow === 'ellipsis') continue;
				if (!hasDirectText(el) || !onlyInlineChildren(el)) continue;
				// an inline box reports no scroll/client metrics at all
				if (el.clientHeight === 0 && el.clientWidth === 0) continue;
				// a deliberately tight line-height (leading-none) is SMALLER than the font's own
				// ascent+descent, so ink exceeds the line box by a couple of px with nothing
				// actually clipped - overflow is visible here, so the glyphs paint fine
				const fontPx = Number.parseFloat(cs.fontSize) || 0;
				const lineHeightPx = Number.parseFloat(cs.lineHeight);
				const tightLeading = Number.isFinite(lineHeightPx) && lineHeightPx < fontPx * 1.2;
				const heightSlack = tightLeading ? Math.max(1, Math.ceil(fontPx * 0.2)) : 1;
				if (el.scrollHeight > el.clientHeight + heightSlack) {
					clipped.push(`${label(el)} -> height ${el.scrollHeight} > ${el.clientHeight}`);
				} else if (el.scrollWidth > el.clientWidth + 1) {
					clipped.push(`${label(el)} -> width ${el.scrollWidth} > ${el.clientWidth}`);
				}
			}
			// report the innermost offender only; every ancestor stretches with it
			const overflow = bleeding
				.filter((el) => !bleeding.some((other) => other !== el && el.contains(other)))
				.map((el) => `${label(el)} -> right edge ${round(el.getBoundingClientRect().right)}`);
			// #endregion

			const se = document.scrollingElement ?? document.documentElement;
			return {
				viewport: { width: vw, height: vh },
				scrollWidth: se.scrollWidth,
				clientWidth: se.clientWidth,
				counted,
				scanned,
				tap,
				overflow,
				clipped
			};
		},
		{
			interactive: INTERACTIVE,
			rootSelector,
			minTap: MIN_TAP,
			minTapPrimary: MIN_TAP_PRIMARY,
			primaryTargets: PRIMARY_TARGETS
		}
	);

	expect(report, `layout audit found no root matching "${rootSelector}"`).not.toBeNull();
	return report as LayoutReport;
}

// the three audits are soft so one surface reports every violation it has in a single run;
// a soft failure still fails the test, it just does not short-circuit the other two audits
function assertTapTargets(surface: string, r: LayoutReport): void {
	expect
		.soft(
			r.tap,
			`${surface}: ${r.tap.length}/${r.counted} visible interactive elements are under their tap floor (${MIN_TAP}px, or ${MIN_TAP_PRIMARY}px for primary nav targets)`
		)
		.toEqual([]);
}

function assertNoOverflow(surface: string, r: LayoutReport): void {
	expect
		.soft(
			r.scrollWidth,
			`${surface}: the document scrolls horizontally (${r.scrollWidth}px of content in a ${r.clientWidth}px viewport)`
		)
		.toBeLessThanOrEqual(r.clientWidth + 1);
	expect
		.soft(
			r.overflow,
			`${surface}: elements bleed past the right edge of the ${r.viewport.width}px viewport`
		)
		.toEqual([]);
}

function assertNoClipping(surface: string, r: LayoutReport): void {
	expect
		.soft(r.clipped, `${surface}: ${r.clipped.length}/${r.scanned} elements clip their own text`)
		.toEqual([]);
}

/** Settle, measure, then run all three audits so one surface reports every violation it has. */
async function auditSurface(page: Page, surface: string): Promise<void> {
	await settle(page, surface);
	const report = await collect(page);
	expect(report.counted, `${surface}: the audit measured no interactive elements`).toBeGreaterThan(
		0
	);
	assertTapTargets(surface, report);
	assertNoOverflow(surface, report);
	assertNoClipping(surface, report);
}

test.describe('Layout quality at phone width (mobile)', () => {
	test.beforeEach(async ({ context }) => {
		test.slow();
		await installNativeMock(context, { platform: 'ios' });
		// a running tour dims the page and would park real content behind an overlay
		await suppressV060Tours(context);
		// index auto-opens the onboarding quest modal on a first-ever launch, which would
		// cover the landing page; runs after native-mock so it merges into its prefs store
		await context.addInitScript(() => {
			const w = window as unknown as { __prefs?: Record<string, string> };
			w.__prefs = { ...(w.__prefs ?? {}), hasOpened: 'true' };
		});
	});

	test('landing page', async ({ page, gotoHydrated, asAnonymous }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asAnonymous();

		await gotoHydrated('/');
		await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible({ timeout: 15000 });

		await auditSurface(page, 'landing (/)');
	});

	test('dashboard', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layoutdash' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: 'Nature Minutes' })).toBeVisible({
			timeout: 15000
		});

		await auditSurface(page, 'dashboard (/tabs/dashboard)');
	});

	test('discover', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layoutdisc' });

		await gotoTab(page, gotoHydrated, '/tabs/discover');
		await expect(page.locator('#discover-search input')).toBeVisible({ timeout: 15000 });
		await expect(page.locator('#discover-results')).toBeVisible({ timeout: 15000 });

		await auditSurface(page, 'discover (/tabs/discover)');
	});

	test('quests list', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layoutquests' });

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await expect(
			page
				.getByText(/daily explorer/i)
				.filter({ visible: true })
				.first()
		).toBeVisible({ timeout: 15000 });

		await auditSurface(page, 'quests list (/tabs/quests)');
	});

	test('quest detail', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layoutquest' });

		// q-1 (Daily Explorer) is in the default seeded catalog
		await gotoQuestDetail(page, gotoHydrated, 'q-1');

		await auditSurface(page, 'quest detail (/tabs/quests/q-1)');
	});

	test('profile', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		const user = await asUser({ username: 'layoutprofile' });

		await gotoTab(page, gotoHydrated, `/tabs/profile/${user.id}`);
		await expect(
			page
				.getByText(new RegExp(user.username as string, 'i'))
				.filter({ visible: true })
				.first()
		).toBeVisible({
			timeout: 15000
		});

		await auditSurface(page, 'profile (/tabs/profile/:id)');
	});

	test('settings index', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layoutsettings' });

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('ion-toggle').first()).toBeVisible({ timeout: 15000 });

		await auditSurface(page, 'settings (/tabs/settings)');
	});

	test('downloads', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layoutdownloads' });

		await gotoTab(page, gotoHydrated, '/tabs/downloads');
		await expect(
			page
				.getByText(/downloads/i)
				.filter({ visible: true })
				.first()
		).toBeVisible({ timeout: 15000 });

		await auditSurface(page, 'downloads (/tabs/downloads)');
	});

	test('trails', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layouttrails' });

		await gotoTab(page, gotoHydrated, '/tabs/trails');
		await expect(page.getByRole('heading', { name: 'Curiosity Trails' })).toBeVisible({
			timeout: 15000
		});

		await auditSurface(page, 'trails (/tabs/trails)');
	});

	test('tab bar', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layouttabbar' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.locator('ion-tab-bar#navbar')).toBeVisible({ timeout: 15000 });

		await settle(page, 'tab bar');
		const report = await collect(page, 'ion-tab-bar#navbar');
		expect(report.counted, 'tab bar: the audit measured no interactive elements').toBeGreaterThan(
			0
		);
		assertTapTargets('tab bar (ion-tab-bar#navbar)', report);
		assertNoOverflow('tab bar (ion-tab-bar#navbar)', report);
	});

	// without this the whole gate could silently degrade to a no-op (all three audits
	// reporting clean because the collector stopped finding anything at all)
	test('the audit catches planted violations', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'layoutselfcheck' });

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('ion-toggle').first()).toBeVisible({ timeout: 15000 });
		await settle(page, 'self-check');

		await page
			.locator('ion-content:visible')
			.first()
			.evaluate((host) => {
				const box = document.createElement('div');
				// pinned into the viewport; appended at the end of a long page it would sit
				// below the fold and the audit would (correctly) never look at it
				box.setAttribute('style', 'position:fixed;top:100px;left:8px;width:200px;z-index:1');
				box.innerHTML =
					'<button id="planted-tiny-tap" style="width:20px;height:20px">x</button>' +
					'<div id="planted-bleed" style="width:2000px;height:10px"></div>' +
					'<div id="planted-clip" style="width:40px;height:8px;font-size:20px;white-space:nowrap">clipped sentence</div>';
				host.appendChild(box);
			});

		const report = await collect(page);
		expect(report.tap.join('\n'), 'the tap-target audit missed a 20x20 button').toContain(
			'button#planted-tiny-tap'
		);
		expect(report.overflow.join('\n'), 'the overflow audit missed a 2000px-wide box').toContain(
			'div#planted-bleed'
		);
		expect(report.clipped.join('\n'), 'the clipping audit missed an 8px-tall text box').toContain(
			'div#planted-clip'
		);
	});
});
