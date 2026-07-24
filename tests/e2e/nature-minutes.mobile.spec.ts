import { suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { makeNatureMinutes } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// The dashboard Nature Minutes card (TrailMNatureCard -> MNatureRing) + the HealthKit sync path
// (useNatureMinutes.syncFromHealthKit reads native distance and credits the delta).

const NATURE_PATH = /^\/v2\/users\/[^/]+\/nature-minutes\/?$/;

test.describe('Nature Minutes - dashboard ring + Apple Health sync (mobile)', () => {
	test('a fresh user sees the personal, never-compared ring with a Browse Trails CTA', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mock nature-minutes state');
		await installNativeMock(context, { platform: 'ios' });
		await suppressV060Tours(context);
		await asUser({ username: 'natureuser' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: 'Nature Minutes' })).toBeVisible({
			timeout: 15000
		});
		// best 0 -> the ring frames it as personal, never a rank
		await expect(page.getByText('Personal, Never Compared')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Browse Trails' })).toBeVisible();
	});

	test('a week with a personal best surfaces the best marker label, not a comparison', async ({
		page,
		context,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock nature-minutes state');
		await installNativeMock(context, { platform: 'ios' });
		await suppressV060Tours(context);
		await asUser({ username: 'naturebest' });

		await mockApi.set({
			method: 'GET',
			path: NATURE_PATH,
			body: makeNatureMinutes({ minutes: 45, best: 60, target: 120 }),
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByRole('heading', { name: 'Nature Minutes' })).toBeVisible({
			timeout: 15000
		});
		await expect(page.getByText('Personal Best: 60 min')).toBeVisible({ timeout: 12000 });
		await expect(page.getByText(/#\s*1\b|1st place|Rank\b/i)).toHaveCount(0);
	});

	test('Sync Apple Health credits the outdoor distance and confirms with a toast', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mock nature-minutes + healthkit');
		// 800m of native distance -> ~10 outdoor minutes credited
		await installNativeMock(context, { platform: 'ios', healthKitDistance: 800 });
		await suppressV060Tours(context);
		await asUser({ username: 'healthsync' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const syncBtn = page.getByRole('button', { name: 'Sync Apple Health' });
		await expect(syncBtn).toBeVisible({ timeout: 15000 });
		await syncBtn.click();
		await expectNativeToast(page, /synced your outdoor time from apple health/i);
	});

	test('Browse Trails navigates to the trails tab', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mock nature-minutes state');
		await installNativeMock(context, { platform: 'ios' });
		await suppressV060Tours(context);
		await asUser({ username: 'browsetrails' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const browseBtn = page.getByRole('button', { name: 'Browse Trails' });
		await expect(browseBtn).toBeVisible({ timeout: 15000 });
		await browseBtn.click();
		await expect(page.getByRole('heading', { name: 'Curiosity Trails' })).toBeVisible({
			timeout: 12000
		});
	});
});
