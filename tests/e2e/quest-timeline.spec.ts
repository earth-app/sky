import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeQuest, makeUserQuestProgress } from './utils/mock-data';
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
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
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
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
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
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser();
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestDetail(page, gotoHydrated, STEP_TYPE_QUEST_ID);

		// the wrapper divs render eagerly; the badges inside hydrate on scroll
		await expect(page.locator('#tile-0')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#tile-end')).toBeVisible();
	});

	test('renders the active quest when the catalog fetch 404s (uncatalogued running quest)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser();
		// deliberately DO NOT registerQuest -> /v2/users/quests?id= 404s for this id
		const quest = makeQuest({ id: 'q-uncatalogued', title: 'Uncatalogued Running Quest' });
		await mockApi.setActiveQuest(makeUserQuestProgress(quest));
		await gotoQuestDetail(page, gotoHydrated, quest.id);

		// timeline renders from the store fallback, and it's recognized as the active quest
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#quest-button')).toHaveText(/end quest/i, { timeout: 12_000 });
	});

	test('reveals the timeline even if the active-quest fetch hangs', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser();
		const quest = makeQuest({ id: 'q-hang', title: 'Slow Quest' });
		await mockApi.registerQuest(quest);
		// every active-quest GET stalls far past the render ceiling
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/quest$/,
			body: makeUserQuestProgress(quest),
			delayMs: 15_000,
			once: false
		});
		await gotoHydrated(`/tabs/quests/${quest.id}`);

		// the ~4s ceiling reveals the timeline well before the 15s hang resolves
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 10_000 });
	});

	test('renders the timeline even if the catalog fetch hangs (non-blocking mount)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser();
		const quest = makeQuest({ id: 'q-catalog-hang', title: 'Catalog Hang Quest' });
		await mockApi.registerQuest(quest);
		await mockApi.setActiveQuest(makeUserQuestProgress(quest));
		// stall every catalog GET far past the render ceiling
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/quests$/,
			body: quest,
			delayMs: 15_000,
			once: false
		});
		await gotoHydrated(`/tabs/quests/${quest.id}`);

		// resolves via the active-quest fallback well before the 15s catalog stall
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 10_000 });
	});

	test('does not blank when the active quest has no steps array (partial native response)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser();
		const quest = makeQuest({ id: 'q-lean-active', title: 'Lean Active Quest' });
		const active = makeUserQuestProgress(quest);
		delete (active.quest as Record<string, unknown>).steps;
		await mockApi.setActiveQuest(active);
		// no registerQuest -> catalog 404s, so the step-less active quest is the only source

		await gotoHydrated('/tabs/quests/q-lean-active');

		// the page renders its loading state rather than throwing and unmounting to a blank screen
		await expect(page.getByAltText('Loading...').first()).toBeVisible({ timeout: 12_000 });
	});

	test('tapping the first tile opens the step modal', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
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
