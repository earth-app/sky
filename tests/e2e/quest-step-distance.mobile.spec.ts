import { expect, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import { firePedometer, gotoQuestStep, seedSingleStepQuest } from './utils/quest-helpers';

test.describe('Quest step: distance_covered (native)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'android' });
	});

	test('pedometer progress accrues and the goal-reached state appears', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'walker' });
		// 1km goal so a single 1km pedometer event reaches the goal
		const questId = await seedSingleStepQuest(mockApi, 'distance_covered', {
			stepOverrides: { parameters: [1000] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// start tracking (native => button enabled, no "mobile app only" gate)
		await page.getByRole('button', { name: /start tracking/i }).click();
		await expect(page.getByText(/tracking active/i)).toBeVisible({ timeout: 8000 });

		// drive the pedometer past the goal
		await firePedometer(page, 1100);

		// reaching the goal flips the step to Goal Reached / Step Complete; a single-step
		// quest auto-submits and can race straight into the Quest Complete overlay, so
		// accept either the in-step goal state or the completion celebration
		await expect(page.getByText(/goal reached|step complete|quest complete/i).first()).toBeVisible({
			timeout: 8000
		});
	});
});

// platform-contrast: no native mock at all, so @capacitor/core runs its normal web
// detection (isNativePlatform() === false in a plain chromium) and MDistance shows
// the mobile-only notice. installing the native mock would set CapacitorCustomPlatform,
// which forces core's getPlatform() to report native and can't be undone by a later
// window.Capacitor override
test.describe('Quest step: distance_covered (non-native web)', () => {
	test('a non-native browser shows the mobile-only notice (platform contrast)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'webwalker' });
		const questId = await seedSingleStepQuest(mockApi, 'distance_covered', {
			stepOverrides: { parameters: [1000] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await expect(page.getByText(/distance tracking only works in the mobile app/i)).toBeVisible({
			timeout: 8000
		});
	});
});
