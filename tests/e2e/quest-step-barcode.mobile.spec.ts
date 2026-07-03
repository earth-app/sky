import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import {
	expectStepCompleteToast,
	gotoQuestStep,
	seedSingleStepQuest,
	stepModal
} from './utils/quest-helpers';

test.describe('Quest step: scan_barcode (native)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'android' });
	});

	test('scanning an allowed retail barcode completes the step', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'scanner' });
		const questId = await seedSingleStepQuest(mockApi, 'scan_barcode');
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// intro -> native mock scanner auto-resolves the default EAN-13 -> preview
		await stepModal(page)
			.getByRole('button', { name: /continue/i })
			.click();

		// preview stage exposes the accept control by aria-label
		const submit = stepModal(page).getByRole('button', { name: /submit scan/i });
		await expect(submit).toBeVisible({ timeout: 8000 });
		await submit.click();

		await expectStepCompleteToast(page);
	});

	test('a QR result is rejected for the food kind (format gate)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'scanner2' });
		const questId = await seedSingleStepQuest(mockApi, 'scan_barcode');
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// force a QR (format 0) which is not an allowed retail format for food
		await page.evaluate(() => (window as any).__setBarcodeResult({ ScanResult: 'ABC', format: 0 }));

		await stepModal(page)
			.getByRole('button', { name: /continue/i })
			.click();

		await expect(page.getByText(/scan unavailable/i)).toBeVisible({ timeout: 8000 });
	});
});
