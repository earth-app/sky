import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	closeStepModal,
	gotoQuestDetail,
	gotoQuestStep,
	seedStepTypeQuestActive,
	STEP_TYPE_QUEST_ID,
	stepModal
} from './utils/quest-helpers';

test.describe('Quest navigation flow', () => {
	test.beforeEach(async ({ context }) => {
		// Dialog.confirm + Toast.show capture need the native bridge shim
		await installNativeMock(context, { platform: 'ios' });
	});

	test('opening a quest detail renders the timeline and its steps', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'navigator' });
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestDetail(page, gotoHydrated, STEP_TYPE_QUEST_ID);

		await expect(page.locator('#tile-0')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#tile-end')).toBeVisible();
		// active quest surfaces the End Quest control
		await expect(page.locator('#quest-button')).toHaveText(/end quest/i, { timeout: 12_000 });
	});

	test('opening a step then closing returns to the timeline (back path)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'navback' });
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestDetail(page, gotoHydrated, STEP_TYPE_QUEST_ID);

		// tap the current tile; LazyUBadge hydrate-on-visible can miss, so fall back to a deep link
		const tile = page.locator('#tile-0\\:0');
		await tile.scrollIntoViewIfNeeded();
		await tile.click();
		const opened = await stepModal(page)
			.waitFor({ state: 'visible', timeout: 8000 })
			.then(() => true)
			.catch(() => false);
		if (!opened) await gotoQuestStep(page, gotoHydrated, STEP_TYPE_QUEST_ID, 0);
		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });

		await closeStepModal(page);

		// modal dismissed and the timeline behind it is intact (not stranded in <Loading>)
		await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 8000 });
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 8000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});

	test('deep-linking ?step=N opens that step directly', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'deeplinker' });
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestStep(page, gotoHydrated, STEP_TYPE_QUEST_ID, 0);

		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });
		// modal header labels the opened step (1-based)
		await expect(
			stepModal(page)
				.getByText(/step #1/i)
				.first()
		).toBeVisible({ timeout: 8000 });
	});

	test('closing a deep-linked step leaves the timeline mounted', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'deeplinkback' });
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestStep(page, gotoHydrated, STEP_TYPE_QUEST_ID, 0);
		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });

		await closeStepModal(page);
		await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 8000 });
		await expect(page.locator('#tile-0')).toBeVisible({ timeout: 8000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});
});
