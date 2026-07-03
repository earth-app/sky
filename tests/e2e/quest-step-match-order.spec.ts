import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	gotoQuestStep,
	seedStepTypeQuestUpTo,
	STEP_TYPE_INDEX,
	stepModal
} from './utils/quest-helpers';

test.describe('Quest step: match_terms + order_items (timed drag)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('order_items opens with its countdown or board', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		const items = STEP_TYPE_INDEX.order_items;
		if (!items) throw new Error('STEP_TYPE_INDEX.order_items is undefined');

		await asUser({ username: 'orderer' });

		// complete steps 0..0 so index 1 (order_items) is the current unlocked step
		const questId = await seedStepTypeQuestUpTo(mockApi, items);
		await gotoQuestStep(page, gotoHydrated, questId, items);

		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });
		// countdown digit OR the step description OR the board's Items/Order lanes
		const surface = stepModal(page)
			.getByText(/^[123]$|order the steps|\bitems\b|\border\b/i)
			.first();
		await expect(surface).toBeVisible({ timeout: 8000 });
	});

	test('match_terms opens with its countdown or board', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		const items = STEP_TYPE_INDEX.match_terms;
		if (!items) throw new Error('STEP_TYPE_INDEX.match_terms is undefined');

		await asUser({ username: 'matcher' });

		// complete steps 0..1 so index 2 (match_terms) is the current unlocked step
		const questId = await seedStepTypeQuestUpTo(mockApi, items);
		await gotoQuestStep(page, gotoHydrated, questId, items);

		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });
		// countdown digit OR the step description text
		const surface = stepModal(page)
			.getByText(/^[123]$|match the terms|\bterms?\b/i)
			.first();
		await expect(surface).toBeVisible({ timeout: 8000 });
	});
});
