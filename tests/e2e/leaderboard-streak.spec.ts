import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeLeaderboardEntry, makeUser } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// global proxy rows: admin is global-only and 0-streak, so it proves global never filters
const GLOBAL_ROWS = [
	{ id: 'author-1', streak: 5 },
	{ id: 'admin-user-1', streak: 0 },
	{ id: 'writer-1', streak: 3 }
];

// scoped rows: host is scoped-only and 0-streak (the row the friends streak board must hide)
function scopedBody(scope: 'friends' | 'circle', type: string) {
	return {
		scope,
		type,
		items: [
			makeLeaderboardEntry({
				rank: 1,
				value: 5,
				user: makeUser({ id: 'author-1', username: 'author' })
			}),
			makeLeaderboardEntry({
				rank: 2,
				value: 0,
				user: makeUser({ id: 'host-1', username: 'host' })
			}),
			makeLeaderboardEntry({
				rank: 3,
				value: 3,
				user: makeUser({ id: 'writer-1', username: 'writer' })
			})
		],
		total: 3
	};
}

// the whole MLeaderboard lives inside #leaderboard-hero; scope segment + metric chips are here too
function challengeButtons(page: Page) {
	return page.locator('#leaderboard-hero ion-button').filter({ hasText: 'Challenge' });
}

// UTable renders a real <table data-slot="base">; scope every "@user in/out of the board"
// assertion here so it never matches the same handle in the nav/header or the kept-alive
// dashboard's mini-leaderboard (a page-wide getByText does)
function board(page: Page) {
	return page.locator('#leaderboard-hero table');
}

// ionic segments/chips ignore a coordinate click through their indicator overlay, so dispatch
// the click on the matching host element directly (same approach the discover specs use)
async function switchScope(page: Page, label: 'Global' | 'Friends' | 'Circle') {
	await page.evaluate((lbl) => {
		const root = document.querySelector('#leaderboard-hero');
		const btns = Array.from(root?.querySelectorAll('ion-segment-button') ?? []);
		(btns.find((b) => (b.textContent ?? '').includes(lbl)) as HTMLElement | undefined)?.click();
	}, label);
}

async function switchMetric(page: Page, label: 'Points' | 'Articles' | 'Prompts' | 'Events') {
	await page.evaluate((lbl) => {
		const root = document.querySelector('#leaderboard-hero');
		// the metric selector chips sit above the table (their icon adds no text), so a label
		// match hits only the selector chip - never a rank/value chip in a row
		const chips = Array.from(root?.querySelectorAll('ion-chip') ?? []);
		(chips.find((c) => (c.textContent ?? '').includes(lbl)) as HTMLElement | undefined)?.click();
	}, label);
}

test.describe('Leaderboard streak + journey hero journey', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('switch metric+scope, hide 0-streak in friends, challenge a row, then read the journey hero', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock global + scoped leaderboard, challenge POST, journey GET');
		await asUser({ username: 'lbstreaker' });

		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/api\/user\/leaderboard\b/,
			status: 200,
			body: GLOBAL_ROWS,
			once: false
		});
		// path-only match => serves both friends + circle (the scope query isn't matched)
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/leaderboard/,
			status: 200,
			body: scopedBody('friends', 'article'),
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/users\/current\/quest\/challenge/,
			status: 200,
			body: { success: true },
			once: false
		});
		// hero reads counts from the crust proxy GET; no default handler exists, so we must seed it
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/api\/user\/journey$/,
			status: 200,
			body: { count: 7, lastWrite: Date.now() },
			once: false
		});
		// no active quest => the daily quest is the single pickable, so a row challenge auto-fires
		await mockApi.setActiveQuest(null);

		await gotoTab(page, gotoHydrated, '/tabs/profile/leaderboard/article');

		await expect(page.locator('#leaderboard-hero')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByRole('heading', { name: /articles leaderboard/i })).toBeVisible({
			timeout: 12_000
		});

		// global + streak metric: header is a streak, admin (global-only, 0-streak) IS shown
		// (global never filters), and there is no per-row challenge affordance
		await expect(page.locator('#leaderboard-hero').getByText('Current Streak')).toBeVisible({
			timeout: 12_000
		});
		await expect(
			board(page)
				.getByText(/@admin/i)
				.first()
		).toBeVisible({ timeout: 15_000 });
		await expect(challengeButtons(page)).toHaveCount(0);

		// friends + streak metric: rows swap to the scoped set (admin gone), the 0-streak
		// host row is HIDDEN, so only author+writer remain -> exactly 2 challenge buttons.
		// the button count settling to 2 is the "board re-fetched + filtered" gate before we
		// assert which handles are in/out of the table.
		await switchScope(page, 'Friends');
		await expect(challengeButtons(page)).toHaveCount(2, { timeout: 12_000 });
		await expect(
			board(page)
				.getByText(/@author/i)
				.first()
		).toBeVisible();
		await expect(board(page).getByText(/@admin/i)).toHaveCount(0);
		await expect(board(page).getByText(/@host/i)).toHaveCount(0);

		// same scoped data, points metric: points never filters, so the 0-value host row
		// reappears (3 rows) and the header flips to points
		await switchMetric(page, 'Points');
		await expect(page.locator('#leaderboard-hero').getByText('Impact Points')).toBeVisible({
			timeout: 12_000
		});
		await expect(challengeButtons(page)).toHaveCount(3, { timeout: 12_000 });
		await expect(board(page).getByText(/@host/i).first()).toBeVisible();

		// circle resolves the same scoped endpoint; board still renders
		await switchScope(page, 'Circle');
		await expect(challengeButtons(page)).toHaveCount(3, { timeout: 12_000 });
		await expect(
			board(page)
				.getByText(/@author/i)
				.first()
		).toBeVisible();

		// tap a non-global row's challenge; retry absorbs the daily-quest catalog warmup.
		// tolerant matcher keeps the journey flowing to the hero - the strict name/undefined
		// guard lives in its own test below.
		await expect(async () => {
			await challengeButtons(page).first().click();
			const toasts = (await page.evaluate(() => (window as any).__toasts ?? [])) as string[];
			expect(toasts.some((t) => /has been challenged\. Game on/i.test(t))).toBe(true);
		}).toPass({ timeout: 12_000 });

		// journey hero: counts render from the seeded GET and must NOT flash-then-zero
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByText('Your Journeys')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole('button', { name: /Articles journey: 7/i }).first()).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: /Prompts journey: 7/i }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: /Events journey: 7/i }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: /journey: 0/i })).toHaveCount(0);

		// stability: no delayed reset back to 0
		await page.waitForTimeout(1500);
		await expect(page.getByRole('button', { name: /Articles journey: 7/i }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: /journey: 0/i })).toHaveCount(0);
	});

	test('per-row challenge sends with the friend name, never "undefined"', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('scoped leaderboard + challenge POST + daily quest');
		await asUser({ username: 'lbchallenger' });
		await mockApi.setActiveQuest(null);

		// distinct full_name on the first row so the success toast name is unambiguous
		const author = makeUser({ id: 'author-1', username: 'author' });
		author.full_name = 'Ada Author';
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/leaderboard/,
			status: 200,
			body: {
				scope: 'friends',
				type: 'points',
				items: [
					makeLeaderboardEntry({ rank: 1, value: 12, user: author }),
					makeLeaderboardEntry({
						rank: 2,
						value: 8,
						user: makeUser({ id: 'host-1', username: 'host' })
					})
				],
				total: 2
			},
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/users\/current\/quest\/challenge/,
			status: 200,
			body: { success: true },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/leaderboard/points');
		await expect(page.locator('#leaderboard-hero')).toBeVisible({ timeout: 12_000 });

		await switchScope(page, 'Friends');
		await expect(challengeButtons(page)).toHaveCount(2, { timeout: 12_000 });

		await expect(async () => {
			await challengeButtons(page).first().click();
			const toasts = (await page.evaluate(() => (window as any).__toasts ?? [])) as string[];
			expect(toasts.some((t) => /has been challenged\. Game on/i.test(t))).toBe(true);
		}).toPass({ timeout: 12_000 });

		const toasts = (await page.evaluate(() => (window as any).__toasts ?? [])) as string[];
		// the challenged friend's name must reach the toast (guards the props wiring)
		expect(toasts.some((t) => /Ada Author has been challenged\. Game on/i.test(t))).toBe(true);
		expect(toasts.every((t) => !/undefined/i.test(t))).toBe(true);
	});

	test('empty friends leaderboard shows the empty state, not a stuck spinner', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock empty scoped leaderboard');
		await asUser({ username: 'lbempty' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/leaderboard/,
			status: 200,
			body: { scope: 'friends', type: 'article', items: [], total: 0 },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/leaderboard/article');
		await expect(page.locator('#leaderboard-hero')).toBeVisible({ timeout: 12_000 });

		await switchScope(page, 'Friends');
		// UTable has no loading slot, so an empty scoped result resolves to the "No data"
		// empty row rather than hanging on a spinner; and there are no rows/challenge buttons.
		// the "No data" row appearing is the settle gate for the empty board.
		await expect(board(page).getByText('No data')).toBeVisible({ timeout: 12_000 });
		await expect(challengeButtons(page)).toHaveCount(0);
		await expect(board(page).getByText(/@author/i)).toHaveCount(0);
	});

	test('journey hero renders the streak count immediately, with no flash of zeros', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock journey GET');
		await asUser({ username: 'herowarm' });
		// distinct count proves the cell reads the seeded value, not a fabricated 0
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/api\/user\/journey$/,
			status: 200,
			body: { count: 9, lastWrite: Date.now() },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		// the hero only becomes visible once a fetch has returned, so its first paint already
		// carries the real count - a 0-labeled cell must never exist
		await expect(page.getByRole('button', { name: /Articles journey: 9/i }).first()).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: /journey: 0/i })).toHaveCount(0);

		await page.waitForTimeout(1500);
		await expect(page.getByRole('button', { name: /Articles journey: 9/i }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: /journey: 0/i })).toHaveCount(0);
	});
});
