import { actAs, makeActor, registerActors, suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

const modal = (page: import('@playwright/test').Page) => page.locator('ion-modal:visible').first();

test.describe('Curiosity Trails - browse, pledge, practice, reflect, reveal (mobile)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
		// keep the auto-starting trails tour from dimming the page mid-flow
		await suppressV060Tours(context);
	});

	test('browse -> theme filter narrows the catalog -> if-then pledge gate', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives the seeded trail catalog');

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await gotoTab(page, gotoHydrated, '/tabs/trails');
		await expect(page.getByRole('heading', { name: 'Curiosity Trails' })).toBeVisible({
			timeout: 15000
		});

		// theme filter narrows the catalog client-side (curiosity -> only Hidden Histories)
		await page.locator('ion-chip', { hasText: 'Curiosity' }).click();
		await expect(page.getByRole('heading', { name: 'Hidden Histories' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Neighborhood Wonders' })).toHaveCount(0);
		await page.locator('ion-chip', { hasText: 'All' }).click();
		await expect(page.getByRole('heading', { name: 'Neighborhood Wonders' })).toBeVisible();

		// open trail-1's runner: intro (MClue) -> pledge (MPledge)
		await page
			.locator('[data-trail-id="trail-1"]')
			.getByRole('button', { name: 'Begin Trail' })
			.click();
		const runner = modal(page);
		await runner.getByRole('button', { name: 'Make My Pledge' }).click();

		// the pledge cannot be accepted until a trigger ("when") is set
		await expect(runner.getByRole('heading', { name: 'Make Your Pledge' })).toBeVisible();
		// getByRole resolves to the inner native <button disabled>, so toBeDisabled is reliable here
		const accept = runner.getByRole('button', { name: 'Accept & Begin' });
		await expect(accept).toBeDisabled();
		await page.getByPlaceholder('I finish my morning coffee').fill('I finish lunch');
		await expect(accept).toBeEnabled();
	});

	test('full practice: pledge -> presence -> reflect -> reveal credits Nature Minutes + journals it', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives the standalone trail run + nature-minutes credit');

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await gotoTab(page, gotoHydrated, '/tabs/trails');
		await expect(page.getByRole('heading', { name: 'Curiosity Trails' })).toBeVisible({
			timeout: 15000
		});

		await page
			.locator('[data-trail-id="trail-1"]')
			.getByRole('button', { name: 'Begin Trail' })
			.click();
		const runner = modal(page);

		// intro -> pledge
		await runner.getByRole('button', { name: 'Make My Pledge' }).click();
		await page.getByPlaceholder('I finish my morning coffee').fill('I step outside');
		await runner.getByRole('button', { name: 'Accept & Begin' }).click();

		// presence: log the suggested minutes without running the timer
		const logBtn = runner.getByRole('button', { name: /Log \d+ Nature Minutes/ });
		await expect(logBtn).toBeVisible({ timeout: 12000 });
		await logBtn.click();

		// reflect: a private note + a mood, then save
		await expect(runner.getByRole('heading', { name: 'A Moment to Reflect' })).toBeVisible();
		await page
			.getByPlaceholder('A few words on what you noticed...')
			.fill('The light kept shifting.');
		await runner.locator('ion-chip', { hasText: 'Calm' }).click();
		await runner.getByRole('button', { name: 'Save Reflection' }).click();

		// reveal: the awe payoff + the Nature Minutes credit
		await expect(runner.getByRole('heading', { name: 'A Small Wonder' })).toBeVisible({
			timeout: 15000
		});
		await expect(page.getByText(/\+\d+ Nature Minutes, just for being out there/)).toBeVisible();
		await runner.getByRole('button', { name: 'Finish' }).click();

		// the reflection lands in the private journal
		await page.locator('#trail-journal-button').click();
		await expect(page.getByText('The light kept shifting.')).toBeVisible({ timeout: 12000 });
	});

	test('a preview opens the runner read-only and can be converted into a real begin', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives the seeded trail catalog');

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await gotoTab(page, gotoHydrated, '/tabs/trails');
		await page
			.locator('[data-trail-id="trail-1"]')
			.getByRole('button', { name: 'Preview Trail' })
			.click();

		const runner = modal(page);
		// preview shows the read-only walkthrough with a Begin CTA, no pledge yet
		await expect(runner.getByText("You're previewing this trail.")).toBeVisible({ timeout: 12000 });
		await runner.getByRole('button', { name: 'Begin This Trail' }).click();
		// converting to a real run drops into the pledge flow
		await runner.getByRole('button', { name: 'Make My Pledge' }).click();
		await expect(runner.getByRole('heading', { name: 'Make Your Pledge' })).toBeVisible();
	});

	test('an empty catalog shows the no-trails-here state', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('overrides the trail list with an empty catalog');

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await mockApi.set({
			method: 'GET',
			path: /^\/v2\/users\/trails/,
			body: { items: [] },
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/trails');
		await expect(page.getByText('No Trails Here Yet.')).toBeVisible({ timeout: 15000 });
	});
});
