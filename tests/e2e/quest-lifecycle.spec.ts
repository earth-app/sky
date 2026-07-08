import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import type { MockClient } from './utils/mock-client';
import {
	makeQuest,
	makeQuestHistoryEntry,
	makeQuestProgressEntry,
	makeQuestStep
} from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';
import {
	expectStepCompleteToast,
	gotoQuestDetail,
	gotoQuestStep,
	respondNextSubmissionMalformed,
	seedSingleStepQuest,
	stepModal,
	submitDescribeText
} from './utils/quest-helpers';

// the descriptive 5xx copy comes verbatim from MSubmission.vue's describeSubmitFailure()
const FIVE_XX_COPY = /server had a problem saving this step|error 500|progress wasn't lost/i;

// bottom tab order: dashboard, quests, (disabled create fab), discover, profile. a just-dismissed
// step modal can leave the app root aria-hidden, which drops the tab buttons out of the a11y tree,
// so target them with a CSS locator (getByRole('tab') would find nothing) and run the round-trip
// on the quests LIST, which owns the tab bar and never opened a modal.
const TAB_INDEX = { dashboard: 0, quests: 1 } as const;

// one submit fans out to DEFAULT_RETRIES+1 attempts in makeMServerRequest (useServer.ts:41);
// a 5xx is transient so every attempt retries. arm exactly that many one-shot failures so ONE
// user submit fails end to end, then the manual retry falls through to the default (success)
// handler - which advances SERVER progress too, keeping client+server in lockstep for reconcile.
const SUBMIT_MAX_ATTEMPTS = 3;

// the sparkle burst is a short-lived canvas[aria-hidden] inside the open step modal; it mounts
// the instant onStepSubmitted increments the trigger (any validated submit) and motion is allowed
function sparkleCanvas(page: Page) {
	return stepModal(page).locator('canvas[aria-hidden="true"]');
}

async function switchTab(page: Page, tab: keyof typeof TAB_INDEX): Promise<void> {
	await page.locator('ion-tab-button').nth(TAB_INDEX[tab]).click();
}

// in-SPA route change; keeps the pinia store + kept-alive pages warm. gotoHydrated would warm
// at '/' and reload, dropping the in-memory quest progress and defeating the resume assertion.
async function spaGoto(page: Page, path: string): Promise<void> {
	await page.evaluate((p) => (window as any).useNuxtApp?.().$router?.push(p), path);
}

// open the current step by tapping its timeline tile; the badge is a hydrate-on-visible
// LazyUBadge so a click can miss - scroll it in and retry until the modal appears (deep links
// would re-navigate and disturb the kept-alive quest stack, so tapping is the only safe path)
async function openStepTile(page: Page, index: number): Promise<void> {
	const tile = page.locator(`#tile-${index}\\:0`);
	for (let attempt = 0; attempt < 5; attempt++) {
		await tile.scrollIntoViewIfNeeded().catch(() => {});
		await tile.click({ timeout: 3000 }).catch(() => {});
		const opened = await stepModal(page)
			.waitFor({ state: 'visible', timeout: 3500 })
			.then(() => true)
			.catch(() => false);
		if (opened) return;
	}
	await expect(stepModal(page)).toBeVisible({ timeout: 4000 });
}

// intro -> (native-mock scanner auto-resolves the default EAN-13) -> accept
async function scanAndSubmitBarcode(page: Page): Promise<void> {
	await stepModal(page)
		.getByRole('button', { name: /continue/i })
		.click();
	const submit = stepModal(page).getByRole('button', { name: /submit scan/i });
	await expect(submit).toBeVisible({ timeout: 8000 });
	await submit.click();
}

async function failOneSubmit(mockApi: MockClient): Promise<void> {
	for (let i = 0; i < SUBMIT_MAX_ATTEMPTS; i++) {
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/api\/user\/updateQuest/,
			status: 500,
			body: { message: 'Internal Server Error' },
			once: true
		});
	}
}

async function expectModalClosed(page: Page): Promise<void> {
	await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 12_000 });
}

test.describe('Quest lifecycle journey', () => {
	test.beforeEach(async ({ context }) => {
		// android native mock: CapacitorBarcodeScanner auto-resolves, camera perms granted,
		// Toast/Dialog captured. matches the barcode failure-path specs.
		await installNativeMock(context, { platform: 'android' });
	});

	test('start -> two text steps -> a 5xx fail-safe + retry -> tab-away resume -> finish + history', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		// motion allowed so the celebration sparkle actually mounts (and a wrongful one would too)
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await asUser({ username: 'lifecycle' });

		// four steps: two text steps, a barcode that first 5xx-fails then heals, a final barcode.
		// both text steps are describe_text (the only deterministic text submit with a helper).
		const quest = makeQuest({
			id: 'q-lifecycle',
			title: 'Lifecycle Quest',
			reward: 120,
			steps: [
				makeQuestStep('describe_text'),
				makeQuestStep('describe_text'),
				makeQuestStep('scan_barcode'),
				makeQuestStep('scan_barcode')
			]
		});
		await mockApi.registerQuest(quest);
		// no active quest seeded: the user starts it from the timeline button

		await gotoQuestDetail(page, gotoHydrated, quest.id);

		// --- start the quest from the timeline (fresh start needs no confirm) ---
		const questButton = page.locator('#quest-button');
		await expect(questButton).toHaveText(/start quest/i, { timeout: 12_000 });
		await questButton.click();
		await expect(questButton).toHaveText(/end quest/i, { timeout: 12_000 });
		await expect(page.locator('#tile-0')).toHaveClass(/ring-2/, { timeout: 12_000 });

		// --- step 0: describe_text -> validated -> advance ---
		await openStepTile(page, 0);
		await submitDescribeText(page);
		await expectStepCompleteToast(page);
		await expectModalClosed(page);
		await expect(page.locator('#tile-1')).toHaveClass(/ring-2/, { timeout: 8000 });

		// --- step 1: describe_text -> validated -> advance ---
		await openStepTile(page, 1);
		await submitDescribeText(page);
		await expectStepCompleteToast(page);
		await expectModalClosed(page);
		await expect(page.locator('#tile-2')).toHaveClass(/ring-2/, { timeout: 8000 });

		// --- step 2: barcode, forced 5xx first -> fail-safe (no advance, still retryable) ---
		await openStepTile(page, 2);
		await failOneSubmit(mockApi);
		await scanAndSubmitBarcode(page);

		// the reassuring, progress-preserving 5xx copy shows in-modal...
		await expect(page.getByText(FIVE_XX_COPY).first()).toBeVisible({ timeout: 12_000 });
		// ...the celebration did NOT fire...
		await expect(sparkleCanvas(page)).toHaveCount(0);
		// ...the step did NOT advance (a validated submit auto-closes the modal)...
		await expect(page.locator('ion-modal:visible')).toHaveCount(1);
		await expect(page.locator('#tile-2')).toHaveClass(/ring-2/);
		// ...and the barcode step reset to its intro so the user can retry
		await expect(stepModal(page).getByRole('button', { name: /continue/i })).toBeVisible({
			timeout: 8000
		});

		// --- step 2 retry: overrides consumed, default handler validates -> advance to step 3 ---
		await scanAndSubmitBarcode(page);
		await expectStepCompleteToast(page);
		await expectModalClosed(page);
		await expect(page.locator('#tile-3')).toHaveClass(/ring-2/, { timeout: 8000 });

		// --- keep-alive: leave the quest and come back, all IN-SPA so the store stays warm.
		// no PRESENTED modal first (ionic keeps closed ion-modals in the dom; only a visible one
		// keeps the app root aria-hidden, which is what breaks a raw tab query from the detail) ---
		await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 8000 });

		// in-SPA back to the quests list (a tabbed page that owns the bottom tab bar)
		await spaGoto(page, '/tabs/quests');
		await expect(page.locator('#quest-search')).toBeVisible({ timeout: 12_000 });

		// round-trip a tab from the LIST: it must stay populated (kept alive), not reset to a
		// skeleton/empty state - proves the outlet keeps the page across a tab switch (bug A)
		await switchTab(page, 'dashboard');
		await expect(page.locator('#title').first()).toBeVisible({ timeout: 12_000 });
		await switchTab(page, 'quests');
		await expect(page.locator('#quest-search')).toBeVisible({ timeout: 12_000 });

		// re-enter the quest IN-SPA; the warm store + onIonViewWillEnter reconcile must resume it
		// mid-progress on the SAME step, not clobber back to the start (bug G)
		await spaGoto(page, `/tabs/quests/${quest.id}`);
		await expect(page.locator('#quest-button')).toHaveText(/end quest/i, { timeout: 12_000 });
		await expect(page.locator('#tile-3')).toHaveClass(/ring-2/, { timeout: 12_000 });
		// step 0 is not re-ringed (no reset to the start) and earlier progress survived
		await expect(page.locator('#tile-0')).not.toHaveClass(/ring-2/);
		await expect(page.locator('.w-2.min-h-16.bg-primary').first()).toBeVisible({ timeout: 8000 });

		// --- step 3 (final): validated + completed -> quest completes ---
		await openStepTile(page, 3);
		// sparkle is BEST-EFFORT here: on a completing MSubmission step, notifyStepComplete(true)
		// fires the full useQuestCelebration overlay, whose [id].vue watcher closes the step modal
		// before the small in-modal sparkle canvas can attach - so it legitimately may not show.
		// the sparkle is hard-asserted in quest-submission-flow.spec on a non-completing step;
		// here we assert durable COMPLETION state instead.
		const sawSparkle = sparkleCanvas(page)
			.first()
			.waitFor({ state: 'attached', timeout: 6000 })
			.then(() => true)
			.catch(() => false);
		await scanAndSubmitBarcode(page);
		await expectModalClosed(page);

		// durable completion: applyLocalQuestProgress writes a history entry (completedAt) and clears
		// the active quest, so the timeline flips to the disabled "Quest Completed" state. this both
		// proves the history entry exists AND that the final submit validated + advanced after re-entry.
		await expect(page.locator('#quest-button')).toHaveText(/quest completed/i, { timeout: 12_000 });
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 8000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);

		test.info().annotations.push({
			type: 'sparkle (best-effort)',
			description: `final-step in-modal sparkle attached: ${await sawSparkle}`
		});
	});
});

test.describe('Quest lifecycle edge cases', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a malformed submit response fails safe: no false advance, no celebration', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await asUser({ username: 'lifebad' });
		// describe_text exercises the delegated crust child path (distinct from the barcode
		// malformed test in quest-submission-flow): coerceQuestUpdateResult returns null so the
		// child reports not-validated - it must not advance or celebrate
		const questId = await seedSingleStepQuest(mockApi, 'describe_text');
		await respondNextSubmissionMalformed(mockApi);
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await submitDescribeText(page);

		// an error surfaces, the modal stays open on step 0, and nothing celebrates
		await expect(
			page.getByText(/failed to update|could not validate|did not pass validation/i).first()
		).toBeVisible({ timeout: 12_000 });
		await expect(sparkleCanvas(page)).toHaveCount(0);
		await expect(page.locator('ion-modal:visible')).toHaveCount(1);
	});

	test('reopening a COMPLETED quest paints the timeline populated, not an empty flash', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest history + mock backend');
		await asUser({ username: 'lifedone' });

		const quest = makeQuest({
			id: 'q-done',
			title: 'Finished Quest',
			steps: [makeQuestStep('describe_text'), makeQuestStep('describe_text')]
		});
		await mockApi.registerQuest(quest);
		// no active quest; serve a completed history entry WITH progress for the single-entry
		// prefetch [id].vue awaits before opening the progressReady gate (the empty-flash guard)
		const progress = [
			makeQuestProgressEntry({ index: 0, type: 'describe_text' }),
			makeQuestProgressEntry({ index: 1, type: 'describe_text' })
		];
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/quest\/history\/[^/]+$/,
			status: 200,
			body: makeQuestHistoryEntry(quest, { progress }),
			once: false
		});

		await gotoQuestDetail(page, gotoHydrated, quest.id);

		// the timeline renders as completed with progress already filled in (bg-primary connectors),
		// the button reflects the history entry, and it never stalls in Loading
		await expect(page.locator('#quest-button')).toHaveText(/quest completed/i, { timeout: 12_000 });
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 8000 });
		await expect(page.locator('.w-2.min-h-16.bg-primary').first()).toBeVisible({ timeout: 8000 });
		await expect(page.getByAltText('Loading...')).toHaveCount(0);
	});
});
