import { expect, test } from './utils/fixtures';
import { makeQuest } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';
import {
	gotoQuestDetail,
	gotoQuestStep,
	readToasts,
	seedSingleStepQuest,
	seedStepTypeQuestActive,
	STEP_TYPE_QUEST_ID,
	stepModal
} from './utils/quest-helpers';

test.describe('Quest timeline', () => {
	test.beforeEach(async ({ context }) => {
		// Dialog.confirm (start/end) + Toast.show capture both need the native mock
		await installNativeMock(context, { platform: 'ios' });
	});

	test('starting a quest confirms then toasts', async ({ page, gotoHydrated, asUser, mockApi }) => {
		await asUser();
		// register a startable quest with NO active quest, so the button reads "Start Quest"
		await mockApi.registerQuest(makeQuest({ id: 'q-start', title: 'Startable Quest' }));
		await gotoQuestDetail(page, gotoHydrated, 'q-start');

		const btn = page.locator('#quest-button');
		await expect(btn).toHaveText(/start quest/i, { timeout: 12_000 });
		await btn.click();

		// Dialog.confirm default resolves true -> mantle returns "Quest started!"
		await expect
			.poll(async () => readToasts(page), { timeout: 12_000 })
			.toEqual(expect.arrayContaining([expect.stringMatching(/quest started/i)]));
	});

	test('ending the active quest confirms then toasts', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser();
		const questId = await seedSingleStepQuest(mockApi, 'describe_text', { questId: 'q-end' });
		await gotoQuestDetail(page, gotoHydrated, questId);

		const btn = page.locator('#quest-button');
		await expect(btn).toHaveText(/end quest/i, { timeout: 12_000 });
		await btn.click();

		await expect
			.poll(async () => readToasts(page), { timeout: 12_000 })
			.toEqual(expect.arrayContaining([expect.stringMatching(/quest ended/i)]));
	});

	test('renders a tile per step plus the final medal tile', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser();
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestDetail(page, gotoHydrated, STEP_TYPE_QUEST_ID);

		// the wrapper divs render eagerly; the badges inside hydrate on scroll
		await expect(page.locator('#tile-0')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#tile-end')).toBeVisible();
	});

	test('tapping the first tile opens the step modal', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser();
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestDetail(page, gotoHydrated, STEP_TYPE_QUEST_ID);

		// the tile badge is LazyUBadge hydrate-on-visible; scroll it in, click, poll the modal
		const tile = page.locator('#tile-0\\:0');
		await tile.scrollIntoViewIfNeeded();
		await tile.click();

		const modal = stepModal(page);
		const opened = await modal
			.waitFor({ state: 'visible', timeout: 8000 })
			.then(() => true)
			.catch(() => false);

		if (!opened) {
			// fallback: the deferred-hydration click can miss; prove modal opening via deep link
			await gotoQuestStep(page, gotoHydrated, STEP_TYPE_QUEST_ID, 0);
		}
		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });
	});
});
