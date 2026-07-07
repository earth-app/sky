import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeEvent, makeUser } from './utils/mock-data';

const host = makeUser({ id: 'host-1', username: 'host', account: { account_type: 'ORGANIZER' } });

// tiny 64x16 (landscape 4:1) red PNG so the thumbnail pipeline sets a real blob url
const LANDSCAPE_PNG_B64 =
	'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAQCAIAAAAphe5+AAAAN0lEQVR4nO3PQQkAAAzDwMqpfz0TMxF7hEEgAi6Z9nXBBQ7QAgdogQO0wAFa4AAtcIAWOEALji0EZrA9LA5GAQAAAABJRU5ErkJggg==';

// intercept the crust thumbnail route ({crustBaseUrl}/api/event/thumbnail); the image
// request must return an image so useEvent sets `thumbnail`, the metadata request returns
// the author (or 404 to exercise the graceful missing-author path)
async function routeThumbnail(page: Page, opts: { author?: string | null } = {}) {
	const png = Buffer.from(LANDSCAPE_PNG_B64, 'base64');
	await page.route('**/api/event/thumbnail**', async (route) => {
		const url = route.request().url();
		if (url.includes('metadata=true')) {
			if (opts.author) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ author: opts.author, size: png.length })
				});
			} else {
				await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
			}
			return;
		}
		await route.fulfill({ status: 200, contentType: 'image/png', body: png });
	});
}

async function openThumbnailModal(page: Page) {
	// ion-img doesn't reflect `alt` onto the host element, so target the accessible image
	// (the alt lands on the inner img); clicking it bubbles to the ion-img @click handler
	const thumb = page.getByRole('img', { name: 'Event Thumbnail' }).first();
	await expect(thumb).toBeVisible({ timeout: 12_000 });
	await thumb.click();
	const modal = page.locator('ion-modal:has([data-testid="image-zoom-viewport"])');
	await expect(modal).toBeVisible({ timeout: 8000 });
	return modal;
}

test.describe('Event thumbnail image modal', () => {
	test('opens a landscape thumbnail, shows details, closes without locking out, and zooms', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 + routed thumbnail');
		await asUser();
		await mockApi.setMany([
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/v2\/events\/evt-1$/,
				body: makeEvent({
					id: 'evt-1',
					name: 'Riverside Landscape Walk',
					host,
					hostId: host.id,
					type: 'IN_PERSON',
					location: { latitude: 40.785091, longitude: -73.968285 }
				}),
				once: false
			},
			// keep evt-1 out of the similar pool so the page stays simple
			{ backend: 'mantle', method: 'GET', path: /^\/v2\/events\/random$/, body: [], once: false }
		]);
		await routeThumbnail(page, { author: 'Ansel Adams' });
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		const modal = await openThumbnailModal(page);

		// close button is present and labelled
		const closeBtn = modal.getByRole('button', { name: 'Close' });
		await expect(closeBtn).toBeVisible();

		// caption renders the event name + date + location + photo author
		await expect(modal.getByText('Riverside Landscape Walk').first()).toBeVisible();
		// timezone-independent: the formatted date/time row carries the year
		await expect(modal.getByText(/2026/).first()).toBeVisible();
		await expect(modal.getByText(/40\.7851, -73\.9683/).first()).toBeVisible();
		await expect(modal.getByText(/Photo by Ansel Adams/i).first()).toBeVisible();

		// zoom container is interactive; a double-tap zooms even a landscape (non-overflowing) image
		const viewport = modal.locator('[data-testid="image-zoom-viewport"]');
		await expect(viewport).toBeVisible();
		const modalImg = viewport.locator('img');
		await expect(modalImg).toBeVisible();
		await page.evaluate(() => {
			const vp = document.querySelector('[data-testid="image-zoom-viewport"]') as HTMLElement;
			const rect = vp.getBoundingClientRect();
			const x = rect.left + rect.width / 2;
			const y = rect.top + rect.height / 2;
			const fire = (type: string) =>
				vp.dispatchEvent(
					new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true })
				);
			// two quick taps -> double-tap toggle to 2.5x
			fire('pointerdown');
			fire('pointerup');
			fire('pointerdown');
			fire('pointerup');
		});
		await expect
			.poll(async () => (await modalImg.getAttribute('style')) ?? '')
			.toContain('scale(2.5)');

		// closing dismisses the modal (not locked out) and it can be re-opened afterward
		await closeBtn.click();
		await expect(viewport).toBeHidden({ timeout: 8000 });
		await openThumbnailModal(page);
	});

	test('handles an event with missing optional fields without empty rows or a crash', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('depends on mock event evt-1 + routed thumbnail');
		await asUser();

		// sparse event: in-person but no end_date and no location coordinates
		const sparse = makeEvent({
			id: 'evt-1',
			name: 'Mystery Popup',
			host,
			hostId: host.id,
			type: 'IN_PERSON'
		});
		delete sparse.end_date;
		delete sparse.end_date_f;
		delete sparse.location;

		await mockApi.setMany([
			{
				backend: 'mantle',
				method: 'GET',
				path: /^\/v2\/events\/evt-1$/,
				body: sparse,
				once: false
			},
			{ backend: 'mantle', method: 'GET', path: /^\/v2\/events\/random$/, body: [], once: false }
		]);
		// no author metadata -> author row must not render
		await routeThumbnail(page, { author: null });
		await gotoHydrated('/tabs/events/evt-1');

		await expect(page.locator('#event-profile-card')).toBeVisible({ timeout: 12_000 });
		const modal = await openThumbnailModal(page);

		// name still renders and dismiss still works
		await expect(modal.getByText('Mystery Popup').first()).toBeVisible();

		// absent optional fields render no rows (location + author omitted, no crash)
		await expect(modal.getByText(/Photo by/i)).toHaveCount(0);
		await expect(modal.locator('[data-testid="image-zoom-viewport"]')).toBeVisible();

		const closeBtn = modal.getByRole('button', { name: 'Close' });
		await closeBtn.click();
		await expect(modal.locator('[data-testid="image-zoom-viewport"]')).toBeHidden({
			timeout: 8000
		});
	});
});
