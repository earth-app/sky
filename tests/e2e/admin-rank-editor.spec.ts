import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeUser } from './utils/mock-data';

test.describe('Admin rank editor', () => {
	test('admin changes a user account level from the profile rank badge', async ({
		page,
		gotoHydrated,
		asAdmin,
		mockApi,
		testId
	}) => {
		skipIfIntegration('admin rank editor is mock-only');
		await asAdmin({ username: 'ranker' });

		// dedicated per-test target so the mutation never leaks into the shared seeds
		const target = makeUser({
			id: `rank-target-${testId.slice(0, 8)}`,
			username: `ranktarget-${testId.slice(0, 6)}`,
			account: { account_type: 'WRITER' }
		});
		await mockApi.registerUser(target);

		await gotoTab(page, gotoHydrated, `/tabs/profile/${target.id}`);
		await expect(page.locator('#profile-title')).toContainText(
			new RegExp(`@${target.username}`, 'i'),
			{ timeout: 12_000 }
		);

		const editor = page.locator('[data-testid="type-badge-editor"]');
		await expect(editor).toBeVisible({ timeout: 12_000 });
		await expect(editor).toContainText(/writer/i);

		await editor.click();
		const sheet = page.locator('ion-action-sheet');
		await expect(sheet).toBeVisible({ timeout: 8_000 });

		const putSeen = page.waitForRequest(
			(req) =>
				req.method() === 'PUT' &&
				new RegExp(`/v2/users/${target.id}/account_type`).test(req.url()) &&
				/type=organizer/.test(req.url()),
			{ timeout: 10_000 }
		);
		await sheet.locator('button', { hasText: /^Organizer$/ }).click();
		await putSeen;

		// optimistic + server-confirmed rank update reflects in the badge label
		await expect(editor).toContainText(/organizer/i, { timeout: 8_000 });
	});

	test('non-admin sees the rank badge but cannot edit it', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi,
		testId
	}) => {
		skipIfIntegration('admin rank editor is mock-only');
		await asUser({ username: 'plainviewer' });

		const target = makeUser({
			id: `rank-target-${testId.slice(0, 8)}`,
			username: `ranktarget-${testId.slice(0, 6)}`,
			account: { account_type: 'ORGANIZER' }
		});
		await mockApi.registerUser(target);

		await gotoTab(page, gotoHydrated, `/tabs/profile/${target.id}`);
		await expect(page.locator('#profile-title')).toContainText(
			new RegExp(`@${target.username}`, 'i'),
			{ timeout: 12_000 }
		);

		// plain badge still renders for a non-FREE user, but there is no editor affordance
		await expect(page.getByText(/organizer/i).first()).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('[data-testid="type-badge-editor"]')).toHaveCount(0);
	});
});
