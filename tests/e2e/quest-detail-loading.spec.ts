import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeQuest, makeQuestProgressEntry } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestDetail } from './utils/quest-helpers';

// regression: an UNCOMPLETED, NON-CURRENT quest (catalog-only, or a history entry with progress
// but no completedAt, or a lean history entry) must always resolve out of <Loading> and render
// the timeline. previously a lean/poisoned catalog cache could wedge quest resolution and the
// gate never settled.
test.describe('Quest detail resolves out of Loading', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a catalog quest that is not current and not in history renders the timeline', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'catalogonly' });
		// register in the catalog only: no active quest, no history entry (single endpoint 404s)
		await mockApi.registerQuest(makeQuest({ id: 'q-catalog-only', title: 'Catalog Only Quest' }));
		await gotoQuestDetail(page, gotoHydrated, 'q-catalog-only');

		// timeline renders in its not-started state (Start Quest), never stranded in <Loading>
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#quest-button')).toHaveText(/start quest/i, { timeout: 12_000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});

	test('an uncompleted history entry (progress present, no completedAt) renders the timeline', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'uncompletedhist' });
		const quest = makeQuest({ id: 'q-uncompleted-hist', title: 'Uncompleted History Quest' });
		await mockApi.registerQuest(quest);
		// single history entry: has progress on step 0 but NO completedAt (uncompleted)
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/quest\/history\/q-uncompleted-hist\/?$/,
			body: {
				quest,
				questId: quest.id,
				progress: [makeQuestProgressEntry({ type: 'describe_text', index: 0 })]
			},
			once: false
		});
		await gotoQuestDetail(page, gotoHydrated, quest.id);

		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 12_000 });
		// not current and not completed -> the timeline offers Start Quest
		await expect(page.locator('#quest-button')).toHaveText(/start quest/i, { timeout: 12_000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});

	test('a lean history entry (no progress) still renders the timeline', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'leanhist' });
		const quest = makeQuest({ id: 'q-lean-hist', title: 'Lean History Quest' });
		await mockApi.registerQuest(quest);
		// lean entry: quest present but no progress and no completedAt (the class that could wedge
		// progressReadyBase); the catalog fetch + progressChecked must still resolve the gate
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/quest\/history\/q-lean-hist\/?$/,
			body: { quest, questId: quest.id },
			once: false
		});
		await gotoQuestDetail(page, gotoHydrated, quest.id);

		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});

	test('a step-less cached catalog quest is force-refetched and renders', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'poisonedcatalog' });
		const quest = makeQuest({ id: 'q-poisoned-catalog', title: 'Poisoned Catalog Quest' });
		// FIRST /v2/users/quests fetch (the ?id= single-quest call is the page's first hit to this
		// pathname) returns a step-less body so the client caches it lean; the once-override then
		// clears and the forced (cache-busting) refetch reads the real quest with steps
		const leanQuest = { ...quest };
		delete (leanQuest as Record<string, unknown>).steps;
		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/quests\/?$/,
			body: leanQuest,
			once: true
		});
		await mockApi.registerQuest(quest);
		await gotoQuestDetail(page, gotoHydrated, quest.id);

		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});
});
