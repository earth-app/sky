import type { BrowserContext, Page } from '@playwright/test';
import { suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeQuest, makeUserQuestProgress } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// The end-of-feed card (FeedMCaughtUp): the finite-session stop that closes the dashboard feed.

// the daily ceiling is persisted per local day, so seeding it past DEFAULT_DAILY_CAP makes the feed
// finite on the first render instead of after 60 cards. registered after installNativeMock so the
// mocked Preferences store already exists on the document
async function seedFeedCapReached(context: BrowserContext): Promise<void> {
	await context.addInitScript(() => {
		const now = new Date();
		const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
			now.getDate()
		).padStart(2, '0')}`;
		const w = window as any;
		w.__prefs ||= {};
		w.__prefs['sky:feed-session-cap:daily'] = JSON.stringify({ day, count: 999 });
	});
}

// scoped to the card: the dashboard hero carries its own quest chips with the same wording
function caughtUpCard(page: Page) {
	return page.locator('#feed-caught-up');
}

test.describe('End-of-feed caught-up card', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
		await suppressV060Tours(context);
		await seedFeedCapReached(context);
	});

	test("offers Today's Quest while nothing is in progress", async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('seeded feed cap + mock quest catalog');
		await asUser({ username: 'caughtupdaily' });
		// no active quest, so the only quest the card can offer is the daily one
		await mockApi.setActiveQuest(null);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const card = caughtUpCard(page);
		await expect(card).toBeVisible({ timeout: 20_000 });

		await expect(card.getByRole('button', { name: /today's quest/i })).toBeVisible({
			timeout: 12_000
		});
		await expect(card.getByRole('button', { name: /continue quest/i })).toHaveCount(0);
		// the calm exit stays: trails first, keep-browsing as the quiet way out
		await expect(card.getByRole('button', { name: 'Browse Trails' })).toBeVisible();
		await expect(card.getByRole('button', { name: 'Keep Browsing' })).toBeVisible();
	});

	test('offers Continue Quest for an unfinished quest and opens that quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('seeded feed cap + active quest');
		await asUser({ username: 'caughtupactive' });

		const quest = makeQuest({ id: 'q-open-feed', title: 'Half Finished Walk' });
		await mockApi.registerQuest(quest);
		await mockApi.setActiveQuest(makeUserQuestProgress(quest));

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const card = caughtUpCard(page);
		await expect(card).toBeVisible({ timeout: 20_000 });

		const cta = card.getByRole('button', { name: /continue quest/i });
		await expect(cta).toBeVisible({ timeout: 15_000 });
		// the in-progress quest replaces the daily offer rather than sitting beside it
		await expect(card.getByRole('button', { name: /today's quest/i })).toHaveCount(0);

		await cta.click();
		await expect
			.poll(() => page.evaluate(() => location.pathname), { timeout: 15_000 })
			.toBe('/tabs/quests/q-open-feed');
	});

	test('Keep Browsing clears the card for the rest of the session', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('seeded feed cap');
		await asUser({ username: 'caughtupkeep' });
		await mockApi.setActiveQuest(null);

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const card = caughtUpCard(page);
		await expect(card).toBeVisible({ timeout: 20_000 });

		await card.getByRole('button', { name: 'Keep Browsing' }).click();
		await expect(card).toHaveCount(0, { timeout: 12_000 });
	});
});
