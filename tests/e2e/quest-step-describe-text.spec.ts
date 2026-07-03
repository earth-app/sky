import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	expectStepCompleteToast,
	gotoQuestStep,
	rejectNextSubmission,
	seedSingleStepQuest,
	submitDescribeText
} from './utils/quest-helpers';

test.describe('Quest step: describe_text', () => {
	test.beforeEach(async ({ context }) => {
		// install native mock so Toast.show is captured into __toasts
		await installNativeMock(context, { platform: 'ios' });
	});

	test('submitting a valid response completes the step', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'writer1' });
		const questId = await seedSingleStepQuest(mockApi, 'describe_text');
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// the child enforces a 200-char floor; submitDescribeText fills a long-enough answer
		await submitDescribeText(page);

		await expectStepCompleteToast(page);
	});

	test('a rejected submission surfaces the in-modal error', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'writer2' });
		const questId = await seedSingleStepQuest(mockApi, 'describe_text');
		await rejectNextSubmission(mockApi, 'That response did not pass validation.');
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// fill a valid-length answer so submit is enabled; the mock rejects the submission
		await submitDescribeText(page);

		await expect(page.getByText(/did not pass validation|could not validate/i).first()).toBeVisible(
			{
				timeout: 8000
			}
		);
	});
});
