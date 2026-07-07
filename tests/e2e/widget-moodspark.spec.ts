import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeMoodSnapshot } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

const MOOD_PATH = /^\/v2\/mood\/[^/]+\/[^/]+\/?$/;

// unique topic per test so the localStorage vote-guard key never collides across runs
function harnessUrl(topic: string): string {
	return `/__test__/widget-harness?kind=MoodSpark&topic=${topic}`;
}

// pre-seed crust's localStorage vote-guard so the widget mounts straight into the voted state
async function seedVoteGuard(page: import('@playwright/test').Page, topic: string) {
	await page.context().addInitScript((t) => {
		const d = new Date();
		const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
			d.getUTCDate()
		).padStart(2, '0')}`;
		try {
			window.localStorage.setItem(`mood_voted:${t}:${date}`, String(Date.now()));
		} catch {
			// no localStorage; the widget still reads it as not-voted, guarded assertions skip
		}
	}, topic);
}

test.describe('MoodSpark widget', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('voting registers a cloud vote, shows the recorded bars (100%/0%), and toasts', async ({
		page,
		gotoHydrated,
		asUser,
		testId
	}) => {
		skipIfIntegration('mood aggregation is mock-only');
		await asUser({ username: 'mooduser' });

		const topic = `mood-${testId.slice(0, 8)}`;
		await gotoHydrated(harnessUrl(topic));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		const loveButton = page.getByRole('button', { name: 'Vote Love' });
		await expect(loveButton).toBeVisible({ timeout: 12_000 });

		// register the request wait right before the click so navigation time can't eat the window
		const postSeen = page.waitForRequest(
			(req) => req.method() === 'POST' && MOOD_PATH.test(new URL(req.url()).pathname),
			{ timeout: 10_000 }
		);
		await loveButton.click();

		const post = await postSeen;
		expect(post.postDataJSON()).toMatchObject({ emoji: '😍' });

		// unvoted grid is gone; the bar chart (IonProgressBar rows) replaces it
		await expect(page.getByRole('button', { name: 'Vote Love' })).toHaveCount(0, { timeout: 8000 });
		await expect(page.locator('ion-progress-bar').first()).toBeVisible({ timeout: 8000 });

		// the mock records the single vote as 100% for Love and 0% for the rest; assert the
		// recorded aggregate is what renders, and that "100%" stays on ONE line (the layout bug)
		const pct100 = page.locator('span.tabular-nums', { hasText: '100%' });
		await expect(pct100).toHaveText('100%', { timeout: 8000 });
		const box = await pct100.boundingBox();
		expect(box).not.toBeNull();
		// a wrapped "100" over "%" doubles the line box (~16px -> ~32px); one line stays under 24px
		expect(box!.height).toBeLessThan(24);
		await expect(page.locator('span.tabular-nums', { hasText: '0%' }).first()).toBeVisible();

		await expect(page.getByText('Thanks for Sharing Today')).toBeVisible({ timeout: 8000 });

		// native toast recorded via the Capacitor Toast mock
		await expect
			.poll(async () => page.evaluate(() => (window as any).__toasts ?? []), { timeout: 8000 })
			.toContainEqual('Mood recorded.');
	});

	test('an already-voted device shows the cooldown state and fires no second vote', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi,
		testId
	}) => {
		skipIfIntegration('mood aggregation is mock-only');
		await asUser({ username: 'mooduser' });

		const topic = `mood-${testId.slice(0, 8)}`;
		await seedVoteGuard(page, topic);

		// seed a fixed, mixed aggregate (7 Love / 3 Good of 10) so the recorded percentages
		// are deterministic run-to-run instead of varying
		await mockApi.set({
			method: 'GET',
			path: MOOD_PATH,
			body: makeMoodSnapshot({ counts: { '😍': 7, '😊': 3 } }),
			once: false
		});

		let moodPosts = 0;
		page.on('request', (req) => {
			if (req.method() === 'POST' && MOOD_PATH.test(new URL(req.url()).pathname)) moodPosts++;
		});

		await gotoHydrated(harnessUrl(topic));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		// hasVoted short-circuits the grid; only the bar chart renders, so no vote button exists
		await expect(page.locator('[data-testid="widget-slot"] ion-card')).toBeVisible({
			timeout: 12_000
		});
		await expect(page.getByRole('button', { name: 'Vote Love' })).toHaveCount(0);

		// cooldown copy + the recorded distribution the seeded GET returned
		await expect(page.getByText("You've Already Shared Today")).toBeVisible({ timeout: 8000 });
		await expect(page.locator('span.tabular-nums', { hasText: '70%' })).toBeVisible();
		await expect(page.locator('span.tabular-nums', { hasText: '30%' })).toBeVisible();
		await expect(page.getByText('10 voices today')).toBeVisible();

		// no way to vote again today; nothing should have POSTed
		expect(moodPosts).toBe(0);
	});

	test('a sparse bucket with no votes yet renders all 0% and hides the voices line', async ({
		page,
		gotoHydrated,
		asUser,
		testId
	}) => {
		skipIfIntegration('mood aggregation is mock-only');
		await asUser({ username: 'mooduser' });

		const topic = `mood-${testId.slice(0, 8)}`;
		await seedVoteGuard(page, topic);

		// default mock GET returns an empty aggregate (total 0) -> the sparse new-user case
		await gotoHydrated(harnessUrl(topic));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await expect(page.locator('[data-testid="widget-slot"] ion-card')).toBeVisible({
			timeout: 12_000
		});
		await expect(page.getByText("You've Already Shared Today")).toBeVisible({ timeout: 8000 });
		// every bar is 0% and the "N voices today" line is suppressed at total 0
		await expect(page.locator('span.tabular-nums', { hasText: '0%' })).toHaveCount(6);
		await expect(page.getByText(/voices today/)).toHaveCount(0);
	});

	test('a failed submit surfaces an error, keeps the grid, and does not lie about recording', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi,
		testId
	}) => {
		skipIfIntegration('mood aggregation is mock-only');
		await asUser({ username: 'mooduser' });

		const topic = `mood-${testId.slice(0, 8)}`;

		// every vote POST hard-fails (offline / backend down); the vote must not be faked as recorded
		await mockApi.set({
			method: 'POST',
			path: MOOD_PATH,
			status: 500,
			body: { message: 'Could not reach the server' },
			once: false
		});

		await gotoHydrated(harnessUrl(topic));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		const loveButton = page.getByRole('button', { name: 'Vote Love' });
		await expect(loveButton).toBeVisible({ timeout: 12_000 });

		const postSeen = page.waitForRequest(
			(req) => req.method() === 'POST' && MOOD_PATH.test(new URL(req.url()).pathname),
			{ timeout: 10_000 }
		);
		await loveButton.click();
		await postSeen;

		// grid stays (no optimistic flip to results) and no results bars appear
		await expect(loveButton).toBeVisible({ timeout: 8000 });
		await expect(page.locator('ion-progress-bar')).toHaveCount(0);

		// never claims success; the "recorded" toast must not fire on a failed submit
		await page.waitForTimeout(500);
		const toasts = await page.evaluate(() => (window as any).__toasts ?? []);
		expect(toasts).not.toContainEqual('Mood recorded.');
	});
});
