import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	expectStepCompleteToast,
	gotoQuestStep,
	readToasts,
	respondNextSubmissionRaw,
	seedStepTypeQuestActive,
	stepModal,
	submitDescribeText
} from './utils/quest-helpers';

// step 0 of the every-step-type quest is describe_text, which submits deterministically
// (no camera/audio/native capture), so it is the reliable vehicle for the submit-advance flow
const ERROR_TOAST = /could not validate|error occurred|failed to update|submission failed/i;

test.describe('Quest submission advances the timeline', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a successful submit advances the timeline live and never sticks in Loading', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'advancer' });
		const questId = await seedStepTypeQuestActive(mockApi);
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// step 0 starts as the current (ringed) step
		await expect(page.locator('#tile-0')).toHaveClass(/ring-2/, { timeout: 12_000 });

		await submitDescribeText(page);

		// success feedback fires and the modal auto-closes ~650ms later (no manual close)
		await expectStepCompleteToast(page);
		await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 12_000 });

		// LIVE advance (no reload): the current ring moves to step 1 and step 0's connector fills
		await expect(page.locator('#tile-1')).toHaveClass(/ring-2/, { timeout: 8000 });
		await expect(page.locator('.w-2.min-h-16.bg-primary').first()).toBeVisible({ timeout: 8000 });

		// regression guard: the timeline stays mounted, it does not fall back to <Loading>
		await expect(page.locator('#tile-end')).toBeVisible();
		await expect(page.getByAltText('Loading...')).toHaveCount(0);

		// and no false error toast was raised on the happy path
		const toasts = await readToasts(page);
		expect(toasts.join(' ')).not.toMatch(ERROR_TOAST);
	});

	test('a mangled string-body response is treated as success, not a false error', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'stringbody' });
		const questId = await seedStepTypeQuestActive(mockApi);
		// emulate CapacitorHttp handing back an unparsed JSON string body
		await respondNextSubmissionRaw(mockApi, { shape: 'string' });
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await submitDescribeText(page);

		// tolerant parse -> validated -> step completes and advances, with no error surfaced
		await expectStepCompleteToast(page);
		await expect(page.locator('#tile-1')).toHaveClass(/ring-2/, { timeout: 8000 });
		const toasts = await readToasts(page);
		expect(toasts.join(' ')).not.toMatch(ERROR_TOAST);
	});

	test('a { data } enveloped response is treated as success, not a false error', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		await asUser({ username: 'envbody' });
		const questId = await seedStepTypeQuestActive(mockApi);
		await respondNextSubmissionRaw(mockApi, { shape: 'envelope' });
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await submitDescribeText(page);

		await expectStepCompleteToast(page);
		await expect(page.locator('#tile-1')).toHaveClass(/ring-2/, { timeout: 8000 });
		const toasts = await readToasts(page);
		expect(toasts.join(' ')).not.toMatch(ERROR_TOAST);
	});
});

test.describe('Quest submission celebration', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a successful submit fires the sparkle burst and the connector transition', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');
		// the sparkle canvas only renders when motion is allowed; force it so the burst is observable
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await asUser({ username: 'sparkler' });
		const questId = await seedStepTypeQuestActive(mockApi);
		await gotoQuestStep(page, gotoHydrated, questId, 0);
		await expect(stepModal(page)).toBeVisible({ timeout: 12_000 });

		// the UiSparkleBurst canvas is attached the moment the trigger increments (before the
		// modal auto-closes); catch it on 'attached' so its short lifetime does not race us
		const sawSparkle = stepModal(page)
			.locator('canvas[aria-hidden="true"]')
			.first()
			.waitFor({ state: 'attached', timeout: 8000 })
			.then(() => true)
			.catch(() => false);

		await submitDescribeText(page);

		expect(await sawSparkle).toBe(true);

		// the celebration coincides with the live tile/connector advance
		await expect(page.locator('.w-2.min-h-16.bg-primary').first()).toBeVisible({ timeout: 8000 });
		await expect(page.locator('#tile-1')).toHaveClass(/ring-2/, { timeout: 8000 });
	});
});
