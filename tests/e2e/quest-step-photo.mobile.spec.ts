import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	expectStepCompleteToast,
	gotoQuestStep,
	seedSingleStepQuest,
	stepModal
} from './utils/quest-helpers';

test.describe('Quest step: take_photo_location (native)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'android' });
	});

	test('capturing and accepting a photo completes the step', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'shooter' });
		const questId = await seedSingleStepQuest(mockApi, 'take_photo_location');
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// intro (permission stage) -> Continue kicks Camera.takePhoto -> preview
		await stepModal(page)
			.getByRole('button', { name: /continue/i })
			.click();

		// preview stage exposes the accept control by aria-label
		const accept = stepModal(page).getByRole('button', { name: /accept photo/i });
		await expect(accept).toBeVisible({ timeout: 8000 });
		await accept.click();

		await expectStepCompleteToast(page);
	});
});
