import { expect, test } from './utils/fixtures';
import { makeChallenge, makeUser } from './utils/mock-data';

test.describe('Quest challenge banner', () => {
	test('shows the pending co-op challenge to the recipient', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		const u = await asUser();
		// recipient is the current user + status pending -> recipient banner branch
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/quest\/challenge/,
			body: {
				challenge: makeChallenge({
					id: 'chal-1',
					quest_id: 'q-1',
					challenger_id: 'author-1',
					challenger_name: '@author',
					recipient_id: u.id,
					recipient_name: `@${u.username}`,
					status: 'pending'
				}),
				other_user: makeUser({ id: 'author-1', username: 'author' }),
				other_progress: null
			},
			once: false
		});

		// q-1 (Daily Explorer) is in the default catalog, so the page (and banner) render
		await gotoHydrated('/tabs/quests/q-1');

		await expect(page.locator('#quest-challenge-banner')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/challenged you to this quest/i).first()).toBeVisible();
		await expect(page.getByRole('button', { name: /accept/i }).first()).toBeVisible();
	});
});
