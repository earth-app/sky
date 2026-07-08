import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { makeUser, paginate } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// a friend with a publicly-visible last_login so the sort's privacy gate passes
function friendFixture(id: string, username: string, lastLogin: string): Record<string, any> {
	const u = makeUser({ id, username });
	u.last_login = lastLogin;
	u.account.field_privacy.last_login = 'PUBLIC';
	return u;
}

test.describe('Challenge a Friend picker', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('lists friends in order with the Recommended chip, then challenges one', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('mock friends + circle + challenge POST');

		const me = await asUser({ id: 'me-1', username: 'challenger' });
		// friends[] preserves add-order; the newest still-present id earns the Recommended chip
		me.friends = ['friend-circle', 'friend-oldest', 'friend-newest'];
		await mockApi.registerUser(me);

		const friendNewest = friendFixture('friend-newest', 'newestfriend', '2026-07-01T00:00:00.000Z');
		const friendOldest = friendFixture('friend-oldest', 'oldestfriend', '2024-01-01T00:00:00.000Z');
		const friendCircle = friendFixture('friend-circle', 'circlefriend', '2020-01-01T00:00:00.000Z');

		// no active quest -> the daily quest is the single pickable, so a pick auto-fires the POST
		await mockApi.setActiveQuest(null);

		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/friends/,
			status: 200,
			body: paginate([friendNewest, friendOldest]),
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/circle/,
			status: 200,
			body: paginate([friendCircle]),
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

		await gotoTab(page, gotoHydrated, '/tabs/quests');

		await page.locator('#challenge-friend-trigger').click();

		const list = page.locator('#challenge-friend-list');
		await expect(list).toBeVisible({ timeout: 12_000 });

		// circle member first, then most-recent login, then oldest login
		await expect
			.poll(
				async () =>
					list
						.locator('ion-item[data-username]')
						.evaluateAll((els) => els.map((e) => e.getAttribute('data-username'))),
				{ timeout: 8000 }
			)
			.toEqual(['circlefriend', 'newestfriend', 'oldestfriend']);

		// Recommended chip lands on the most-recently-added present friend, not the top row
		await expect(list.locator('ion-item[data-username="newestfriend"]')).toContainText(
			'Recommended'
		);
		await expect(list.locator('ion-item[data-username="circlefriend"]')).not.toContainText(
			'Recommended'
		);

		// selecting a friend fires the challenge POST and surfaces the success toast
		await list.locator('ion-item[data-username="circlefriend"]').click();
		await expectNativeToast(page, /challenge sent to @circlefriend/i);

		// the picker closes on success
		await expect(list).toBeHidden({ timeout: 8000 });
	});

	test('shows the empty state when the user has no friends', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('mock empty friends + circle');

		await asUser({ id: 'me-1', username: 'challenger' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/friends/,
			status: 200,
			body: paginate([]),
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/circle/,
			status: 200,
			body: paginate([]),
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/quests');

		await page.locator('#challenge-friend-trigger').click();

		await expect(page.locator('#challenge-empty-state')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/add friends to challenge them/i)).toBeVisible();
		await expect(page.getByRole('button', { name: /find friends/i })).toBeVisible();
	});
});
