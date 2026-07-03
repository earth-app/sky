import { expect, test } from './utils/fixtures';
import { makeQuest, makeQuestStep, makeUserQuestProgress } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestStep, stepModal } from './utils/quest-helpers';

test.describe('Quest step: article_read_time (progress)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('the read-time progress view shows accrued time toward the goal', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'reader' });

		const questId = 'q-article_read_time';
		const quest = makeQuest({
			id: questId,
			title: 'article_read_time quest',
			steps: [makeQuestStep('article_read_time', { parameters: ['', 120] })]
		});
		await mockApi.registerQuest(quest);
		// active quest with a half-way read-time entry (60s of a 120s goal)
		await mockApi.setActiveQuest(
			makeUserQuestProgress(quest, {
				progress: [],
				activeReadTime: [{ stepIndex: 0, accumulatedSeconds: 60, targetSeconds: 120 }]
			})
		);

		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await expect(stepModal(page).getByText(/keep reading/i)).toBeVisible({ timeout: 12_000 });
		await expect(stepModal(page).getByText(/read/i).first()).toBeVisible();
		await expect(stepModal(page).getByText(/goal/i).first()).toBeVisible();
	});
});
