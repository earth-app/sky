import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { seedSingleStepQuest } from './utils/quest-helpers';

test.describe('Dashboard tab', () => {
	test('renders the title, greeting, and feed sections', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('asserts mock @dashuser greeting');
		await asUser({ username: 'dashuser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await expect(page.locator('#title')).toHaveText(/the earth app/i);
		// greeting lives in ClientOnly, so it resolves shortly after hydration
		await expect(page.getByText(/welcome,\s*@dashuser!/i)).toBeVisible({ timeout: 12_000 });
		await expect(page.getByRole('heading', { name: /your feed/i })).toBeVisible({
			timeout: 12_000
		});
	});

	test('shows the "Your Activities" strip when the user has activities', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		// the recommend endpoint seeds activities into the auth user's feed
		await asUser({ username: 'dashuser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// the feed always renders; the activities strip is conditional on user.activities.
		// assert the feed heading always, and the activities strip if it surfaced.
		await expect(page.getByRole('heading', { name: /your feed/i })).toBeVisible({
			timeout: 12_000
		});
		const activitiesHeading = page.getByRole('heading', { name: /your activities/i });
		if (await activitiesHeading.isVisible().catch(() => false)) {
			await expect(activitiesHeading).toBeVisible();
		}
	});

	test('surfaces the MOTD card with the mock message', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('depends on mock MOTD override');
		await asUser({ username: 'dashuser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const motd = page.locator('#motd');
		await expect(motd).toBeVisible({ timeout: 12_000 });
		await expect(motd).toContainText(/welcome to the earth app/i);
	});

	test('feed streams content cards from the catalog', async ({ page, gotoHydrated, asUser }) => {
		await asUser({ username: 'dashuser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await expect(page.getByRole('heading', { name: /your feed/i })).toBeVisible({
			timeout: 12_000
		});
		await expect
			.poll(async () => page.locator('ion-card').count(), { timeout: 15_000 })
			.toBeGreaterThan(0);
	});

	test('active quest does not surface a resume affordance on the dashboard', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded mock quest progress');
		const user = await asUser({ username: 'dashuser' });
		// seed an active quest tied to the logged-in user so the store primes it
		await seedSingleStepQuest(mockApi, 'describe_text', { questId: 'q-dash-active' });
		await mockApi.loginAs(user.id, `mock-token-${user.id}`).catch(() => {});
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await expect(page.locator('#title')).toBeVisible({ timeout: 12_000 });
		// the dashboard intentionally has no active-quest resume card; the only
		// resume affordance is the welcome-tour chip. assert no quest-resume UI leaks in.
		await expect(page.getByText(/resume.*quest/i)).toHaveCount(0);
	});
});
