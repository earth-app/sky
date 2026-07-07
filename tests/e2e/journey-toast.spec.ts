import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

// tapCurrentJourney POSTs {crustBaseUrl}/api/user/journey and returns { count, incremented };
// the journey toast must fire ONLY when the server actually incremented the streak
const journeyPath = /^\/api\/user\/journey$/;

test.describe('Native toast content', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('no toast ever renders an "undefined" fragment for a logged-in user', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('native mock + mock journey response');
		await asUser({ username: 'journeyuser' });
		await gotoHydrated('/tabs/dashboard');
		// give any async journey/sync toasts a beat to fire
		await page.waitForTimeout(2000);
		const toasts: string[] = await page.evaluate(() => (window as any).__toasts ?? []);
		for (const t of toasts) {
			expect(t).not.toMatch(/undefined/i);
			expect(t).not.toMatch(/\bNaN\b/);
		}
	});
});

test.describe('Journey toast fires only on a real increment', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('shows the journey toast when the streak actually increments', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('overrides the /api/user/journey POST');
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: journeyPath,
			status: 200,
			body: { count: 6, incremented: true },
			once: false
		});

		await gotoHydrated('/tabs/articles/art-1');

		await expectNativeToast(page, /on your journey streak/i);
	});

	test('suppresses the journey toast when the count is unchanged', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('overrides the /api/user/journey POST');
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: journeyPath,
			status: 200,
			body: { count: 6, incremented: false },
			once: false
		});

		await gotoHydrated('/tabs/articles/art-1');
		// let the on-mount journey tap resolve and any toast surface
		await page.waitForTimeout(2500);

		const toasts: string[] = await page.evaluate(() => (window as any).__toasts ?? []);
		expect(toasts.some((t) => /on your journey/i.test(t))).toBe(false);
	});
});
