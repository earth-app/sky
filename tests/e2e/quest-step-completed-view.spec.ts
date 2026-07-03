import { expect, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestStep, seedSingleStepQuest, stepModal } from './utils/quest-helpers';

test.describe('Quest step: completed view', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a pre-completed describe_text step shows the completed recap', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'finisher' });
		const questId = await seedSingleStepQuest(mockApi, 'describe_text', {
			progress: [
				{ type: 'describe_text', index: 0, submittedAt: Date.now(), text: 'my saved answer' }
			]
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await expect(stepModal(page).getByText(/already completed/i)).toBeVisible({ timeout: 12_000 });
		await expect(stepModal(page).getByText(/my saved answer/i)).toBeVisible();
	});
});
