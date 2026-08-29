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
		await expect(page.getByText('Event 1').filter({ visible: true }).first()).toBeVisible();
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
		await expect(
			drawer
				.getByText(/event attendees/i)
				.filter({ visible: true })
				.first()
		).toBeVisible();
		await expect(
			drawer
				.getByText(/@host|@testuser|@author/i)
				.filter({ visible: true })
				.first()
		).toBeVisible({
			timeout: 8000
		});
	});
});

// sky could create an event but never manage one; /tabs/events/:id/manage closes that gap
test.describe('Event management', () => {
	test('the host reaches the manage screen from the event header', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 being can_edit');
		await asUser();
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		// the header control is an IonButton with router-link, so it lands in the tree as a
		// link; /manage|settings/i used to match the card's own Manage button instead
		await page
			.getByRole('link', { name: 'Manage Event' })
			.filter({ visible: true })
			.first()
			.click();

		await page.waitForURL(/\/tabs\/events\/evt-1\/manage/, { timeout: 12_000 });
		await expect(page.getByRole('button', { name: /View Attendees/i })).toBeVisible({
			timeout: 12_000
		});
		await expect(page.getByRole('button', { name: /Cancel Event/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Delete Event/i })).toBeVisible();
	});

	test('a non-host is bounced back to the event', async ({ page, asUser, gotoHydrated }) => {
		skipIfIntegration('depends on mock event evt-2 not being can_edit');
		await asUser();
		await gotoHydrated('/tabs/events/evt-2/manage');

		await page.waitForURL(/\/tabs\/events\/evt-2(\?|#|$)/, { timeout: 12_000 });
	});
});
