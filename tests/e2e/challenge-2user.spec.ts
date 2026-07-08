import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { makeChallenge, makeUser, paginate } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// a friend with a publicly-visible last_login so the challenge sort's privacy gate passes
function friendFixture(id: string, username: string, lastLogin: string): Record<string, any> {
	const u = makeUser({ id, username });
	u.last_login = lastLogin;
	u.account.field_privacy.last_login = 'PUBLIC';
	return u;
}

// anchored so the GET view + POST create match, but the /{id}/accept subpath does NOT
const CHALLENGE_PATH = /^\/v2\/users\/current\/quest\/challenge\/?$/;

test.describe('Challenge a friend - two-user journey', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('A challenges B, B accepts, and both see the shared-progress banner', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('two mocked users + challenge handshake');

		// ---- user A sends the challenge ----
		const alice = await asUser({ id: 'user-a', username: 'alice' });
		alice.friends = ['user-b'];
		await mockApi.registerUser(alice);
		await mockApi.registerUser(friendFixture('user-b', 'bob', '2026-07-01T00:00:00.000Z'));

		// no active quest -> the daily quest is the single pickable, so a pick auto-fires the POST
		await mockApi.setActiveQuest(null);
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/current\/friends/,
			body: paginate([friendFixture('user-b', 'bob', '2026-07-01T00:00:00.000Z')]),
			once: false
		});
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/current\/circle/,
			body: paginate([]),
			once: false
		});
		await mockApi.set({
			method: 'POST',
			path: CHALLENGE_PATH,
			body: { success: true },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/quests');

		await page.locator('#challenge-friend-trigger').click();
		const list = page.locator('#challenge-friend-list');
		await expect(list).toBeVisible({ timeout: 12_000 });

		// capture the create POST to learn which quest got challenged (the daily quest id)
		const postPromise = page.waitForRequest(
			(r) =>
				r.method() === 'POST' && new URL(r.url()).pathname === '/v2/users/current/quest/challenge'
		);
		await list.locator('ion-item[data-username="bob"]').click();
		const post = await postPromise;
		const params = new URL(post.url()).searchParams;
		expect(params.get('friend')).toBe('user-b');
		const questId = params.get('quest') ?? '';
		expect(questId.length).toBeGreaterThan(0);

		await expectNativeToast(page, /challenge sent to @bob/i);
		await expect(list).toBeHidden({ timeout: 8000 });

		// ---- switch to user B: sees the incoming pending challenge ----
		await mockApi.loginAs('user-b', 'mock-token-user-b');
		await mockApi.set({
			method: 'GET',
			path: CHALLENGE_PATH,
			once: false,
			body: {
				challenge: makeChallenge({
					id: 'chal-ab',
					quest_id: questId,
					challenger_id: 'user-a',
					challenger_name: '@alice',
					recipient_id: 'user-b',
					recipient_name: '@bob',
					status: 'pending'
				}),
				other_user: makeUser({ id: 'user-a', username: 'alice' }),
				other_progress: null
			}
		});

		await gotoHydrated(`/tabs/quests/${questId}`);
		const banner = page.locator('#quest-challenge-banner');
		await expect(banner).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/challenged you to this quest/i).first()).toBeVisible();
		const acceptBtn = page.getByRole('button', { name: /accept/i }).first();
		await expect(acceptBtn).toBeVisible();

		// arm the accepted view for the post-accept refetch, then accept
		await mockApi.set({
			method: 'GET',
			path: CHALLENGE_PATH,
			once: false,
			body: {
				challenge: makeChallenge({
					id: 'chal-ab',
					quest_id: questId,
					challenger_id: 'user-a',
					challenger_name: '@alice',
					recipient_id: 'user-b',
					recipient_name: '@bob',
					status: 'active',
					accepted_at: Date.now()
				}),
				other_user: makeUser({ id: 'user-a', username: 'alice' }),
				other_progress: { current_step: 2, total_steps: 5, completed: false }
			}
		});
		await acceptBtn.click();
		await expectNativeToast(page, /race you to the finish/i);
		await expect(banner).toContainText(/in this together/i, { timeout: 12_000 });

		// ---- switch back to A: the challenger also sees the shared-progress banner ----
		await mockApi.loginAs('user-a', 'mock-token-user-a');
		await mockApi.set({
			method: 'GET',
			path: CHALLENGE_PATH,
			once: false,
			body: {
				challenge: makeChallenge({
					id: 'chal-ab',
					quest_id: questId,
					challenger_id: 'user-a',
					challenger_name: '@alice',
					recipient_id: 'user-b',
					recipient_name: '@bob',
					status: 'active',
					accepted_at: Date.now()
				}),
				other_user: makeUser({ id: 'user-b', username: 'bob' }),
				other_progress: { current_step: 3, total_steps: 5, completed: false }
			}
		});
		await gotoHydrated(`/tabs/quests/${questId}`);
		const challengerBanner = page.locator('#quest-challenge-banner');
		await expect(challengerBanner).toBeVisible({ timeout: 12_000 });
		await expect(challengerBanner).toContainText(/in this together/i);
		// the challenger's card reflects B's live progress from other_progress
		await expect(challengerBanner).toContainText('3/5');
	});

	test('B declines and the banner clears', async ({ page, asUser, mockApi, gotoHydrated }) => {
		skipIfIntegration('mock challenge decline');

		await asUser({ id: 'user-b', username: 'bob' });
		await mockApi.registerUser(makeUser({ id: 'user-a', username: 'alice' }));

		await mockApi.set({
			method: 'GET',
			path: CHALLENGE_PATH,
			once: false,
			body: {
				challenge: makeChallenge({
					id: 'chal-ab',
					quest_id: 'q-1',
					challenger_id: 'user-a',
					challenger_name: '@alice',
					recipient_id: 'user-b',
					recipient_name: '@bob',
					status: 'pending'
				}),
				other_user: makeUser({ id: 'user-a', username: 'alice' }),
				other_progress: null
			}
		});

		await gotoHydrated('/tabs/quests/q-1');
		const banner = page.locator('#quest-challenge-banner');
		await expect(banner).toBeVisible({ timeout: 12_000 });
		const declineBtn = page.getByRole('button', { name: /decline/i }).first();
		await expect(declineBtn).toBeVisible();

		// a declined challenge clears server-side; the refetch sees no challenge
		await mockApi.set({
			method: 'GET',
			path: CHALLENGE_PATH,
			once: false,
			body: { challenge: null, other_user: null, other_progress: null }
		});
		await declineBtn.click();
		await expectNativeToast(page, /challenge declined/i);
		await expect(banner).toBeHidden({ timeout: 12_000 });
	});

	test('a duplicate challenge to the same friend and quest is deduped with a friendly message', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('mock challenge 24h dedupe');

		const alice = await asUser({ id: 'user-a', username: 'alice' });
		alice.friends = ['user-b'];
		await mockApi.registerUser(alice);
		await mockApi.registerUser(friendFixture('user-b', 'bob', '2026-07-01T00:00:00.000Z'));

		await mockApi.setActiveQuest(null);
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/current\/friends/,
			body: paginate([friendFixture('user-b', 'bob', '2026-07-01T00:00:00.000Z')]),
			once: false
		});
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/current\/circle/,
			body: paginate([]),
			once: false
		});
		// mantle's 24h dedupe returns a 409 conflict with a templated message
		await mockApi.set({
			method: 'POST',
			path: CHALLENGE_PATH,
			status: 409,
			once: false,
			body: { message: 'You have already challenged this friend to this quest recently.' }
		});

		await gotoTab(page, gotoHydrated, '/tabs/quests');

		await page.locator('#challenge-friend-trigger').click();
		const list = page.locator('#challenge-friend-list');
		await expect(list).toBeVisible({ timeout: 12_000 });
		await list.locator('ion-item[data-username="bob"]').click();

		await expectNativeToast(page, /already challenged/i);
		// a failed send keeps the picker open so the user can pick another friend
		await expect(list).toBeVisible();
	});

	test('does not offer the current user as a challenge target', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('mock friends list excludes self');

		const alice = await asUser({ id: 'user-a', username: 'alice' });
		alice.friends = ['user-b'];
		await mockApi.registerUser(alice);
		await mockApi.registerUser(friendFixture('user-b', 'bob', '2026-07-01T00:00:00.000Z'));

		await mockApi.setActiveQuest(null);
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/current\/friends/,
			body: paginate([friendFixture('user-b', 'bob', '2026-07-01T00:00:00.000Z')]),
			once: false
		});
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/current\/circle/,
			body: paginate([]),
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/quests');

		await page.locator('#challenge-friend-trigger').click();
		const list = page.locator('#challenge-friend-list');
		await expect(list).toBeVisible({ timeout: 12_000 });

		await expect(list.locator('ion-item[data-username="bob"]')).toBeVisible();
		// the friends endpoint never returns self, so the picker never lists the current user
		await expect(list.locator('ion-item[data-username="alice"]')).toHaveCount(0);
	});
});
