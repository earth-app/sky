import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// unique topic per test so the localStorage vote-guard key never collides across runs
function harnessUrl(topic: string): string {
	return `/__test__/widget-harness?kind=MoodSpark&topic=${topic}`;
}

test.describe('MoodSpark widget', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('voting posts to /v2/mood, shows bars, and fires a native toast', async ({
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
			(req) => req.method() === 'POST' && /\/v2\/mood\/[^/]+\/[^/]+/.test(req.url()),
			{ timeout: 10_000 }
		);
		await loveButton.click();

		const post = await postSeen;
		expect(post.postDataJSON()).toMatchObject({ emoji: '😍' });

		// unvoted grid is gone; the bar chart (IonProgressBar rows) replaces it
		await expect(page.getByRole('button', { name: 'Vote Love' })).toHaveCount(0, { timeout: 8000 });
		await expect(page.locator('ion-progress-bar').first()).toBeVisible({ timeout: 8000 });

		// native toast recorded via the Capacitor Toast mock
		await expect
			.poll(async () => page.evaluate(() => (window as any).__toasts ?? []), { timeout: 8000 })
			.toContainEqual('Mood recorded.');
	});

	test('a browser that already voted today cannot vote again', async ({
		page,
		gotoHydrated,
		asUser,
		testId
	}) => {
		skipIfIntegration('mood aggregation is mock-only');
		await asUser({ username: 'mooduser' });

		const topic = `mood-${testId.slice(0, 8)}`;
		// pre-seed the localStorage vote-guard key useMood checks (mood_voted:<topic>:<utc-date>)
		await page.context().addInitScript((t) => {
			const d = new Date();
			const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
				d.getUTCDate()
			).padStart(2, '0')}`;
			try {
				window.localStorage.setItem(`mood_voted:${t}:${date}`, String(Date.now()));
			} catch {
				// no localStorage; the widget still reads it as not-voted, test skips assertion below
			}
		}, topic);

		await gotoHydrated(harnessUrl(topic));
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		// hasVoted short-circuits the grid; only the bar chart renders, so no vote button exists
		await expect(page.locator('[data-testid="widget-slot"] ion-card')).toBeVisible({
			timeout: 12_000
		});
		await expect(page.getByRole('button', { name: 'Vote Love' })).toHaveCount(0);
	});
});
