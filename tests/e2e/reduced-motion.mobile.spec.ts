import type { Page } from '@playwright/test';
import {
	clearAnimateRecords,
	collectRunningAnimations,
	describeAnimation,
	holdContentListings,
	installAnimateRecorder,
	isEndless,
	readAnimateRecords,
	settleAnimations,
	summarize,
	type AnimationRecord
} from './utils/a11y-helpers';
import { suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

/**
 * Reduced-motion gate. The whole file runs with the OS-level
 * `prefers-reduced-motion: reduce` signal forced on, and asks three questions:
 *
 *   1. is anything still moving past the WCAG 2.2 SC 2.2.2 five-second ceiling
 *   2. are route transitions actually instant
 *   3. did removing the motion also remove the information it carried
 *
 * Nothing here is a screenshot comparison; every number is measured live.
 */

// WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide) - Level A
const MAX_ANIMATION_MS = 5_000;

// reduced motion means no perceptible slide; this leaves room for Ionic's internal
// zero-ish easings without letting a real transition through
const MAX_TRANSITION_MS = 100;

async function census(page: Page, surface: string): Promise<AnimationRecord[]> {
	await settleAnimations(page, surface);
	return await collectRunningAnimations(page);
}

function assertNothingRunsForever(surface: string, records: AnimationRecord[]): void {
	const endless = records.filter(isEndless).map(describeAnimation);
	const tooLong = records
		.filter((r) => !isEndless(r) && r.activeMs > MAX_ANIMATION_MS)
		.map(describeAnimation);

	expect
		.soft(
			endless,
			`${surface}: ${endless.length} animation(s) still loop forever under prefers-reduced-motion (SC 2.2.2 needs a pause/stop/hide mechanism, or the animation removed):\n${summarize(endless)}`
		)
		.toEqual([]);
	expect
		.soft(
			tooLong,
			`${surface}: ${tooLong.length} animation(s) run longer than ${MAX_ANIMATION_MS}ms under prefers-reduced-motion:\n${summarize(tooLong)}`
		)
		.toEqual([]);
}

test.describe('Reduced motion (mobile)', () => {
	// this playwright version keeps the media-emulation flags inside contextOptions
	// rather than exposing `reducedMotion` as a top-level test option
	test.use({ contextOptions: { reducedMotion: 'reduce' } });

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

	test('the media query actually reaches the app', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'rmquery' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const matches = await page.evaluate(
			() => window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
		expect(matches, 'the reduced-motion context option did not reach the page').toBe(true);
	});

	test('nothing animates past the 5s ceiling on the tab surfaces', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'rmceiling' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: 'Nature Minutes' })).toBeVisible({
			timeout: 15000
		});
		assertNothingRunsForever('dashboard (/tabs/dashboard)', await census(page, 'dashboard'));

		await gotoTab(page, gotoHydrated, '/tabs/discover');
		await expect(page.locator('#discover-results')).toBeVisible({ timeout: 15000 });
		assertNothingRunsForever('discover (/tabs/discover)', await census(page, 'discover'));

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await expect(
			page
				.getByText(/daily explorer/i)
				.filter({ visible: true })
				.first()
		).toBeVisible({ timeout: 15000 });
		assertNothingRunsForever('quests (/tabs/quests)', await census(page, 'quests'));
	});

	test('nothing animates past the 5s ceiling on the empty-state surface', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'rmempty' });

		await gotoTab(page, gotoHydrated, '/tabs/downloads');
		await expect(page.getByText(/no downloads yet/i)).toBeVisible({ timeout: 15000 });
		assertNothingRunsForever('downloads (/tabs/downloads)', await census(page, 'downloads'));
	});

	test('route transitions are instant', async ({ page, context, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await installAnimateRecorder(context);
		await asUser({ username: 'rmtransition' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: 'Nature Minutes' })).toBeVisible({
			timeout: 15000
		});

		const hops: { from: string; to: string; calls: string[]; maxMs: number; pages: number }[] = [];
		for (const [from, to] of [
			['/tabs/dashboard', '/tabs/quests'],
			['/tabs/quests', '/tabs/quests/q-1']
		] as const) {
			await clearAnimateRecords(page);
			await page.evaluate((path) => {
				const router = (window as unknown as { useNuxtApp?: () => any }).useNuxtApp?.().$router;
				router?.push(path);
			}, to);
			await page.waitForURL((url) => url.pathname === to, { timeout: 15000 });
			await settleAnimations(page, `${from} -> ${to}`);

			// the entering/leaving `div.ion-page` pair IS the route transition; anything else
			// in the outlet (ripples, content scroll) is a different concern
			const pageCalls = (await readAnimateRecords(page)).filter((c) => c.isPage);
			hops.push({
				from,
				to,
				calls: pageCalls.map((c) => `${c.label}${c.id ? ` [${c.id}]` : ''} -> ${c.durationMs}ms`),
				maxMs: pageCalls.reduce((max, c) => Math.max(max, c.durationMs), 0),
				pages: await page.locator('div.ion-page').count()
			});
		}

		for (const hop of hops) {
			// zero recorded calls is the intended outcome, not a vacuous pass: the reduced path in
			// slide.ts returns a keyframe-less animation, and Ionic skips animate() without keyframes
			expect
				.soft(
					hop.maxMs,
					`${hop.from} -> ${hop.to}: the route transition still animates for ${hop.maxMs}ms under prefers-reduced-motion. src/animations/slide.ts has to short-circuit on the prefers-reduced-motion query as well as the "animations-disabled" class, because Ionic's createAnimation uses the Web Animations API, which the CSS killswitch in main.css cannot reach.\n${summarize(hop.calls)}`
				)
				.toBeLessThanOrEqual(MAX_TRANSITION_MS);
			expect
				.soft(
					hop.pages,
					`${hop.from} -> ${hop.to}: the hop landed on the URL but mounted no div.ion-page, so there was never a page for the transition to animate`
				)
				.toBeGreaterThan(0);
		}

		// the recorder has to be proven live independently, or a broken hook would read exactly
		// like a suppressed transition. plant a real animate() call on an .ion-page and demand it back
		await clearAnimateRecords(page);
		await page.evaluate(() => {
			const el = document.createElement('div');
			el.className = 'ion-page';
			el.id = 'planted-page';
			el.setAttribute('style', 'position:fixed;top:160px;left:8px;width:20px;height:20px');
			document.body.appendChild(el);
			el.animate([{ opacity: '1' }, { opacity: '0.4' }], { duration: 777, id: 'planted-hop' });
			el.remove();
		});
		const probe = (await readAnimateRecords(page)).filter((c) => c.isPage);
		expect(
			probe.map((c) => `${c.label} [${c.id}] -> ${c.durationMs}ms`).join('\n'),
			'the animate() recorder never captured a planted ion-page animation, so the zero-animation hops above prove nothing'
		).toContain('div#planted-page.ion-page [planted-hop] -> 777ms');
	});

	test('the progress ring still reports its value without motion', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'rmring' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const ring = page.locator('#nature-ring svg[role="img"]');
		await expect(ring).toBeVisible({ timeout: 15000 });
		await settleAnimations(page, 'nature ring');

		// the accessible name carries the number the animated sweep encodes
		await expect(ring).toHaveAttribute('aria-label', /\d+ of \d+ Nature Minutes this week/);

		const geometry = await page.locator('#nature-ring').evaluate((host) => {
			const arc = Array.from(host.querySelectorAll('circle')).find((c) =>
				c.hasAttribute('stroke-dashoffset')
			);
			const counter = host.querySelector('.tabular-nums');
			return {
				dashArray: arc?.getAttribute('stroke-dasharray') ?? null,
				dashOffset: arc?.getAttribute('stroke-dashoffset') ?? null,
				counterText: (counter?.textContent ?? '').trim(),
				arcBox: arc ? (arc as SVGGraphicsElement).getBoundingClientRect().height : 0
			};
		});

		expect(Number(geometry.dashArray), 'the ring lost its stroke-dasharray').toBeGreaterThan(0);
		expect(
			Number.isFinite(Number(geometry.dashOffset)),
			`the ring's stroke-dashoffset is not a number: ${geometry.dashOffset}`
		).toBe(true);
		expect(geometry.arcBox, 'the ring arc collapsed to zero height').toBeGreaterThan(0);
		expect(
			geometry.counterText,
			'the count-up value rendered empty, so the number only ever existed as motion'
		).toMatch(/\d/);
	});

	test('skeleton loaders still mark the loading region without a shimmer', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'rmskeleton' });
		// hold the feed so the loading state stays on screen long enough to audit
		await holdContentListings(page);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const skeletons = page.locator('.m-skeleton');
		await expect(skeletons.first()).toBeVisible({ timeout: 15000 });

		const boxes = await page.locator('.m-skeleton').evaluateAll((els) =>
			els.map((el) => {
				const rect = el.getBoundingClientRect();
				const cs = getComputedStyle(el);
				return {
					width: Math.round(rect.width),
					height: Math.round(rect.height),
					background: cs.backgroundColor,
					hidden: el.getAttribute('aria-hidden')
				};
			})
		);

		expect(
			boxes.length,
			'no skeleton rendered, so the loading state was never measured'
		).toBeGreaterThan(0);
		const collapsed = boxes.filter((b) => b.width <= 0 || b.height <= 0);
		expect(
			collapsed,
			`${collapsed.length}/${boxes.length} skeletons collapsed to zero area without their shimmer`
		).toEqual([]);
		const invisible = boxes.filter(
			(b) => b.background === 'rgba(0, 0, 0, 0)' || b.background === 'transparent'
		);
		expect(
			invisible,
			`${invisible.length}/${boxes.length} skeletons have a transparent background, so with the shimmer suppressed nothing marks the loading region`
		).toEqual([]);
		// decorative by design: the region is conveyed by the box, not announced twice
		expect(
			boxes.every((b) => b.hidden === 'true'),
			'skeletons should stay aria-hidden'
		).toBe(true);
	});

	test('the empty state still shows its title, description and CTA', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'rmemptyinfo' });

		await gotoTab(page, gotoHydrated, '/tabs/downloads');
		const empty = page.locator('[role="status"]', { hasText: /no downloads yet/i }).first();
		await expect(empty).toBeVisible({ timeout: 15000 });
		await settleAnimations(page, 'downloads empty state');

		await expect(empty.getByRole('heading', { name: /no downloads yet/i })).toBeVisible();
		await expect(empty.getByText(/stay readable without internet/i)).toBeVisible();
		await expect(empty.getByRole('button', { name: /browse articles/i })).toBeVisible();

		// the bouncing illustration must still occupy its slot, not vanish with the bounce
		const illustration = await empty.evaluate((host) => {
			const el = host.querySelector('.animate-bounce-slow');
			if (!el) return null;
			const rect = el.getBoundingClientRect();
			return { width: Math.round(rect.width), height: Math.round(rect.height) };
		});
		expect(illustration, 'the empty-state illustration disappeared entirely').not.toBeNull();
		expect(illustration!.width, 'the empty-state illustration collapsed').toBeGreaterThan(0);
		expect(illustration!.height, 'the empty-state illustration collapsed').toBeGreaterThan(0);
	});

	// without this the whole gate could silently degrade to a no-op (the census reporting
	// clean because getAnimations() stopped surfacing anything at all)
	test('the animation census catches planted offenders', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'rmselfcheck' });

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('ion-toggle').first()).toBeVisible({ timeout: 15000 });
		await settleAnimations(page, 'self-check');

		// planted through the Web Animations API on purpose: a CSS animation would be
		// crushed to 0.001ms by the reduced-motion killswitch in main.css
		await page.evaluate(() => {
			const host = document.createElement('div');
			host.setAttribute('style', 'position:fixed;top:120px;left:8px;width:40px;height:40px');
			host.innerHTML =
				'<div id="planted-long" style="width:20px;height:20px"></div>' +
				'<div id="planted-endless" style="width:20px;height:20px"></div>';
			document.body.appendChild(host);
			document
				.getElementById('planted-long')!
				.animate([{ opacity: '1' }, { opacity: '0.4' }], { duration: 30_000, iterations: 1 });
			document
				.getElementById('planted-endless')!
				.animate([{ opacity: '1' }, { opacity: '0.4' }], { duration: 800, iterations: Infinity });
		});

		const records = await collectRunningAnimations(page);
		const rendered = records.map(describeAnimation).join('\n');
		expect(rendered, 'the census missed a 30s finite animation').toContain('div#planted-long');
		expect(rendered, 'the census missed an infinite animation').toContain('div#planted-endless');

		const endless = records.filter(isEndless).map((r) => r.label);
		expect(endless.join('\n'), 'isEndless() did not flag the infinite animation').toContain(
			'div#planted-endless'
		);
		const tooLong = records.filter((r) => !isEndless(r) && r.activeMs > MAX_ANIMATION_MS);
		expect(
			tooLong.map((r) => r.label).join('\n'),
			'the 5s ceiling did not flag a 30s animation'
		).toContain('div#planted-long');
	});
});
