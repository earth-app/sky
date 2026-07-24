import {
	actAs,
	makeActor,
	registerActors,
	suppressV060Tours,
	uniqueGeo
} from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

const COMPOSER_PLACEHOLDER = 'Something to lift the next person who stops here...';

test.describe('Trailmarks - leave, find, thank (mobile)', () => {
	test('a note left here is found and thanked by another user; the author sees the private thanks', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives seeded trailmark + geolocation mock state');

		await installNativeMock(context, { platform: 'ios', geo: uniqueGeo(testId) });
		await suppressV060Tours(context);

		const alice = makeActor(testId, 'alice');
		const bob = makeActor(testId, 'bob');
		await registerActors(mockApi, alice, bob);

		// --- Alice leaves a trailmark at this spot ---
		await actAs(context, mockApi, alice);
		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByRole('heading', { name: 'Trailmarks Nearby' })).toBeVisible({
			timeout: 15000
		});
		// the composer only enables once the device fix resolves
		await expect(page.getByText('Location Ready')).toBeVisible({ timeout: 15000 });

		const noteText = `Rest here and watch the clouds ${testId.slice(0, 8)}`;
		await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill(noteText);
		const postBtn = page.getByRole('button', { name: 'Post Note' });
		await expect(postBtn).toBeEnabled({ timeout: 12000 });
		await postBtn.click();
		await expect(page.getByText(noteText)).toBeVisible({ timeout: 12000 });

		// --- Bob (the other user) finds the single nearby note and thanks it ---
		await actAs(context, mockApi, bob);
		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText(noteText)).toBeVisible({ timeout: 15000 });
		const thankBtn = page.getByRole('button', { name: 'Thank This Note' });
		await expect(thankBtn).toBeVisible();
		await thankBtn.click();
		await expect(page.getByRole('button', { name: 'Thanked' })).toBeVisible({ timeout: 12000 });

		// --- Back as Alice: her note carries the private thanks + a private notification ---
		await actAs(context, mockApi, alice);
		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText('1 Quiet Thanks')).toBeVisible({ timeout: 15000 });
		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');
		await expect(page.getByText('Someone Thanked Your Trailmark')).toBeVisible({ timeout: 15000 });
	});

	test('no notes nearby shows the be-the-first empty state', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives geolocation mock state');

		await installNativeMock(context, { platform: 'ios', geo: uniqueGeo(testId) });
		await suppressV060Tours(context);

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText('Be the First to Leave One.')).toBeVisible({ timeout: 15000 });
	});

	test('geolocation denied shows the location-needed fallback with a recheck action', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives denied geolocation mock state');

		await installNativeMock(context, { platform: 'ios', geoDenied: true });
		await suppressV060Tours(context);

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText('Location Needed')).toBeVisible({ timeout: 15000 });
		await expect(page.getByRole('button', { name: 'Re-check Location' }).first()).toBeVisible();
	});

	test('a discouraging note is gently rejected by the sentiment gate', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives the trailmark sentiment gate');

		await installNativeMock(context, { platform: 'ios', geo: uniqueGeo(testId) });
		await suppressV060Tours(context);

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText('Location Ready')).toBeVisible({ timeout: 15000 });

		const bad = `this place is awful and terrible ${testId.slice(0, 6)}`;
		await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill(bad);
		await page.getByRole('button', { name: 'Post Note' }).click();

		await expectNativeToast(page, /kind and encouraging/i);
		// the rejected note never posts, so the nearby list stays in its be-the-first empty state
		await expect(page.getByText('Be the First to Leave One.')).toBeVisible({ timeout: 12000 });
	});

	test('a prompt can be answered from outside; the note surfaces under it', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives prompt trailmark + geolocation mock state');

		await installNativeMock(context, { platform: 'ios', geo: uniqueGeo(testId) });
		await suppressV060Tours(context);

		const walker = makeActor(testId, 'walker');
		await registerActors(mockApi, walker);
		await actAs(context, mockApi, walker);

		await gotoTab(page, gotoHydrated, '/tabs/prompts/pmt-1');
		await expect(page.getByRole('heading', { name: 'From Outside' })).toBeVisible({
			timeout: 15000
		});
		await page.getByRole('button', { name: 'Answer From Outside' }).click();

		const answer = `Answering from the trail ${testId.slice(0, 8)}`;
		const composer = page.getByPlaceholder(COMPOSER_PLACEHOLDER);
		await expect(composer).toBeVisible({ timeout: 12000 });
		await composer.fill(answer);
		const postBtn = page.getByRole('button', { name: 'Post Note' });
		await expect(postBtn).toBeEnabled({ timeout: 12000 });
		await postBtn.click();
		await expect(page.getByText(answer)).toBeVisible({ timeout: 12000 });
	});
});
