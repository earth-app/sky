import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import type { MockClient } from './mock-client';
import { makeQuest, makeQuestStep, makeUserQuestProgress, type QuestStepType } from './mock-data';

export const STEP_TYPE_QUEST_ID = 'q-steptypes';

/** index of each step type inside the seeded q-steptypes quest. */
export const STEP_TYPE_INDEX: Record<string, number> = {
	describe_text: 0,
	order_items: 1,
	match_terms: 2,
	article_quiz: 3,
	respond_to_prompt: 4,
	attend_event: 5,
	article_read_time: 6,
	draw_picture: 7,
	take_photo_location: 8,
	transcribe_audio: 9,
	distance_covered: 10,
	scan_barcode: 11
};

export async function seedSingleStepQuest(
	mockApi: MockClient,
	type: QuestStepType,
	opts: { questId?: string; stepOverrides?: Record<string, any>; progress?: any[] } = {}
): Promise<string> {
	const questId = opts.questId ?? `q-${type}`;
	const quest = makeQuest({
		id: questId,
		title: `${type} quest`,
		steps: [makeQuestStep(type, opts.stepOverrides ?? {})]
	});
	await mockApi.registerQuest(quest);
	await mockApi.setActiveQuest(makeUserQuestProgress(quest, { progress: opts.progress ?? [] }));
	return questId;
}

/**
 * Make the shared every-step-type quest (`q-steptypes`) the active quest with
 * the given progress. Lets a spec target any step by its STEP_TYPE_INDEX.
 */
export async function seedStepTypeQuestActive(
	mockApi: MockClient,
	opts: { progress?: any[]; currentStepIndex?: number } = {}
): Promise<string> {
	// the catalog already holds q-steptypes; mark it active for this test
	const quest = makeQuest({
		id: STEP_TYPE_QUEST_ID,
		title: 'Every Step Type',
		steps: Object.keys(STEP_TYPE_INDEX)
			.sort((a, b) => STEP_TYPE_INDEX[a]! - STEP_TYPE_INDEX[b]!)
			.map((t) => makeQuestStep(t as QuestStepType))
	});
	await mockApi.registerQuest(quest);
	await mockApi.setActiveQuest(
		makeUserQuestProgress(quest, {
			progress: opts.progress ?? [],
			...(opts.currentStepIndex !== undefined ? { currentStepIndex: opts.currentStepIndex } : {})
		})
	);
	return STEP_TYPE_QUEST_ID;
}

/**
 * Navigate to a quest detail page and wait for the timeline to render (the
 * Start/End button is the most reliable timeline marker).
 */
export async function gotoQuestDetail(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>,
	questId: string
): Promise<void> {
	await gotoHydrated(`/tabs/quests/${questId}`);
	await expect(page.locator('#quest-button')).toBeVisible({ timeout: 12_000 });
}

/**
 * Open a quest detail page directly at a given step via the ?step= deep link,
 * which opens the step modal without needing to tap a timeline tile (more
 * robust than clicking a lazily-hydrated UBadge). `alt` opens an alt-step.
 */
export async function gotoQuestStep(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>,
	questId: string,
	stepIndex: number,
	alt?: number
): Promise<void> {
	const altQs = alt !== undefined ? `&alt=${alt}` : '';
	await gotoHydrated(`/tabs/quests/${questId}?step=${stepIndex}${altQs}`);
	await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });
}

/** The open step modal (Ionic renders it into an ion-modal element). */
export function stepModal(page: Page) {
	return page.locator('ion-modal:visible').first();
}

/** Close the open step modal via its red close button. */
export async function closeStepModal(page: Page): Promise<void> {
	await page.getByRole('button', { name: /close quest step/i }).click();
}

/** Tap a timeline tile by step index (and optional alt index). */
export async function clickTimelineTile(page: Page, index: number, alt = 0): Promise<void> {
	await page.locator(`#tile-${index}\\:${alt}`).click();
}

/**
 * Assert the step modal currently shows the "already completed" success state.
 * Used after a successful submission once the modal re-renders the entry, or for
 * pre-seeded completed steps.
 */
export async function expectStepCompleted(page: Page): Promise<void> {
	await expect(page.getByText(/already completed|step complete/i).first()).toBeVisible({
		timeout: 12_000
	});
}

/**
 * Assert a step-completion toast fired. notifyStepComplete in MSubmission shows
 * "Step complete!" (optionally with bonus points or "Quest Complete!").
 */
export async function expectStepCompleteToast(page: Page, timeoutMs = 12_000): Promise<void> {
	// completion shows a "Step/Quest complete!" toast AND closes the step modal ~650ms later.
	// the modal-close can race the toast read, so accept either signal: a matching toast, or
	// the step modal having closed (the step advanced). poll both.
	// image steps (take_photo/draw) run client image moderation first, which can burn the full
	// 8s fail-open timeout under a throttled CI mobile-chromium, so those callers pass a longer cap
	await expect
		.poll(
			async () => {
				const toasts = await readToasts(page);
				if (toasts.some((t) => /step complete|quest complete/i.test(t))) return true;
				// modal gone => the submission was accepted and the step advanced
				const modalOpen = await page.locator('ion-modal:visible').count();
				return modalOpen === 0;
			},
			{ timeout: timeoutMs }
		)
		.toBe(true);
}

/**
 * Force a quest-step submission to be rejected by the backend, so a spec can
 * assert the in-modal error path. Registers a one-shot override that returns
 * `{ validated: false }` for the next updateQuest POST.
 */
export async function rejectNextSubmission(
	mockApi: MockClient,
	message = 'We could not validate that submission. Please try again.'
): Promise<void> {
	await mockApi.set({
		backend: 'mantle',
		method: 'POST',
		path: /^\/api\/user\/updateQuest/,
		status: 200,
		body: { validated: false, completed: false, message },
		once: true
	});
}

// android default stride the tracker uses to convert cumulative steps -> meters
// (DEFAULT_STRIDE_M in useHealthKit.ts); keep in sync if that constant changes
const DEFAULT_STRIDE_M = 0.762;

/**
 * Drive the native pedometer so MDistance accumulates distance toward its goal.
 *
 * The LIVE `measurement` listener is delta-based and speed-clamped (MAX_SPEED_MPS),
 * so a single event can never jump 1km in test time. The android history path
 * (readPedometerHistory) is not clamped: it anchors on cumulativeSteps at start and
 * accrues `(current - anchor) * stride`. So we set the cumulative step counter high
 * enough to cover `distanceMeters` then fire an appStateChange, which triggers
 * syncFromBackground -> the history read -> progress jumps to the goal.
 *
 * Native-mock (android) must be installed and the tracker already started.
 */
export async function firePedometer(page: Page, distanceMeters: number): Promise<void> {
	await page.evaluate(
		({ steps }) => {
			const w = window as any;
			w.__setPedometerSteps?.(steps);
			// appStateChange(active) -> onAppStateChange -> syncFromBackground (history path)
			w.__fireAppState?.(true);
		},
		{ steps: Math.ceil(distanceMeters / DEFAULT_STRIDE_M) + 1 }
	);
}

/**
 * Read the toast log recorded by native-mock. Convenience for specs asserting on
 * Capacitor Toast.show output.
 */
export async function readToasts(page: Page): Promise<string[]> {
	// tolerate a navigation destroying the execution context mid-read
	try {
		return await page.evaluate(() => (window as any).__toasts ?? []);
	} catch {
		return [];
	}
}

/**
 * A response long enough to pass the describe_text child's minimum-length gate.
 * crust Text.vue enforces a 200-char floor by default (parameters[2] can lower it
 * but never below the cloud TEXT_FLOOR of 50), so specs that don't override the
 * step params must submit at least this much text or the Submit button stays
 * disabled. Repeating a sentence keeps it readable and comfortably over 200.
 */
export const LONG_DESCRIBE_TEXT =
	'A calm river winds through a green valley at dawn while mist lifts off the water and birds begin to call from the tall reeds along the bank. ' +
	'The light warms the hills slowly and the whole scene feels quiet and alive at once.';

/**
 * Fill and submit the describe_text child inside the open step modal. Targets the
 * textarea by its placeholder and clicks the "Submit" button. Defaults to a
 * long-enough response so the length gate passes.
 */
export async function submitDescribeText(page: Page, text = LONG_DESCRIBE_TEXT): Promise<void> {
	const field = stepModal(page)
		.getByPlaceholder(/type your answer/i)
		.first();
	await field.click();
	// type instead of fill so the child's v-model + length gate (canSubmit) react per keystroke;
	// a bulk fill can leave the computed stale so the submit no-ops on the first click
	await field.fill('');
	await field.pressSequentially(text.slice(0, 60));
	await field.fill(text);
	const submit = stepModal(page)
		.getByRole('button', { name: /^submit$/i })
		.first();
	// wait until the length gate enables the button before clicking
	await expect(submit).toBeEnabled({ timeout: 8000 });
	await submit.click();
}

/**
 * Seed the every-step-type quest (`q-steptypes`) as the active quest with the
 * first N steps pre-completed, so a spec can target step index N as the current
 * unlocked step. Returns the quest id.
 */
export async function seedStepTypeQuestUpTo(
	mockApi: MockClient,
	completedThrough: number
): Promise<string> {
	const progress = Array.from({ length: completedThrough }, (_, i) => ({
		type: Object.keys(STEP_TYPE_INDEX).find((k) => STEP_TYPE_INDEX[k] === i) ?? 'describe_text',
		index: i,
		submittedAt: Date.now()
	}));
	return seedStepTypeQuestActive(mockApi, {
		progress,
		currentStepIndex: completedThrough
	});
}
