import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	expectStepCompleteToast,
	gotoQuestStep,
	seedSingleStepQuest,
	stepModal
} from './utils/quest-helpers';

test.describe('Quest step: transcribe_audio (native)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'android' });
	});

	test('the native recorder mounts into the ready stage', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'recorder' });
		const questId = await seedSingleStepQuest(mockApi, 'transcribe_audio');
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// native + granted mic -> MRecord skips permission stage and shows the meter UI
		await expect(stepModal(page).getByText(/tap to start/i)).toBeVisible({ timeout: 8000 });
	});

	test('recording, stopping, and confirming completes the step', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'recorder2' });
		// minLength 1s so the stop gate opens after a single real-time tick
		const questId = await seedSingleStepQuest(mockApi, 'transcribe_audio', {
			stepOverrides: { parameters: ['', '', 1] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// the Stop button gates on a per-second setInterval; chromium throttles/pauses
		// timers in a non-focused tab under parallel workers, so force this page to the
		// foreground before the timing-sensitive record -> stop window
		await page.bringToFront();

		// tap the round start button (targeted by its aria-label, not "first enabled
		// button" which would match the modal's Close button in the header)
		await expect(stepModal(page).getByText(/tap to start/i)).toBeVisible({ timeout: 8000 });
		const startBtn = stepModal(page).getByRole('button', { name: /start recording/i });
		await expect(startBtn).toBeEnabled({ timeout: 8000 });
		await startBtn.click();

		// entering the recording stage swaps in the Stop button; wait for it to exist
		// (the elapsed timer must tick past minLength=1s before it enables)
		const stopBtn = stepModal(page).getByRole('button', { name: /stop recording/i });
		await expect(stopBtn).toBeVisible({ timeout: 8000 });
		await expect(stopBtn).toBeEnabled({ timeout: 12_000 });
		await stopBtn.click();

		// stopRecording -> preview stage with Retake/Confirm
		const confirm = stepModal(page).getByRole('button', { name: /^confirm$/i });
		await expect(confirm).toBeVisible({ timeout: 8000 });
		await confirm.click();

		await expectStepCompleteToast(page);
	});
});
