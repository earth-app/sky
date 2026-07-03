import { expect, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

test.describe('Profile view', () => {
	test('own profile shows the title, bell, and settings controls', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		const user = await asUser({ username: 'viewer' });
		await gotoTab(page, gotoHydrated, `/tabs/profile/@${user.username}`);

		await expect(page.locator('#profile-title')).toContainText(/@viewer/i, { timeout: 12_000 });
		await expect(page.locator('#notifications')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#settings-link')).toBeVisible();
	});

	test('own profile is reachable by user id too', async ({ page, gotoHydrated, asUser }) => {
		const user = await asUser({ username: 'viewer' });
		await gotoTab(page, gotoHydrated, `/tabs/profile/${user.id}`);

		await expect(page.locator('#profile-title')).toContainText(/@viewer/i, { timeout: 12_000 });
		await expect(page.locator('#settings-link')).toBeVisible({ timeout: 12_000 });
	});

	test('another user profile hides owner-only controls', async ({ page, gotoHydrated, asUser }) => {
		await asUser({ username: 'viewer' });
		// author-1 (@author) is a seeded mock user distinct from the logged-in viewer
		await gotoTab(page, gotoHydrated, '/tabs/profile/author-1');

		await expect(page.locator('#profile-title')).toContainText(/@author/i, { timeout: 12_000 });
		await expect(page.locator('#settings-link')).toHaveCount(0);
		await expect(page.locator('#notifications')).toHaveCount(0);
	});

	test('unknown user shows the not-found state', async ({ page, gotoHydrated, asUser }) => {
		await asUser({ username: 'viewer' });
		await gotoTab(page, gotoHydrated, '/tabs/profile/does-not-exist-999');

		await expect(page.getByText(/user not found/i)).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#settings-link')).toHaveCount(0);
	});
});
