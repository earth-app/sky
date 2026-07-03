import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeEvent, makeUser } from './utils/mock-data';

const host = makeUser({ id: 'host-1', username: 'host', account: { account_type: 'ORGANIZER' } });

test.describe('Event detail + RSVP', () => {
	test('renders the profile card and host card', async ({ page, asUser, gotoHydrated }) => {
		skipIfIntegration('depends on mock event evt-1');
		await asUser();
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#event-host-card')).toBeVisible();
		await expect(page.getByText('Event 1').first()).toBeVisible();
	});

	test('signs up and flips the CTA to Leave Event', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 + mock signup override');
		await asUser();
		// keep evt-1 out of the similar/random pool so its list-shape can't race-clobber
		// the authoritative single-event fetch's is_attending flag
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/events\/random$/,
			body: [],
			once: false
		});
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		// similar-event cards below also render a Sign Up button, so scope to this event's card
		const signUp = page.locator('#event-profile-card').getByRole('button', { name: /^sign up$/i });
		await expect(signUp).toBeVisible();

		// signup POST is unseeded; the post-signup re-fetch must return an attending event
		await mockApi.setMany([
			{
				// mantle's real signup returns 204 no-content; a 200 with a json body makes the
				// crust request helper treat it as a failure (success:false), so mirror 204
				backend: 'mantle',
				method: 'POST',
				path: /^\/v2\/events\/evt-1\/signup$/,
				status: 204,
				body: '',
				once: false
			},
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/v2\/events\/evt-1$/,
				body: makeEvent({
					id: 'evt-1',
					name: 'Event 1',
					host,
					hostId: host.id,
					is_attending: true,
					attendee_count: 6
				}),
				once: false
			}
		]);

		await signUp.click();
		await expect(
			page.locator('#event-profile-card').getByRole('button', { name: /leave event/i })
		).toBeVisible({ timeout: 8000 });
	});

	test('opens the attendees drawer with attendee cards', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 + mock attendees override');
		await asUser();
		// attending event so the Attendees button is present from first render
		await mockApi.setMany([
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/v2\/events\/evt-1$/,
				body: makeEvent({
					id: 'evt-1',
					name: 'Event 1',
					host,
					hostId: host.id,
					is_attending: true,
					attendee_count: 6
				}),
				once: false
			},
			// keep evt-1 out of the similar/random pool so its unreliable list-shape
			// (is_attending:false) can't race-clobber the authoritative single fetch
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/v2\/events\/random$/,
				body: [],
				once: false
			}
		]);
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		const attendeesBtn = page
			.locator('#event-profile-card')
			.getByRole('button', { name: /attendees/i });
		await expect(attendeesBtn).toBeVisible({ timeout: 8000 });
		await attendeesBtn.click();

		const drawer = page.locator('ion-modal:visible').first();
		await expect(drawer).toBeVisible({ timeout: 8000 });
		// the attendees mock returns seeded users; the host is always included
		await expect(drawer.getByText(/event attendees/i).first()).toBeVisible();
		await expect(drawer.getByText(/@host|@testuser|@author/i).first()).toBeVisible({
			timeout: 8000
		});
	});
});
