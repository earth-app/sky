import type { Page, Route } from '@playwright/test';
import { expect, integrationMode, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { MANTLE_PORT } from './utils/mock-server';
import { installNativeMock } from './utils/native-mock';

/**
 * GET /v2/users/{id}/profile_photo is the request most likely to lose a cold-launch race on a
 * phone, and the avatar store used to record any failure as permanent - so one blip pinned the
 * header to the static earth placeholder for the whole session and told the onboarding checklist
 * the user had no photo. These drive the real header avatar through the failure shapes the
 * endpoint actually produces.
 *
 * The blob fetch and the <img> load are separate transports on device (the fetch goes through
 * Capacitor's proxy, the image through the webview's own loader), so the route handler fails
 * only the fetch and always serves bytes to the image - the same asymmetry the recovery relies on.
 */

// 8x8, not 1x1: WebKit refuses to decode a 1x1 png served over a blob url, which makes
// naturalWidth 0 for a photo that loaded perfectly well
const PNG_8X8 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEUlEQVR4nGNgaHD4jxePDAUAS79vwTwEAxsAAAAASUVORK5CYII=',
	'base64'
);

const PHOTO_ROUTE = /\/profile_photo(\?|$)/;
const FALLBACK_SRC = /\/(favicon|earth-app)\.png/;

const headerAvatar = (page: Page) => page.locator('a[aria-label="Open Your Profile"] img').first();

function photoUser(testId: string) {
	const id = `pp-${testId.slice(0, 8)}`;
	return {
		id,
		username: `photo-${testId.slice(0, 6)}`,
		full_name: 'Pho To',
		account: { avatar_url: `http://127.0.0.1:${MANTLE_PORT}/v2/users/${id}/profile_photo` }
	};
}

/** Fail the first `failFetches` blob fetches; always serve real bytes to an <img> load. */
async function servePhoto(page: Page, failFetches = 0, status = 503) {
	const counts = { fetches: 0, images: 0 };

	await page.route(PHOTO_ROUTE, async (route: Route) => {
		const isImage = route.request().resourceType() === 'image';
		if (isImage) {
			counts.images++;
			return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_8X8 });
		}

		counts.fetches++;
		if (counts.fetches <= failFetches) {
			return route.fulfill({ status, contentType: 'text/plain', body: 'upstream error' });
		}
		return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_8X8 });
	});

	return counts;
}

/**
 * Sample the src across a window rather than waiting for one good reading. The regression this
 * guards flipped to the placeholder only AFTER the fetch round settled, so a single early
 * assertion caught the remote url still on its way and passed against the broken store.
 */
async function expectRealPhoto(page: Page) {
	const img = headerAvatar(page);
	await expect(img).toBeVisible({ timeout: 12_000 });

	for (let sample = 0; sample < 8; sample++) {
		await page.waitForTimeout(250);
		const src = await img.getAttribute('src');
		expect(src, `src at sample ${sample}`).not.toMatch(FALLBACK_SRC);
	}

	await expect
		.poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 12_000 })
		.toBeGreaterThan(0);
}

test.describe('Profile photo resilience', () => {
	test.beforeEach(async ({ context }) => {
		skipIfIntegration('drives injected profile_photo failures');
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a healthy endpoint renders the photo, never the placeholder', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		const counts = await servePhoto(page);
		await asUser(photoUser(testId));

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expectRealPhoto(page);

		// three sizes, one request each - a dashboard full of cards must not multiply that
		expect(counts.fetches).toBeLessThanOrEqual(3);
	});

	test('a blip on every size recovers without a reload', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		// one failure per size; the store retries each once
		await servePhoto(page, 3);
		await asUser(photoUser(testId));

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expectRealPhoto(page);
		await expect(headerAvatar(page)).toHaveAttribute('src', /^blob:/, { timeout: 12_000 });
	});

	test('a failure that outlasts the retries still shows the photo via the remote url', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		// every attempt on every size fails; the placeholder must NOT take over
		await servePhoto(page, 99);
		await asUser(photoUser(testId));

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expectRealPhoto(page);
		await expect(headerAvatar(page)).toHaveAttribute('src', /\/profile_photo/, { timeout: 12_000 });
	});

	for (const status of [500, 502, 408, 429]) {
		test(`a ${status} never degrades to the placeholder`, async ({
			page,
			asUser,
			testId,
			gotoHydrated
		}) => {
			await servePhoto(page, 99, status);
			await asUser(photoUser(testId));

			await gotoTab(page, gotoHydrated, '/tabs/dashboard');
			await expectRealPhoto(page);
		});
	}

	// safeUrl() runs inside a computed and kicks off its own fetch, so a failure that keeps
	// re-rendering the header can drive an unbounded fetch/render loop against the endpoint
	test('a persistently failing endpoint is not hammered', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		const counts = await servePhoto(page, 99);
		await asUser(photoUser(testId));

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(headerAvatar(page)).toBeVisible({ timeout: 12_000 });
		await page.waitForTimeout(4_000);

		// three sizes, two attempts each, and then the retry window holds it off
		expect(counts.fetches).toBeLessThanOrEqual(6);
	});

	test('a 404 is the one failure that does fall back', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		// mantle2 answers 404 for a user who never generated a photo; that must stay the
		// "no custom avatar" signal the onboarding checklist reads
		await page.route(PHOTO_ROUTE, (route) =>
			route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":404}' })
		);
		await asUser(photoUser(testId));

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(headerAvatar(page)).toHaveAttribute('src', FALLBACK_SRC, { timeout: 12_000 });
	});

	test('a size that 500s does not blank the sizes that loaded', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		await page.route(PHOTO_ROUTE, async (route) => {
			const failing =
				route.request().resourceType() !== 'image' && route.request().url().includes('size=32');
			if (failing) return route.fulfill({ status: 500, body: 'error' });
			return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_8X8 });
		});
		await asUser(photoUser(testId));

		// the header asks for avatar128, which loaded fine
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expectRealPhoto(page);
	});

	test('the photo survives leaving the tab and coming back', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		await servePhoto(page, 3);
		await asUser(photoUser(testId));

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expectRealPhoto(page);

		await gotoTab(page, gotoHydrated, '/tabs/discover');
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expectRealPhoto(page);
	});
});

// runs only against real mantle2 + cloud; proves the endpoint itself is consistent and that
// nothing in the shipped client turns a live photo into the placeholder
test.describe('Profile photo against the real backend', () => {
	test.skip(!integrationMode, 'integration lane only');

	test('the header avatar loads bytes from the live endpoint', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		await asUser();

		const responses: number[] = [];
		page.on('response', (res) => {
			if (PHOTO_ROUTE.test(res.url())) responses.push(res.status());
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(headerAvatar(page)).toBeVisible({ timeout: 12_000 });

		// whatever the account has, the endpoint must answer decisively - never a 5xx
		await expect.poll(() => responses.length, { timeout: 15_000 }).toBeGreaterThan(0);
		expect(responses.filter((s) => s >= 500)).toEqual([]);

		const src = await headerAvatar(page).getAttribute('src');
		if (!FALLBACK_SRC.test(src ?? '')) {
			await expect
				.poll(async () => headerAvatar(page).evaluate((el: HTMLImageElement) => el.naturalWidth), {
					timeout: 12_000
				})
				.toBeGreaterThan(0);
		}
	});
});
