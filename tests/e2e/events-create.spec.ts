import { expect, test } from './utils/fixtures';
import { expectNativeToast } from './utils/journey-helpers';
import { makeEvent } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

test.describe('Event create (ORGANIZER)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('renders the required fields', async ({ page, asUser, gotoHydrated }) => {
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await gotoHydrated('/tabs/events/new');

		await expect(page.getByPlaceholder(/enter event name/i)).toBeVisible({ timeout: 12_000 });
		await expect(page.getByPlaceholder(/enter event description/i)).toBeVisible();
		await expect(page.getByRole('button', { name: /create event/i })).toBeVisible();
	});

	test('creates an event and surfaces the success toast', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		await asUser({ account: { account_type: 'ORGANIZER' } });
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/events$/,
			status: 201,
			body: makeEvent({ id: 'evt-new', name: 'Cleanup Meetup', type: 'ONLINE' }),
			once: false
		});
		await gotoHydrated('/tabs/events/new');

		await page.getByPlaceholder(/enter event name/i).fill('Cleanup Meetup');
		await page.getByPlaceholder(/enter event description/i).fill('A community cleanup event.');

		await page.getByRole('button', { name: /create event/i }).click();

		await expectNativeToast(page, /created successfully/i);
	});
});
