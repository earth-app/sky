import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';

// exact strings from the shared useReport REPORT_REASONS (types/report.ts)
const REPORT_REASONS = [
	'Hate speech / slurs',
	'Harassment or bullying',
	'Sexual or pornographic',
	'Violence or threats',
	'Spam or scam',
	'Misinformation',
	'Self-harm',
	'Illegal or dangerous',
	'Other'
];

const HARNESS = '/__test__/widget-harness?report=1';

async function openReportModal(page: import('@playwright/test').Page) {
	await page.locator('[data-testid="report-slot"] ion-button').click();
	const menuSheet = page.locator('ion-action-sheet:not(.select-action-sheet)');
	await expect(menuSheet).toBeVisible({ timeout: 8000 });
	await menuSheet.locator('button', { hasText: /^Report$/ }).click();
	await expect(page.locator('ion-modal ion-title')).toHaveText(/report prompt/i, { timeout: 8000 });
}

test.describe('Report flow', () => {
	test.beforeEach(async ({ context, asUser }) => {
		await installNativeMock(context, { platform: 'ios' });
		await asUser({ username: 'reporter' });
	});

	test('lists the 9 canonical reasons and posts a report on submit', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('report submission is mock-only');
		await gotoHydrated(HARNESS);
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await openReportModal(page);

		// open the reason select (renders its own .select-action-sheet with the 9 options)
		await page.locator('ion-modal ion-select').click();
		const optionSheet = page.locator('ion-action-sheet.select-action-sheet');
		await expect(optionSheet).toBeVisible({ timeout: 8000 });
		for (const label of REPORT_REASONS) {
			await expect(
				optionSheet.locator('button', { hasText: new RegExp(`^${escapeRe(label)}$`) })
			).toBeVisible();
		}

		// pick "Spam or scam" and submit
		await optionSheet.locator('button', { hasText: /^Spam or scam$/ }).click();

		const postSeen = page.waitForRequest(
			(req) => req.method() === 'POST' && /\/v2\/reports/.test(req.url()),
			{ timeout: 10_000 }
		);
		await page.locator('ion-modal ion-button', { hasText: /submit report/i }).click();

		const post = await postSeen;
		expect(post.postDataJSON()).toMatchObject({
			content_type: 'prompt',
			content_id: 'pmt-1',
			reason: 'spam'
		});

		// modal closes after a successful submit
		await expect(page.locator('ion-modal ion-title')).toHaveCount(0, { timeout: 8000 });
	});

	test('a swipe/backdrop dismiss resets state and the modal re-opens clean', async ({
		page,
		gotoHydrated
	}) => {
		skipIfIntegration('report submission is mock-only');
		await gotoHydrated(HARNESS);
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 12_000 });

		await openReportModal(page);
		// pick a reason so there is state to reset
		await page.locator('ion-modal ion-select').click();
		await page
			.locator('ion-action-sheet.select-action-sheet button', { hasText: /^Misinformation$/ })
			.click();

		// dismiss without submitting (a swipe/backdrop dismiss fires @didDismiss)
		await page.locator('ion-modal.show-modal').evaluate((el: any) => el.dismiss());
		await expect(page.locator('ion-modal ion-title')).toHaveCount(0, { timeout: 8000 });

		// re-open: @didDismiss synced isOpen->false so the button can open it again,
		// and reset() cleared the prior reason (Submit disabled until a fresh pick)
		await openReportModal(page);
		const submit = page.locator('ion-modal ion-button', { hasText: /submit report/i });
		await expect(submit).toBeVisible({ timeout: 8000 });
		// ion-button reflects disabled as an attribute (Playwright's toBeDisabled is unreliable on
		// web components); a clean re-open means reset() cleared the reason so submit is disabled
		await expect(submit).toHaveClass(/button-disabled/, { timeout: 8000 });
	});
});

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
