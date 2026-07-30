import { expect, skipIfIntegration, test } from './utils/fixtures';
import { installNativeMock } from './utils/native-mock';
import { firePedometer, gotoQuestStep, seedSingleStepQuest } from './utils/quest-helpers';

test.describe('Quest step: distance_covered (native)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'android' });
	});

	test('pedometer progress accrues and the goal-reached state appears', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'walker' });
		// a 20m goal, because the sync path now refuses a distance the session was not open long
		// enough to cover (20mph ceiling). the old 1km-in-one-event version simulated movement no
		// walker could produce, so it asserted plumbing the clamp is meant to reject
		const questId = await seedSingleStepQuest(mockApi, 'distance_covered', {
			stepOverrides: { parameters: [20] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		// start tracking (native => button enabled, no "mobile app only" gate)
		await page.getByRole('button', { name: /start tracking/i }).click();
		await expect(page.getByText(/tracking active/i)).toBeVisible({ timeout: 8000 });

		// let the session age so 30m is physically reachable; at 20mph the ceiling passes 30m
		// after ~3.4s, so this keeps a comfortable margin without a fake clock
		await page.waitForTimeout(6000);

		// drive the pedometer past the goal
		await firePedometer(page, 30);

		// reaching the goal flips the step to Goal Reached / Step Complete; a single-step
		// quest auto-submits and can race straight into the Quest Complete overlay, so
		// accept either the in-step goal state or the completion celebration
		await expect(
			page
				.getByText(/goal reached|step complete|quest complete/i)
				.filter({ visible: true })
				.first()
		).toBeVisible({
			timeout: 8000
		});
	});

	// the merge path takes max(healthkit, pedometer) and used to trust it outright, so one absurd
	// sensor reading could jump straight to the target and complete a quest step. the live path
	// always clamped to 20mph; this proves the synced path does too
	test('an impossible pedometer spike cannot complete the step', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'walker' });
		const questId = await seedSingleStepQuest(mockApi, 'distance_covered', {
			stepOverrides: { parameters: [1000] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await page.getByRole('button', { name: /start tracking/i }).click();
		await expect(page.getByText(/tracking active/i)).toBeVisible({ timeout: 8000 });

		// 5,000km seconds into the session: only a clamp stops this reaching a 1km goal
		await firePedometer(page, 5_000_000);

		await expect(
			page
				.getByText(/goal reached|step complete|quest complete/i)
				.filter({ visible: true })
				.first()
		).toBeHidden();
		// still tracking, so the spike was bounded rather than accepted and auto-submitted
		await expect(page.getByText(/tracking active/i)).toBeVisible();
	});

	// TYPE_STEP_COUNTER counts since boot, so a reboot or a re-anchor makes the next reading SMALLER
	// than the last. that must not read as negative movement and claw back distance already earned
	test('a pedometer counter reset does not erase earned progress', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'walker' });
		const questId = await seedSingleStepQuest(mockApi, 'distance_covered', {
			stepOverrides: { parameters: [1000] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await page.getByRole('button', { name: /start tracking/i }).click();
		await expect(page.getByText(/tracking active/i)).toBeVisible({ timeout: 8000 });
		await page.waitForTimeout(6000);

		await firePedometer(page, 30);
		const bar = page.getByRole('progressbar', { name: /distance progress/i }).first();
		await expect(bar).toHaveAttribute('aria-label', /[1-9]\d*\s*(m|ft)/, { timeout: 8000 });
		const earned = await bar.getAttribute('aria-label');

		// the counter drops far below the anchor, as it does across a device reboot
		await firePedometer(page, 1);

		// unchanged: a smaller reading re-anchors rather than subtracting
		await expect(bar).toHaveAttribute('aria-label', earned ?? '');
		await expect(page.getByText(/tracking active/i)).toBeVisible();
	});
});

// ios only: readHealthKitDistance() bails on every other platform, so the conflation case cannot
// be reached from the android mock used above
test.describe('Quest step: distance_covered (HealthKit conflation)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	// both sources measure the SAME movement, so the merge takes max() rather than adding them.
	// summing would double-count a walk the watch and the phone both saw, and would let a user
	// finish a step in half the distance
	test('a HealthKit sync while the pedometer is crediting takes the larger source, not the sum', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'walker' });
		const questId = await seedSingleStepQuest(mockApi, 'distance_covered', {
			stepOverrides: { parameters: [1000] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await page.getByRole('button', { name: /start tracking/i }).click();
		await expect(page.getByText(/tracking active/i)).toBeVisible({ timeout: 8000 });
		// both stay under the session ceiling so the clamp is not what is being measured here
		await page.waitForTimeout(6000);

		await page.evaluate(() => {
			const w = window as unknown as Record<string, (v: number) => void>;
			w.__setHealthKitDistance?.(40);
		});
		await firePedometer(page, 25);

		const bar = page.getByRole('progressbar', { name: /distance progress/i }).first();
		// aria-valuenow, not the label: the label is unit-formatted and the app defaults to
		// imperial, so 40m renders as "131 ft" and a metric assertion would fail on correct
		// behaviour. the fraction of the 1000m target is exact either way
		await expect(bar).toHaveAttribute('aria-valuenow', '0.04', { timeout: 8000 });
		// 0.065 would mean the two sources were summed
		await expect(bar).not.toHaveAttribute('aria-valuenow', '0.065');
	});
});

// platform-contrast: no native mock at all, so @capacitor/core runs its normal web
// detection (isNativePlatform() === false in a plain chromium) and MDistance shows
// the mobile-only notice. installing the native mock would set CapacitorCustomPlatform,
// which forces core's getPlatform() to report native and can't be undone by a later
// window.Capacitor override
test.describe('Quest step: distance_covered (non-native web)', () => {
	test('a non-native browser shows the mobile-only notice (platform contrast)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('native bridge + seeded quest data');
		await asUser({ username: 'webwalker' });
		const questId = await seedSingleStepQuest(mockApi, 'distance_covered', {
			stepOverrides: { parameters: [1000] }
		});
		await gotoQuestStep(page, gotoHydrated, questId, 0);

		await expect(page.getByText(/distance tracking only works in the mobile app/i)).toBeVisible({
			timeout: 8000
		});
	});
});
