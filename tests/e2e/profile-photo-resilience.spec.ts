import type { Page } from '@playwright/test';
import {
	avatarStates,
	expectNoPlaceholderWobble,
	FALLBACK_SRC,
	PHOTO_ROUTE,
	PNG_8X8,
	readAvatarTrace,
	servePhoto,
	servePhotoMissing,
	traceAvatars
} from './utils/avatar-trace';
import { expect, integrationMode, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { MANTLE_PORT } from './utils/mock-server';
import { installNativeMock } from './utils/native-mock';

/**
 * GET /v2/users/{id}/profile_photo is the request most likely to lose a cold-launch race on a
 * phone, and the avatar store used to treat any failure as permanent - one blip pinned the header
 * to the static placeholder for the whole session. It also cleared its failure flags on entry, so
 * the mount handlers that call fetchAvatarBlobs directly republished "we don't know yet" over a
 * verdict already reached, and the avatar swung between the placeholder and an untested photo url
 * that renders as an empty circle.
 *
 * These record the whole src sequence across tab navigation rather than sampling one moment,
 * because a flicker is a transition and no single assertion can see it.
 *
 * The blob fetch and the <img> load are separate transports on device (the fetch goes through
 * Capacitor's proxy, the image through the webview's own loader), so the handlers fail only the
 * fetch and always serve bytes to the image - the asymmetry the fall-through relies on.
 */

const AVATAR_CONTAINER = 'a[aria-label="Open Your Profile"]';

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

// the dashboard's leaderboard widget calls fetchAvatarBlobs for every row, bypassing safeUrl's
// retry gate, so the signed-in user has to be ON the board for their own url to get re-probed.
// intercepted at the page rather than on the shared mock server, whose overrides reset globally
// between tests and so cannot survive a parallel run
async function seedLeaderboardWith(page: Page, userId: string) {
	await page.route(/\/api\/user\/leaderboard/, (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([
				{ id: userId, streak: 1500 },
				{ id: 'author-1', streak: 1200 },
				{ id: 'host-1', streak: 900 }
			])
		})
	);
}

async function settle(page: Page) {
	await expect(headerAvatar(page)).toBeVisible({ timeout: 12_000 });
	await page.waitForTimeout(2_000);
}

// a reload rebuilds the store, so a settled verdict would never meet the mount handlers that
// re-probe it. an in-SPA route change keeps the pinia store warm, which is where the flicker lives
async function spaGoto(page: Page, path: string) {
	await page.evaluate((p) => (window as any).useNuxtApp?.().$router?.push(p), path);
	await expect(page).toHaveURL(new RegExp(path.replace(/[@/]/g, '.')), { timeout: 12_000 });
	// only the dashboard carries the header avatar, so wait on the route settling rather than on it
	await page.waitForTimeout(2_000);
}

async function expectRealPhoto(page: Page) {
	const img = headerAvatar(page);
	await expect(img).toBeVisible({ timeout: 12_000 });
	await expect(img).not.toHaveAttribute('src', FALLBACK_SRC, { timeout: 12_000 });
	await expect
		.poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 12_000 })
		.toBeGreaterThan(0);
}

test.describe('Profile photo resilience', () => {
	test.beforeEach(async ({ context, page }) => {
		skipIfIntegration('drives injected profile_photo failures');
		await installNativeMock(context, { platform: 'ios' });
		await traceAvatars(page, AVATAR_CONTAINER);
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

		expectNoPlaceholderWobble(await readAvatarTrace(page));

		// three sizes per page load, and gotoHydrated warms at '/' before pushing to the tab -
		// so two loads is normal and anything beyond that is the store multiplying by card count
		expect(counts.fetches).toBeLessThanOrEqual(6);
		const settled = counts.fetches;
		await page.waitForTimeout(3_000);
		expect(counts.fetches, 'the endpoint was re-probed after settling').toBe(settled);
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
		expectNoPlaceholderWobble(await readAvatarTrace(page));
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
			await settle(page);

			await expect(headerAvatar(page)).not.toHaveAttribute('src', FALLBACK_SRC);
			expectNoPlaceholderWobble(await readAvatarTrace(page));
		});
	}

	test('a user with no photo settles on the placeholder and stays there', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		const counts = await servePhotoMissing(page);
		const user = photoUser(testId);
		await seedLeaderboardWith(page, user.id);
		await asUser(user);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await settle(page);

		// the verdict is reached once per page load: three sizes, no retry on a 4xx. gotoHydrated
		// warms at '/' before pushing to the tab, so two loads is normal. what must NOT happen is
		// any further probe once the answer is in
		const afterFirstLoad = counts.fetches;
		expect(afterFirstLoad).toBeLessThanOrEqual(6);
		await page.waitForTimeout(4_000);
		expect(counts.fetches, 'the endpoint was re-probed after settling').toBe(afterFirstLoad);

		// sky gates first paint on auth, so the header avatar mounts AFTER the store has answered
		// and cannot show the wobble crust does. the journey still guards the invariant for any
		// future surface that calls fetchAvatarBlobs directly the way MMiniLeaderboard does
		await spaGoto(page, `/tabs/profile/@${user.username}`);
		await spaGoto(page, '/tabs/dashboard');
		await settle(page);

		const trace = await readAvatarTrace(page);
		expect(trace.length, 'no avatar src was recorded').toBeGreaterThan(0);
		expectNoPlaceholderWobble(trace);
		await expect(headerAvatar(page)).toHaveAttribute('src', FALLBACK_SRC);
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

	test('each avatar element takes at most a couple of srcs across a tab journey', async ({
		page,
		asUser,
		testId,
		gotoHydrated
	}) => {
		await servePhoto(page, 3);
		const user = photoUser(testId);
		await seedLeaderboardWith(page, user.id);
		await asUser(user);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await settle(page);
		await spaGoto(page, `/tabs/profile/@${user.username}`);
		await spaGoto(page, '/tabs/dashboard');
		await settle(page);

		const trace = await readAvatarTrace(page);
		const ids = [...new Set(trace.map((entry) => entry.id))];
		expect(ids.length).toBeGreaterThan(0);

		for (const id of ids) {
			const states = avatarStates(trace, id);
			// photo url, then at most one settle (blob or placeholder). more is oscillation
			expect(states.length, `img#${id}: ${states.join(' -> ')}`).toBeLessThanOrEqual(2);
		}
	});
});

// runs only against real mantle2 + cloud; proves the published avatar_url is routable and that
// nothing in the shipped client turns a live photo into the placeholder
test.describe('Profile photo against the real backend', () => {
	test.skip(!integrationMode, 'integration lane only');

	test('the published avatar_url is routable and renders bytes', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		await traceAvatars(page, AVATAR_CONTAINER);
		await asUser();

		const statuses: number[] = [];
		page.on('response', (res) => {
			if (PHOTO_ROUTE.test(res.url())) statuses.push(res.status());
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await settle(page);

		await expect.poll(() => statuses.length, { timeout: 15_000 }).toBeGreaterThan(0);
		// a 404 here means the url the API publishes does not match the route it points at
		expect(statuses.filter((status) => status >= 400)).toEqual([]);
		expectNoPlaceholderWobble(await readAvatarTrace(page));
	});
});
