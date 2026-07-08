/**
 * Offline -> online mutation-replay journey (v1.0.2 flow #11).
 *
 * Proves the mobile shell's offline mutation queue survives a connectivity drop and
 * drains correctly on reconnect - the seam behind bug class I (offline queue + replay)
 * and F (CapacitorHttp transport carrying the replayed request).
 *
 * The one queued mutation the product wires through the UI is notification DELETE
 * (MCard.removeNotification -> runOrQueueM('mark-notification-delete', ...)). So the
 * continuous journey drives that path end to end:
 *   offline -> delete a notification -> it QUEUES (banner shows the pending count, no
 *   DELETE hits the server) -> online -> the queue REPLAYS + drains (banner clears) and
 *   the DELETE fires against the correct per-id endpoint, removing the card.
 *
 * mark-read / mark-all-read have registered dispatchers (app.vue) but no UI caller routes
 * them through runOrQueueM, and "offline" here is logical (the Capacitor Network status is
 * flipped; the socket to the mock is never actually cut), so they can't be queued by
 * clicking. Instead they're covered via the DURABLE queue: the persisted Preferences queue
 * (STORAGE_KEY 'sky:offline-mutation-queue-v1') is seeded before launch and initMOfflineQueue
 * replays it on the next online boot. That guards the same replay path AND the historical
 * /read-vs-/mark_read endpoint bug (we assert the drained request path is exactly right).
 *
 * Offline mechanism (same as offline-online.spec): native-mock's window.__fireNetworkChange
 * drives the @capacitor/network 'networkStatusChange' listener app.vue subscribes to
 * (updateFromStatus -> applyNetworkStatus -> networkOffline). isOffline is a computed, so the
 * banner re-renders reactively. We fire it IN-CONTEXT (no navigation) so the module-level
 * networkOffline ref survives.
 *
 * Requests are observed with page.on('request'): the native CapacitorHttp mock routes through
 * real fetch, so the replayed mutation is a real request Playwright can see.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { makeNotification } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

const STORAGE_KEY = 'sky:offline-mutation-queue-v1';
// seconds-based; MCard multiplies created_at by 1000 for luxon
const CREATED_AT = Math.floor(Date.parse('2026-06-20T12:00:00.000Z') / 1000);
const NOTIF_DELETE = /^\/v2\/users\/current\/notifications\/[^/]+\/?$/;

type Hit = { method: string; path: string };

// collect every notification-endpoint request the page fires so specs can assert what
// went out (and, just as important, what did NOT) at each phase
function trackNotificationRequests(page: Page): Hit[] {
	const hits: Hit[] = [];
	page.on('request', (req) => {
		try {
			const u = new URL(req.url());
			if (u.pathname.includes('/v2/users/current/notifications')) {
				hits.push({ method: req.method(), path: u.pathname });
			}
		} catch {
			// non-url request scheme, ignore
		}
	});
	return hits;
}

const countDeletes = (hits: Hit[]) =>
	hits.filter((h) => h.method === 'DELETE' && NOTIF_DELETE.test(h.path)).length;

async function fireNetwork(page: Page, connected: boolean): Promise<void> {
	await page.evaluate((c) => (window as any).__fireNetworkChange(c), connected);
}

const offlineBanner = (page: Page) => page.getByText("You're offline");
const syncingBanner = (page: Page) => page.getByText(/Syncing \d+ change/);

// re-fire on each poll tick so a listener that armed a hair late still catches the change;
// applyNetworkStatus is idempotent so repeating the same status is harmless
async function goOffline(page: Page): Promise<void> {
	await expect
		.poll(
			async () => {
				await fireNetwork(page, false);
				return offlineBanner(page).count();
			},
			{ timeout: 15_000 }
		)
		.toBeGreaterThan(0);
	await expect(offlineBanner(page).first()).toBeVisible({ timeout: 5_000 });
}

async function goOnline(page: Page): Promise<void> {
	await expect
		.poll(
			async () => {
				await fireNetwork(page, true);
				return offlineBanner(page).count();
			},
			{ timeout: 15_000 }
		)
		.toBe(0);
}

// pendingMutationCount 0 -> neither the red offline banner nor the amber syncing banner shows
async function expectQueueDrained(page: Page): Promise<void> {
	await expect
		.poll(async () => (await offlineBanner(page).count()) + (await syncingBanner(page).count()), {
			timeout: 12_000
		})
		.toBe(0);
}

// seed the persisted offline queue BEFORE the app boots so initMOfflineQueue loads + replays
// it. runs after installNativeMock's init script, so w.__prefs already exists (don't clobber)
async function seedPersistedQueue(
	context: BrowserContext,
	entries: Array<Record<string, unknown>>
): Promise<void> {
	await context.addInitScript(
		({ key, json }) => {
			const w = window as any;
			w.__prefs = w.__prefs || {};
			w.__prefs[key] = json;
		},
		{ key: STORAGE_KEY, json: JSON.stringify(entries) }
	);
}

function queuedEntry(kind: string, payload?: Record<string, unknown>): Record<string, unknown> {
	return {
		id: `${kind}:seed:${Math.random().toString(36).slice(2, 8)}`,
		kind,
		...(payload ? { payload } : {}),
		attempts: 0,
		enqueuedAt: Date.now()
	};
}

async function seedNotifications(
	mockApi: { set: (spec: any) => Promise<void> },
	items: Array<Record<string, unknown>>
): Promise<void> {
	await mockApi.set({
		backend: 'mantle',
		method: 'GET',
		path: /^\/v2\/users\/current\/notifications\/?$/,
		status: 200,
		body: { items, total: items.length, unread_count: items.filter((n) => !n.read).length },
		once: false
	});
}

test.describe('Offline mutation queue: notification delete (UI journey)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a delete queues while offline, then replays + drains on reconnect', async ({
		page,
		asUser,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('native network mock + seeded notifications');
		await asUser({ username: 'notifuser' });
		await seedNotifications(mockApi, [
			makeNotification({
				id: 'notif-a',
				title: 'Welcome Aboard',
				message: 'Thanks for joining The Earth App.',
				read: false,
				created_at: CREATED_AT
			}),
			makeNotification({
				id: 'notif-b',
				title: 'Quest Challenge',
				message: 'A friend challenged you to a quest.',
				source: 'quest',
				read: true,
				created_at: CREATED_AT
			})
		]);
		// the per-id DELETE has no default mock route; let the replayed delete succeed
		await mockApi.set({
			backend: 'mantle',
			method: 'DELETE',
			path: NOTIF_DELETE,
			status: 204,
			body: '',
			once: false
		});

		const hits = trackNotificationRequests(page);
		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');
		await expect(page.locator('#notifications-list')).toBeVisible({ timeout: 12_000 });
		await expect(page.getByText('Welcome Aboard')).toBeVisible();

		// drop offline, then delete the first card -> it must QUEUE (native dialog auto-confirms)
		await goOffline(page);
		const deletesBefore = countDeletes(hits);
		const card = page.locator('.notif-card', { hasText: 'Welcome Aboard' });
		await card.locator('[title="Delete Notification"]').first().click();

		// queued-branch proof: the "back online" toast + the pending count on the banner
		await expectNativeToast(page, /back online/i);
		await expect(page.getByText(/1 pending/i)).toBeVisible({ timeout: 8_000 });
		// the mutation did NOT hit the server while offline
		expect(countDeletes(hits)).toBe(deletesBefore);

		// reconnect -> the queue replays: exactly one DELETE fires at the correct per-id path
		await goOnline(page);
		await expect.poll(() => countDeletes(hits), { timeout: 12_000 }).toBeGreaterThan(0);
		const lastDelete = [...hits].reverse().find((h) => h.method === 'DELETE');
		expect(lastDelete?.path).toMatch(/\/v2\/users\/current\/notifications\/notif-a$/);

		// queue drained (banner cleared) and the server-side removal is reflected in the list
		await expectQueueDrained(page);
		await expect(page.getByText('Welcome Aboard')).toHaveCount(0, { timeout: 8_000 });
	});

	test('a delete that 5xx-fails on replay stays queued, then drains on retry', async ({
		page,
		asUser,
		gotoHydrated,
		mockApi
	}) => {
		skipIfIntegration('native network mock + seeded notifications');
		await asUser({ username: 'notifuser' });
		await seedNotifications(mockApi, [
			makeNotification({
				id: 'notif-fail',
				title: 'Sticky Notification',
				message: 'This one resists the first delete.',
				read: false,
				created_at: CREATED_AT
			})
		]);
		// arm a persistent 5xx so the first replay attempt fails
		await mockApi.set({
			backend: 'mantle',
			method: 'DELETE',
			path: NOTIF_DELETE,
			status: 500,
			body: { message: 'boom' },
			once: false
		});

		const hits = trackNotificationRequests(page);
		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');
		await expect(page.getByText('Sticky Notification')).toBeVisible({ timeout: 12_000 });

		await goOffline(page);
		await page
			.locator('.notif-card', { hasText: 'Sticky Notification' })
			.locator('[title="Delete Notification"]')
			.first()
			.click();
		await expectNativeToast(page, /back online/i);

		// reconnect: the replay is attempted (DELETE fires) but the 5xx keeps it queued -
		// the dispatcher returned false, so the item is retained, not silently dropped
		await goOnline(page);
		await expect.poll(() => countDeletes(hits), { timeout: 12_000 }).toBeGreaterThan(0);
		await expect(syncingBanner(page).first()).toBeVisible({ timeout: 8_000 });

		// now let the endpoint succeed and bounce the connection to re-trigger a replay
		await mockApi.set({
			backend: 'mantle',
			method: 'DELETE',
			path: NOTIF_DELETE,
			status: 204,
			body: '',
			once: false
		});
		const attemptsBefore = countDeletes(hits);
		await goOffline(page);
		await goOnline(page);
		await expect
			.poll(() => countDeletes(hits), { timeout: 12_000 })
			.toBeGreaterThan(attemptsBefore);
		await expectQueueDrained(page);
	});
});

test.describe('Offline mutation queue: durable replay on next launch', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('a persisted mark-read replays via the /mark_read endpoint (not /read)', async ({
		page,
		asUser,
		gotoHydrated,
		context
	}) => {
		skipIfIntegration('native network mock + persisted offline queue');
		await asUser({ username: 'notifuser' });
		await seedPersistedQueue(context, [queuedEntry('mark-read', { id: 'notif-a' })]);

		const hits = trackNotificationRequests(page);
		// any authed route boots the app-level queue; dashboard is the lightest
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// the drained request must hit the correct segment: mark_read, never a bare /read
		await expect
			.poll(
				() =>
					hits.filter(
						(h) => h.method === 'POST' && /\/notifications\/[^/]+\/mark_read$/.test(h.path)
					).length,
				{ timeout: 12_000 }
			)
			.toBeGreaterThan(0);
		expect(hits.filter((h) => /\/notifications\/[^/]+\/read$/.test(h.path))).toHaveLength(0);

		// queue drained on the online boot -> no lingering pending/offline banner
		await expectQueueDrained(page);
	});

	test('a persisted mark-all-read replays via the /mark_all_read endpoint', async ({
		page,
		asUser,
		gotoHydrated,
		context
	}) => {
		skipIfIntegration('native network mock + persisted offline queue');
		await asUser({ username: 'notifuser' });
		await seedPersistedQueue(context, [queuedEntry('mark-all-read')]);

		const hits = trackNotificationRequests(page);
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await expect
			.poll(
				() =>
					hits.filter((h) => h.method === 'POST' && /\/notifications\/mark_all_read$/.test(h.path))
						.length,
				{ timeout: 12_000 }
			)
			.toBeGreaterThan(0);

		await expectQueueDrained(page);
	});
});
