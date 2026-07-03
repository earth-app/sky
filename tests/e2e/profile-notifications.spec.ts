import { expect, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeNotification } from './utils/mock-data';

// use a seconds-based timestamp; MCard multiplies created_at by 1000 for luxon
const CREATED_AT_SECONDS = Math.floor(Date.parse('2026-06-20T12:00:00.000Z') / 1000);

test.describe('Profile notifications', () => {
	test('renders the seeded notifications', async ({ page, gotoHydrated, asUser, mockApi }) => {
		await asUser({ username: 'notifuser' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/notifications\/?$/,
			status: 200,
			body: {
				items: [
					makeNotification({
						id: 'notif-a',
						title: 'Welcome Aboard',
						message: 'Thanks for joining The Earth App.',
						read: false,
						created_at: CREATED_AT_SECONDS
					}),
					makeNotification({
						id: 'notif-b',
						title: 'Quest Challenge',
						message: 'A friend challenged you to a quest.',
						source: 'quest',
						read: true,
						created_at: CREATED_AT_SECONDS
					})
				],
				total: 2
			}
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');

		await expect(page.locator('#notifications-title')).toHaveText(/notifications/i);
		await expect(page.locator('#notifications-list')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText('Welcome Aboard')).toBeVisible();
		await expect(page.getByText('Quest Challenge')).toBeVisible();
		await expect(page.getByText(/2 notifications/i)).toBeVisible();
	});

	test('shows the empty state when there are no notifications', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'notifuser' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/notifications\/?$/,
			status: 200,
			body: { items: [], total: 0 }
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');

		await expect(page.locator('#notifications-title')).toBeVisible();
		await expect(page.getByText(/you're all caught up/i)).toBeVisible({ timeout: 12_000 });
	});

	test('marking a notification read updates its badge', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		await asUser({ username: 'notifuser' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/notifications\/?$/,
			status: 200,
			// the store reads unread_count off the payload (not by counting !read), so it
			// must be present for the "1 unread" badge to render
			body: {
				items: [
					makeNotification({
						id: 'notif-unread',
						title: 'Unread Item',
						message: 'Tap the dot to mark me read.',
						read: false,
						created_at: CREATED_AT_SECONDS
					})
				],
				total: 1,
				unread_count: 1,
				has_warnings: false,
				has_errors: false
			}
		});
		// the mark-read path POSTs to .../mark_read; the base mock handles it, but our GET
		// override above is static (won't drop unread_count after), so also stub the POST
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/users\/current\/notifications\/[^/]+\/mark_read\/?$/,
			status: 200,
			body: { success: true }
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');
		await expect(page.getByText('Unread Item')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText(/1 unread/i)).toBeVisible();

		// the unread dot carries a "Mark as Read" title; tapping it flips the count
		await page.locator('[title="Mark as Read"]').first().click();
		await expect(page.getByText(/all read/i)).toBeVisible({ timeout: 8000 });
	});
});
