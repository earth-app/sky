import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestStep, seedSingleStepQuest, stepModal } from './utils/quest-helpers';

// The two new v0.6.0 cloud step types (nature_minutes, trailmarker_added) are validated server-side
// and have no interactive client submission, so MSubmission must render them via its passive
// fallback branch ("completed through its dedicated interface") rather than crashing on an
// unrecognized type. The published crust QuestStepType union does not know these types yet, so this
// is the graceful-unknown-type guard.

const PASSIVE_STEP_TYPES = ['nature_minutes', 'trailmarker_added'] as const;

test.describe('Passive quest step types render gracefully (mobile)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	for (const type of PASSIVE_STEP_TYPES) {
		test(`${type} opens without crashing and shows the passive completion notice`, async ({
			page,
			asUser,
			mockApi,
			gotoHydrated
		}) => {
			skipIfIntegration('seeds a single-step quest with a passive step type');
			await asUser({ username: `passive-${type.slice(0, 6)}` });

			const questId = await seedSingleStepQuest(mockApi, type);
			await gotoQuestStep(page, gotoHydrated, questId, 0);

			// the step modal opens and falls through to the passive branch (no error alert)
			await expect(
				stepModal(page).getByText('This step is completed through its dedicated interface.')
			).toBeVisible({ timeout: 12000 });
		});
	}
});
