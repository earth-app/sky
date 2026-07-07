import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

const SAVED = [
	{
		word: 'Petrichor',
		partOfSpeech: 'noun',
		definition: 'the earthy scent when rain meets dry soil.'
	}
];

async function seedSavedWords(page: import('@playwright/test').Page) {
	await page.addInitScript((words) => {
		window.localStorage.setItem('wordoftheday:saved', JSON.stringify(words));
	}, SAVED);
}

test.describe('Dashboard Word of the Day', () => {
	test('tapping a saved word opens the interactive widget modal, not a toast', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('testBuild dashboard + seeded saved words');
		await asUser();
		await seedSavedWords(page);
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const wordBtn = page.getByRole('button', { name: /petrichor/i }).first();
		await expect(wordBtn).toBeVisible({ timeout: 12_000 });
		await wordBtn.click();

		// a modal opens hosting the interactive widget, pinned to the tapped word
		const modal = page.locator('ion-modal:visible').first();
		await expect(modal).toBeVisible({ timeout: 8000 });
		await expect(modal.getByText(/word of the day/i).first()).toBeVisible();
		await expect(modal.getByText(/petrichor/i).first()).toBeVisible();
	});

	test('the Word of the Day button opens the widget modal in pool mode', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('testBuild dashboard + seeded saved words');
		await asUser();
		await seedSavedWords(page);
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await page
			.getByRole('button', { name: /^word of the day$/i })
			.first()
			.click();
		await expect(page.locator('ion-modal:visible').first()).toBeVisible({ timeout: 8000 });
	});
});
