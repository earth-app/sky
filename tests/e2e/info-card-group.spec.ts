import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeUser } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// MInfoCardGroup is a hand-rolled translateX carousel. the dashboard feed decides group-vs-single
// with Math.random(), so it can't be shaped deterministically; instead drive the testBuild
// widget-harness (?group=1), which renders a fixed 3-slide MInfoCardGroup with a tap counter.
// this is the same harness pattern report.spec.ts + widget-interactive.spec.ts already use.
const HARNESS = '/__test__/widget-harness?group=1';

const dot = (page: Page, n: number) => page.locator(`button[aria-label="Go to slide ${n}"]`);
const nextArrow = (page: Page) => page.locator('[aria-label="Next slide"]');
const prevArrow = (page: Page) => page.locator('[aria-label="Previous slide"]');

async function openGroupHarness(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>
): Promise<void> {
	await gotoHydrated(HARNESS);
	await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });
	await expect(page.getByTestId('info-card-group')).toBeVisible({ timeout: 12_000 });
	// dots only render after calculateSlides() measures totalSlides > 1 with a > 0 viewport width,
	// so a visible dot also guarantees slideWidth is set (the drag threshold depends on it)
	await expect(dot(page, 1)).toBeVisible({ timeout: 12_000 });
}

test.describe('MInfoCardGroup carousel', () => {
	test.beforeEach(async ({ context, asUser }) => {
		await installNativeMock(context, { platform: 'ios' });
		await asUser({ username: 'carouseluser' });
	});

	test('the Next arrow advances the active dot', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await expect(dot(page, 1)).toHaveClass(/w-4/);
		await expect(dot(page, 1)).toHaveClass(/bg-primary/);

		await nextArrow(page).click();

		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(dot(page, 2)).toHaveClass(/bg-primary/);
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
	});

	test('the dot buttons jump straight to a specific slide', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await dot(page, 3).click();
		await expect(dot(page, 3)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
	});

	test('the Prev arrow steps back to the previous slide', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await nextArrow(page).click();
		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });

		// a slide change holds a 300ms transition lock that drops a second nav; let it clear
		await page.waitForTimeout(350);
		await prevArrow(page).click();
		await expect(dot(page, 1)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(dot(page, 2)).not.toHaveClass(/w-4/);
	});

	// THE REGRESSION: on a non-first slide, tapping an interactive child used to fire the track's
	// mousedown/mouseup drag handlers (the child only @click.stop) and snap back to slide 1. it now
	// must be a no-op for the carousel while the child's own click still runs.
	test('tapping a button inside the active card does not snap back to the first slide', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await nextArrow(page).click();
		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });

		const secondCard = page.getByTestId('info-card-slide').nth(1);
		const tapCount = page.getByTestId('tap-count');
		await expect(tapCount).toHaveText('0');

		// the visible (second) card's own action button; a tap here bubbles mousedown/mouseup to
		// the track, which is exactly the drag path the fix has to neutralize
		await secondCard.locator('ion-button').first().click();

		// the child's click fired ...
		await expect(tapCount).toHaveText('1', { timeout: 8000 });
		// ... and the carousel stayed on slide 2 (pre-fix this snapped back to slide 1)
		await expect(dot(page, 2)).toHaveClass(/w-4/);
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
		await expect(secondCard).toBeVisible();
	});

	test('a plain tap on a non-first card (no drag) never changes the slide', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await nextArrow(page).click();
		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });

		// click the card body away from its button (header region); no cursor movement => a tap
		const secondCard = page.getByTestId('info-card-slide').nth(1);
		await secondCard.click({ position: { x: 15, y: 12 } });

		await expect(dot(page, 2)).toHaveClass(/w-4/);
		await expect(dot(page, 1)).not.toHaveClass(/w-4/);
		// the card body has no link, so the tap must not have hit its action button either
		await expect(page.getByTestId('tap-count')).toHaveText('0');
	});

	test('a real horizontal drag past the threshold pages forward', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		await expect(dot(page, 1)).toHaveClass(/w-4/);

		const track = page.getByTestId('info-card-track');
		const box = await track.boundingBox();
		if (!box) throw new Error('carousel track has no bounding box');

		const y = box.y + box.height / 2;
		// drag left ~70% of the track width; the paging threshold is a quarter-slide (~box.width/4)
		await page.mouse.move(box.x + box.width * 0.8, y);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.1, y, { steps: 12 });
		await page.mouse.up();

		await expect(dot(page, 2)).toHaveClass(/w-4/, { timeout: 8000 });
		// a drag produces no click, so the card's action button must not have fired
		await expect(page.getByTestId('tap-count')).toHaveText('0');
	});

	test('arrows disable at both ends (no wrap without loop)', async ({ page, gotoHydrated }) => {
		skipIfIntegration('testBuild harness renders the deterministic group');
		await openGroupHarness(page, gotoHydrated);

		// first slide: Prev disabled (the aria-label resolves to ionic's inner native button, which
		// carries the `disabled` attribute; the button-disabled class sits on the ion-button host)
		await expect(dot(page, 1)).toHaveClass(/w-4/);
		await expect(prevArrow(page)).toBeDisabled();

		// jump to the last slide: Next disabled
		await dot(page, 3).click();
		await expect(dot(page, 3)).toHaveClass(/w-4/, { timeout: 8000 });
		await expect(nextArrow(page)).toBeDisabled();
	});
});

/**
 * Geometry, not pixels: a slide is sized to the carousel's clip window, so anything a slotted
 * card adds around that box (a margin, a wider min-width) pushes its own right edge out of view
 * and desyncs the translateX stride from `--slide-width`.
 *
 * The friends carousel on a profile is the deterministic surface for it: its slides are
 * MSurface cards, which is where a stray `.m-card` margin showed up first.
 */
const FRIENDS_PATH = /^\/v2\/users\/[^/]+\/friends\/?$/;

test.describe('MInfoCardGroup slide geometry', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('every slide of a user carousel fits inside the clip window', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('seeds a deterministic friends list via a mock override');
		const me = await asUser({ username: 'slidegeo' });
		// no real full names: `handle` then falls back to @username, which is the duplicate-row case
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: FRIENDS_PATH,
			body: {
				items: [
					makeUser({ id: 'friend-a', username: 'ikari', full_name: '' }),
					makeUser({ id: 'friend-b', username: 'asuka', full_name: 'John Doe' }),
					makeUser({ id: 'friend-c', username: 'rei', full_name: 'Rei Ayanami' })
				],
				total: 3
			},
			once: false
		});

		await gotoHydrated(`/tabs/profile/${me.id}`);
		const group = page.locator('#user-friends [data-testid="info-card-group"]');
		await expect(group).toBeVisible({ timeout: 15_000 });

		const overflow = await group.evaluate((root) => {
			const track = root.querySelector('[data-testid="info-card-track"]')!;
			const window = track.parentElement!;
			const clip = window.getBoundingClientRect();
			const slides = Array.from(track.children);
			const bad: string[] = [];
			let stride = 0;
			for (const [i, slide] of slides.entries()) {
				const rect = slide.getBoundingClientRect();
				const cs = getComputedStyle(slide);
				const outer = rect.width + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight);
				if (outer > clip.width + 1) {
					bad.push(
						`slide ${i}: outer width ${Math.round(outer)} > window ${Math.round(clip.width)}`
					);
				}
				if (i === 0 && (rect.left < clip.left - 1 || rect.right > clip.right + 1)) {
					bad.push(
						`slide 0: ${Math.round(rect.left)}..${Math.round(rect.right)} outside window ` +
							`${Math.round(clip.left)}..${Math.round(clip.right)}`
					);
				}
				if (i === 1) {
					stride = (slide as HTMLElement).offsetLeft - (slides[0] as HTMLElement).offsetLeft;
				}
			}
			return { bad, stride, windowWidth: Math.round(clip.width), slides: slides.length };
		});

		expect(overflow.slides).toBe(3);
		expect(overflow.bad, 'a slide reaches past the edge of the carousel clip window').toEqual([]);
		// the paging transform moves by one clip window, so the real stride has to match it
		expect(Math.abs(overflow.stride - overflow.windowWidth)).toBeLessThanOrEqual(1);
	});

	// THE REGRESSION: `handle` falls back to @username, so a user with no real full name rendered
	// "@ikari @ikari" - the display name and the handle, both resolving to the same string
	test('a user row prints the handle once when there is no real full name', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('seeds a deterministic friends list via a mock override');
		const me = await asUser({ username: 'handledupe' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: FRIENDS_PATH,
			body: {
				items: [
					makeUser({ id: 'friend-a', username: 'ikari', full_name: '' }),
					makeUser({ id: 'friend-b', username: 'asuka', full_name: 'John Doe' })
				],
				total: 2
			},
			once: false
		});

		await gotoHydrated(`/tabs/profile/${me.id}`);
		const group = page.locator('#user-friends [data-testid="info-card-group"]');
		await expect(group).toBeVisible({ timeout: 15_000 });

		const rows = await group.evaluate((root) =>
			Array.from(root.querySelectorAll('[data-testid="info-card-track"] > *')).map((slide) =>
				(slide.textContent ?? '').replace(/\s+/g, ' ').trim()
			)
		);

		expect(rows).toHaveLength(2);
		// each row names its user exactly once; the placeholder full name never prints either
		expect(rows[0]!.match(/@ikari/g) ?? []).toHaveLength(1);
		expect(rows[1]!.match(/@asuka/g) ?? []).toHaveLength(1);
		expect(rows.join(' ')).not.toContain('John Doe');
	});

	// THE REGRESSION: the loading state used crust's InfoCardSkeleton, whose 400px min-width is wider
	// than a phone-width slide, so the placeholder cards were cut off on the right while they showed
	test('the related-content loading slides fit inside the clip window', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('holds the similar-events fetch open to keep the loading slides on screen');
		await asUser({ username: 'skelgeo' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/events\/random$/,
			body: { page: 1, limit: 15, total: 0, items: [] },
			delayMs: 20_000,
			once: false
		});

		await gotoHydrated('/tabs/events/evt-1');
		const group = page.getByTestId('info-card-group').filter({ hasText: 'Related Events' });
		await expect(group).toBeVisible({ timeout: 15_000 });

		const bad = await group.evaluate((root) => {
			const track = root.querySelector('[data-testid="info-card-track"]')!;
			const clip = track.parentElement!.getBoundingClientRect();
			return Array.from(track.children)
				.map((slide) => ({ slide, rect: slide.getBoundingClientRect() }))
				.filter(({ rect }) => rect.width > clip.width + 1)
				.map(
					({ rect }) => `slide width ${Math.round(rect.width)} > window ${Math.round(clip.width)}`
				);
		});

		expect(bad, 'a loading slide is wider than the carousel clip window').toEqual([]);
	});
});

test.describe('Dashboard feed carousel renders every slide', () => {
	test.beforeEach(async ({ context, page, asUser }) => {
		await installNativeMock(context, { platform: 'ios' });
		await page.addInitScript(() => {
			Math.random = () => 0.45;
		});
		await asUser({ username: 'feeduser' });
	});

	test('no feed-group slide renders blank, including off-screen carousel slides', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('forces a deterministic mock feed group via Math.random');
		await gotoHydrated('/tabs/dashboard');
		await expect(page.getByRole('heading', { name: /your feed/i })).toBeVisible({
			timeout: 12_000
		});

		await expect
			.poll(
				async () =>
					page.locator('[data-testid="info-card-track"]').evaluateAll((tracks) => {
						if (tracks.length === 0) return 'no-tracks';
						let maxSlides = 0;
						for (const track of tracks) {
							const slides = Array.from(track.children);
							maxSlides = Math.max(maxSlides, slides.length);
							const allFilled = slides.every(
								(s) => (s.textContent || '').replace(/\s+/g, '').length > 10
							);
							if (!allFilled) return 'blank';
						}
						// >=3 slides guarantees at least one slide is off-screen (the regression surface)
						return maxSlides >= 3 ? 'ok' : 'too-small';
					}),
				{ timeout: 20_000 }
			)
			.toBe('ok');
	});

	// THE REGRESSION: the feed grouped a single item into a carousel, so one card arrived wrapped in
	// a titled frame with a 2-dot indicator around it. below two items it has to render bare
	test('no feed group renders with a single slide', async ({ page, gotoHydrated }) => {
		skipIfIntegration('forces a deterministic mock feed group via Math.random');
		await gotoHydrated('/tabs/dashboard');
		await expect(page.getByRole('heading', { name: /your feed/i })).toBeVisible({
			timeout: 12_000
		});

		await expect(page.locator('[data-testid="info-card-track"]').first()).toBeVisible({
			timeout: 20_000
		});
		const undersized = await page.locator('[data-testid="info-card-track"]').evaluateAll((tracks) =>
			tracks
				.map((track, i) => ({ i, slides: track.children.length }))
				.filter((t) => t.slides < 2)
				.map((t) => `track ${t.i} has ${t.slides} slide(s)`)
		);
		expect(undersized, 'a feed carousel rendered with fewer than 2 slides').toEqual([]);
	});
});

test.describe('Dashboard feed with only one user to show', () => {
	test.beforeEach(async ({ context, page, asUser, mockApi }) => {
		await installNativeMock(context, { platform: 'ios' });
		// 0.85 makes the first content-type roll land on `user` (the last of the five candidates)
		await page.addInitScript(() => {
			Math.random = () => 0.85;
		});
		await asUser({ username: 'solouser' });
		// both halves of the user fetch return the same person, so dedupe leaves exactly one
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users$/,
			body: {
				page: 1,
				limit: 25,
				total: 1,
				items: [makeUser({ id: 'solo-1', username: 'ikari', full_name: '' })]
			},
			once: false
		});
	});

	// THE REGRESSION: users were always grouped, so a one-person result rendered a "Discover Users"
	// carousel with a single slide, dots and all
	test('renders the single user bare, with no carousel around it', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('forces a one-user feed item via Math.random + a mock override');
		await gotoHydrated('/tabs/dashboard');

		const row = page.locator('ion-content:visible').getByText('@ikari').first();
		await expect(row).toBeVisible({ timeout: 20_000 });

		const framing = await row.evaluate((el) => ({
			inGroup: Boolean(el.closest('[data-testid="info-card-group"]')),
			// the row prints its handle once; @ikari is both the username and the display name here
			handles: (el.closest('.m-card')?.textContent ?? '').match(/@ikari/g)?.length ?? 0
		}));

		expect(framing.inGroup, 'a single user was wrapped in a carousel group').toBe(false);
		expect(framing.handles).toBe(1);
		await expect(page.getByRole('heading', { name: 'Discover Users' })).toHaveCount(0);
	});
});
