import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

test.describe('Profile view', () => {
	test('own profile shows the title, bell, and settings controls', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mock profile fixtures');
		const user = await asUser({ username: 'viewer' });
		await gotoTab(page, gotoHydrated, `/tabs/profile/@${user.username}`);

		await expect(page.locator('#profile-title')).toContainText(/@viewer/i, { timeout: 12_000 });
		await expect(page.locator('#notifications')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#settings-link')).toBeVisible();
	});

	test('own profile is reachable by user id too', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('mock profile fixtures');
		const user = await asUser({ username: 'viewer' });
		await gotoTab(page, gotoHydrated, `/tabs/profile/${user.id}`);

		await expect(page.locator('#profile-title')).toContainText(/@viewer/i, { timeout: 12_000 });
		await expect(page.locator('#settings-link')).toBeVisible({ timeout: 12_000 });
	});

	test('another user profile hides owner-only controls', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('mock profile fixtures');
		await asUser({ username: 'viewer' });
		// author-1 (@author) is a seeded mock user distinct from the logged-in viewer
		await gotoTab(page, gotoHydrated, '/tabs/profile/author-1');

		await expect(page.locator('#profile-title')).toContainText(/@author/i, { timeout: 12_000 });
		await expect(page.locator('#settings-link')).toHaveCount(0);
		await expect(page.locator('#notifications')).toHaveCount(0);
	});

	test('unknown user shows the not-found state', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('mock profile fixtures');
		await asUser({ username: 'viewer' });
		await gotoTab(page, gotoHydrated, '/tabs/profile/does-not-exist-999');

		const notFound = page.getByRole('alert').filter({ hasText: /profile not found/i });
		await expect(notFound).toBeVisible({ timeout: 12_000 });
		await expect(notFound.getByText(/this account doesn't exist/i)).toBeVisible();
		// the old copy echoed the route param back at the user; that leak must not return
		await expect(page.getByText('does-not-exist-999')).toHaveCount(0);
		await expect(page.locator('#settings-link')).toHaveCount(0);
	});
});
