import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeEvent, makeUser } from './utils/mock-data';

// proves IonModal lifecycle: a modal bound with :is-open MUST reset that ref on
// @did-dismiss or a swipe/backdrop dismiss wedges it shut (un-reopenable). every
// case here opens -> dismisses -> reopens to guard against that lockout.

const host = makeUser({ id: 'host-1', username: 'host', account: { account_type: 'ORGANIZER' } });

// distinctive body text so getByText can't collide with the header title
const ABOUT_TEXT = 'Bring Your Own Blanket and Snacks';

// keep the event page simple + fast: no similar pool, thumbnail fetch resolves as 404
async function seedEventWithInfo(page: Page, mockApi: any, info: string | null) {
	const fields: Record<string, any> = {};
	if (info) fields.info = info;
	await mockApi.setMany([
		{
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/events\/evt-1$/,
			body: makeEvent({ id: 'evt-1', name: 'Riverside Picnic', host, hostId: host.id, fields }),
			once: false
		},
		{ backend: 'mantle', method: 'GET', path: /^\/v2\/events\/random$/, body: [], once: false }
	]);
	// short-circuit the crust thumbnail pipeline so onMounted resolves without hanging
	await page.route('**/api/event/thumbnail**', (route) =>
		route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
	);
}

const SAVED = [
	{
		word: 'Petrichor',
		partOfSpeech: 'noun',
		definition: 'the earthy scent when rain meets dry soil.'
	}
];

async function seedSavedWords(page: Page) {
	await page.addInitScript((words) => {
		window.localStorage.setItem('wordoftheday:saved', JSON.stringify(words));
	}, SAVED);
}

test.describe('IonModal lifecycle', () => {
	test('About Event modal opens, closes via the Close button, and reopens without lockout', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 with fields.info');
		await asUser();
		await seedEventWithInfo(page, mockApi, `<p>${ABOUT_TEXT}</p>`);
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });

		const aboutBtn = page.getByRole('button', { name: /about event/i }).first();
		const aboutText = page.getByText(ABOUT_TEXT).first();

		// open
		await aboutBtn.click();
		await expect(aboutText).toBeVisible({ timeout: 8000 });

		// close via the labelled Close button inside the opened modal
		await page.locator('ion-modal:visible').getByRole('button', { name: 'Close' }).first().click();
		await expect(aboutText).toBeHidden({ timeout: 8000 });

		// reopen: proves @did-dismiss reset infoOpen so the ref can transition false->true again
		await aboutBtn.click();
		await expect(aboutText).toBeVisible({ timeout: 8000 });
	});

	test('About Event modal reopens after a swipe/backdrop dismiss (did-dismiss path)', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 with fields.info');
		await asUser();
		await seedEventWithInfo(page, mockApi, `<p>${ABOUT_TEXT}</p>`);
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });

		const aboutBtn = page.getByRole('button', { name: /about event/i }).first();
		const aboutText = page.getByText(ABOUT_TEXT).first();

		await aboutBtn.click();
		await expect(aboutText).toBeVisible({ timeout: 8000 });

		// a swipe-down / backdrop tap resolves to ion-modal.dismiss(), which fires @did-dismiss
		await page
			.locator('ion-modal:visible')
			.first()
			.evaluate((el) => (el as any).dismiss?.());
		await expect(aboutText).toBeHidden({ timeout: 8000 });

		// without the @did-dismiss reset the ref stays true and this second click is a no-op
		await aboutBtn.click();
		await expect(aboutText).toBeVisible({ timeout: 8000 });
	});

	test('Word of the Day list modal opens with content, closes cleanly, and reopens', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('testBuild dashboard + seeded saved words');
		await asUser();
		await seedSavedWords(page);
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const wordBtn = page.getByRole('button', { name: /petrichor/i }).first();
		await expect(wordBtn).toBeVisible({ timeout: 12_000 });

		// open: the tapped saved word mounts the interactive widget in a modal
		await wordBtn.click();
		let modal = page.locator('ion-modal:visible').first();
		await expect(modal.getByText(/word of the day/i).first()).toBeVisible({ timeout: 8000 });
		await expect(modal.getByText(/petrichor/i).first()).toBeVisible();

		// close via the labelled Close button
		await modal.getByRole('button', { name: /close word of the day/i }).click();
		await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 8000 });

		// reopen: @did-dismiss reset wordModalOpen so the list button opens it again
		await wordBtn.click();
		modal = page.locator('ion-modal:visible').first();
		await expect(modal.getByText(/word of the day/i).first()).toBeVisible({ timeout: 8000 });
	});

	test('an event without fields.info renders no About Event button and no about modal', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 without fields.info');
		await asUser();
		await seedEventWithInfo(page, mockApi, null);
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });

		// the button + its IonModal are both v-if gated on event.fields?.info
		await expect(page.getByRole('button', { name: /about event/i })).toHaveCount(0);
		await expect(page.getByText(ABOUT_TEXT)).toHaveCount(0);
	});
});
