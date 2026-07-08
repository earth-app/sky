import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	expectStepCompleteToast,
	failNextSubmission,
	gotoQuestDetail,
	gotoQuestStep,
	readToasts,
	respondNextSubmissionMalformed,
	seedSingleStepQuest,
	seedStepTypeQuestActive,
	STEP_TYPE_QUEST_ID,
	stepModal,
	submitDescribeText
} from './utils/quest-helpers';

// the descriptive 5xx copy comes verbatim from MSubmission.vue's describeSubmitFailure()
const FIVE_XX_COPY = /server had a problem saving this step|error 500|progress wasn't lost/i;
// any success/celebration toast the flow must NOT raise on a failed submit
const SUCCESS_TOAST = /step complete|quest complete/i;
const ERROR_TOAST =
	/could not validate|error occurred|failed to update|submission failed|server had a problem/i;

// the sparkle burst is a short-lived canvas[aria-hidden] inside the open step modal; it only
// mounts when the celebration trigger increments (a validated submit) AND motion is allowed
function sparkleCanvas(page: Page) {
	return stepModal(page).locator('canvas[aria-hidden="true"]');
}

/**
 * Drive the native barcode step end-to-end: intro -> (mock scanner auto-resolves the default
 * EAN-13) -> preview -> accept. describe_text delegates submission to the crust Text child, so
 * it never reaches MSubmission's own describeSubmitFailure path; scan_barcode goes straight
 * through submitStepResponse(), which is the code the fail-safe fixes actually live in, and the
 * native-mock resolves the scanner deterministically (no real camera).
 */
async function scanAndSubmitBarcode(page: Page): Promise<void> {
	await stepModal(page)
		.getByRole('button', { name: /continue/i })
		.click();
	const submit = stepModal(page).getByRole('button', { name: /submit scan/i });
	await expect(submit).toBeVisible({ timeout: 8000 });
	await submit.click();
}

test.describe('Quest submission flow: happy path', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('clicking a timeline step, submitting, fires the celebration and advances the timeline', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		// the sparkle canvas is gated on allowed motion; force it so the burst is observable
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await asUser({ username: 'flowhappy' });
		await seedStepTypeQuestActive(mockApi);
		await gotoQuestDetail(page, gotoHydrated, STEP_TYPE_QUEST_ID);

		// step 0 (describe_text) starts as the current (ringed) step
		await expect(page.locator('#tile-0')).toHaveClass(/ring-2/, { timeout: 12_000 });

		// open via the REAL timeline click path (select-step -> modal). the tile badge is a
		// hydrate-on-visible LazyUBadge, so a click can miss; fall back to the ?step deep link.
		const tile = page.locator('#tile-0\\:0');
		await tile.scrollIntoViewIfNeeded();
		await tile.click();
		const openedByClick = await stepModal(page)
			.waitFor({ state: 'visible', timeout: 8000 })
			.then(() => true)
			.catch(() => false);
		if (!openedByClick) await gotoQuestStep(page, gotoHydrated, STEP_TYPE_QUEST_ID, 0);
		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });

		// arm the sparkle catch BEFORE submitting - the canvas is attached the instant the
		// trigger increments and torn down when the modal auto-closes ~650ms later
		const sawSparkle = sparkleCanvas(page)
			.first()
			.waitFor({ state: 'attached', timeout: 8000 })
			.then(() => true)
			.catch(() => false);

		await submitDescribeText(page);

		// success feedback fired...
		await expectStepCompleteToast(page);
		// ...the celebration/confetti burst rendered...
		expect(await sawSparkle).toBe(true);
		// ...the modal auto-closed...
		await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 12_000 });
		// ...and the timeline advanced live: the current ring moved to step 1
		await expect(page.locator('#tile-1')).toHaveClass(/ring-2/, { timeout: 8000 });
		// no false error toast on the happy path
		const toasts = await readToasts(page);
		expect(toasts.join(' ')).not.toMatch(ERROR_TOAST);
	});
});

test.describe('Quest submission flow: failure edge cases', () => {
	test.beforeEach(async ({ context }) => {
		// android native mock so CapacitorBarcodeScanner auto-resolves + camera perms are granted
		await installNativeMock(context, { platform: 'android' });
	});

	test('a 5xx keeps the flow safe: reassuring error, no celebration, no advance, still retryable', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		// motion allowed so that IF a celebration wrongly fired, the sparkle canvas WOULD mount -
		// makes the "no sparkle" assertion meaningful rather than vacuous
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await asUser({ username: 'flow5xx' });
		const questId = await seedSingleStepQuest(mockApi, 'scan_barcode');
		await failNextSubmission(mockApi, { status: 500 });
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await scanAndSubmitBarcode(page);

		// the descriptive, reassuring 5xx copy is shown in-modal
		await expect(page.getByText(FIVE_XX_COPY).first()).toBeVisible({ timeout: 12_000 });
		// the celebration/confetti did NOT fire
		await expect(sparkleCanvas(page)).toHaveCount(0);
		// the step did NOT advance: the modal is still open (a validated submit auto-closes it)
		await expect(page.locator('ion-modal:visible')).toHaveCount(1);
		// the modal stays usable - the barcode step reset to its intro so the user can retry
		await expect(stepModal(page).getByRole('button', { name: /continue/i })).toBeVisible({
			timeout: 8000
		});
		// no success toast was raised
		const toasts = await readToasts(page);
		expect(toasts.join(' ')).not.toMatch(SUCCESS_TOAST);
	});

	test('a 4xx surfaces the server reason, not a raw status code, and does not celebrate', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await asUser({ username: 'flow4xx' });
		const questId = await seedSingleStepQuest(mockApi, 'scan_barcode');
		const reason = 'That barcode is not on the allowed list.';
		await failNextSubmission(mockApi, { status: 400, message: reason });
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await scanAndSubmitBarcode(page);

		// the server's short reason is surfaced verbatim...
		await expect(page.getByText(reason).first()).toBeVisible({ timeout: 12_000 });
		// ...never a raw "[400] /api/..." string
		await expect(page.getByText(/^\[400\]/)).toHaveCount(0);
		await expect(page.getByText(/\/api\/user\/updateQuest/)).toHaveCount(0);
		// no celebration on a client error
		await expect(sparkleCanvas(page)).toHaveCount(0);
		const toasts = await readToasts(page);
		expect(toasts.join(' ')).not.toMatch(SUCCESS_TOAST);
	});

	test('a malformed response fails safe: no crash, no false celebration', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await asUser({ username: 'flowbad' });
		const questId = await seedSingleStepQuest(mockApi, 'scan_barcode');
		// a 200 whose body cannot be coerced to a validated result
		await respondNextSubmissionMalformed(mockApi);
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await scanAndSubmitBarcode(page);

		// the client neither crashes nor falsely celebrates: no sparkle, no success toast, and the
		// step modal is still there and usable (the validation-fallback error keeps it open)
		await expect(stepModal(page).getByRole('button', { name: /continue/i })).toBeVisible({
			timeout: 12_000
		});
		await expect(sparkleCanvas(page)).toHaveCount(0);
		await expect(page.locator('ion-modal:visible')).toHaveCount(1);
		const toasts = await readToasts(page);
		expect(toasts.join(' ')).not.toMatch(SUCCESS_TOAST);
	});
});
