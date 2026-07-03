import { expect, test } from './utils/fixtures';
import { makeBadge, makeQuest, makeQuestStep } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestDetail } from './utils/quest-helpers';

test.describe('Quest health + mastery disclosures', () => {
	test.beforeEach(async ({ context }) => {
		// health disclosure is gated on Capacitor.getPlatform() === 'ios'
		await installNativeMock(context, { platform: 'ios' });
	});

	test('shows the Apple Health disclosure for an inactive distance quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser();
		// registered but not made active -> showHealthDisclosure is true on ios
		await mockApi.registerQuest(
			makeQuest({
				id: 'q-health',
				title: 'Distance Quest',
				steps: [makeQuestStep('distance_covered')]
			})
		);
		await gotoQuestDetail(page, gotoHydrated, 'q-health');

		await expect(page.getByText(/apple health/i).first()).toBeVisible({ timeout: 12_000 });
	});

	test('shows the Badge Mastery warning for an uncompleted mastery quest', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		const u = await asUser();
		// mastery id is badge_mastery_<badgeId>; masteryBadge resolves off the user's badges
		await mockApi.set({
			backend: 'cloud',
			method: 'GET',
			path: /^\/v1\/users\/[^/]+\/badges/,
			body: [makeBadge({ id: 'b-1', user_id: u.id })],
			once: false
		});
		await mockApi.registerQuest(
			makeQuest({
				id: 'badge_mastery_b-1',
				title: 'Master First Steps',
				steps: [makeQuestStep('describe_text')]
			})
		);
		await gotoQuestDetail(page, gotoHydrated, 'badge_mastery_b-1');

		await expect(page.getByText(/badge mastery quest/i).first()).toBeVisible({ timeout: 12_000 });
	});
});
