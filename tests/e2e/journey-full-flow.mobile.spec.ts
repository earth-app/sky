import {
	actAs,
	makeActor,
	registerActors,
	suppressV060Tours,
	uniqueGeo
} from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

// The full v0.6.0 journey across TWO users, mirroring crust's tests/e2e/journey/full-flow.spec.ts:
// Alice starts a shared expedition, walks a curiosity trail, that same outdoor time grows the
// shared garden + expedition, she cheers Bob (counter-free kudos), leaves a trailmark, Bob finds
// and thanks it, both see their private notifications, and finally she answers a prompt from
// outside. Adapted to the Ionic TrailM* / CircleM* / TrailmarkM* surfaces on /tabs/*.

const modal = (page: import('@playwright/test').Page) => page.locator('ion-modal:visible').first();
const COMPOSER_PLACEHOLDER = 'Something to lift the next person who stops here...';

test.describe('Full journey - trail -> shared garden -> kudos -> trailmark -> prompt (two users, mobile)', () => {
	test('one signed-in user does the whole loop; a second user finds + thanks the note', async ({
		page,
		context,
		mockApi,
		testId,
		gotoHydrated
	}) => {
		skipIfIntegration('drives seeded trails/circle/trailmark/prompt mock state + geolocation');

		await installNativeMock(context, { platform: 'ios', geo: uniqueGeo(testId) });
		await suppressV060Tours(context);

		const alice = makeActor(testId, 'alice');
		const bob = makeActor(testId, 'bob');
		await registerActors(mockApi, alice, bob);
		// Alice + Bob share one circle; their outdoor time grows one shared goal
		await mockApi.setCircle(alice.user.id, [alice.user.id, bob.user.id]);

		await actAs(context, mockApi, alice);

		// === 1. Alice starts a shared expedition (nature_minutes goal) ===
		await gotoTab(page, gotoHydrated, '/tabs/circle');
		await expect(page.getByRole('heading', { name: 'Start an Expedition' })).toBeVisible({
			timeout: 15000
		});
		const expTitle = `Circle Trek ${testId.slice(0, 6)}`;
		await page.getByPlaceholder('Weekend in the Wild').fill(expTitle);
		await page.getByRole('button', { name: 'Start Expedition' }).click();
		await expect(page.getByRole('heading', { name: expTitle })).toBeVisible({ timeout: 15000 });
		// nothing outdoors yet -> the garden is still in its first-minutes state
		await expect(page.getByText(/garden grows as the circle spends time outside/i)).toBeVisible();

		// === 2. Alice walks a trail (pledge -> presence -> reflect -> reveal) ===
		await gotoTab(page, gotoHydrated, '/tabs/trails');
		await expect(page.getByRole('heading', { name: 'Curiosity Trails' })).toBeVisible({
			timeout: 15000
		});
		await page
			.locator('[data-trail-id="trail-1"]')
			.getByRole('button', { name: 'Begin Trail' })
			.click();
		const runner = modal(page);
		await runner.getByRole('button', { name: 'Make My Pledge' }).click();
		await page.getByPlaceholder('I finish my morning coffee').fill('I step outside');
		await runner.getByRole('button', { name: 'Accept & Begin' }).click();
		const logBtn = runner.getByRole('button', { name: /Log \d+ Nature Minutes/ });
		await expect(logBtn).toBeVisible({ timeout: 12000 });
		await logBtn.click();
		await runner.getByRole('button', { name: 'Save Reflection' }).click();
		await expect(runner.getByRole('heading', { name: 'A Small Wonder' })).toBeVisible({
			timeout: 15000
		});
		await expect(page.getByText(/\+\d+ Nature Minutes, just for being out there/)).toBeVisible();
		await runner.getByRole('button', { name: 'Finish' }).click();

		// === 3. That same outdoor time grew the shared expedition + garden ===
		await gotoTab(page, gotoHydrated, '/tabs/circle');
		await expect(page.getByRole('heading', { name: expTitle })).toBeVisible({ timeout: 15000 });
		// Alice's contribution now shows (contribution in minutes, never a rank)
		await expect(
			page
				.getByText(/12\s*min/i)
				.filter({ visible: true })
				.first()
		).toBeVisible({ timeout: 12000 });
		// the garden has left the first-minutes state
		await expect(page.getByText(/garden grows as the circle spends time outside/i)).toHaveCount(0);

		// === 4. Alice cheers Bob on (counter-free kudos) ===
		const goYou = page.getByRole('button', { name: 'Go You' }).first();
		await expect(goYou).toBeVisible();
		await goYou.click();
		await expect(
			page.getByText(new RegExp(`Cheered ${bob.user.username}`, 'i')).first()
		).toBeVisible({ timeout: 12000 });
		await expect(page.getByText(/\d+\s*(kudos|cheers)/i)).toHaveCount(0);

		// === 5. Alice leaves a trailmark at this spot ===
		const noteText = `Rest here and watch the clouds ${testId.slice(0, 8)}`;
		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText('Location Ready')).toBeVisible({ timeout: 15000 });
		await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill(noteText);
		const postBtn = page.getByRole('button', { name: 'Post Note' });
		await expect(postBtn).toBeEnabled({ timeout: 12000 });
		await postBtn.click();
		await expect(page.getByText(noteText)).toBeVisible({ timeout: 12000 });

		// === 6. Bob (the other user) finds the single nearby note and thanks it ===
		await actAs(context, mockApi, bob);
		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText(noteText)).toBeVisible({ timeout: 15000 });
		await page.getByRole('button', { name: 'Thank This Note' }).click();
		await expect(page.getByRole('button', { name: 'Thanked' })).toBeVisible({ timeout: 12000 });

		// Bob also has the warm private kudos acknowledgment waiting
		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');
		await expect(page.getByText('A Cheer From Your Circle')).toBeVisible({ timeout: 15000 });

		// === 7. Back as Alice: her note carries the private thanks + a private notification ===
		await actAs(context, mockApi, alice);
		await gotoTab(page, gotoHydrated, '/tabs/trailmarks');
		await expect(page.getByText('1 Quiet Thanks')).toBeVisible({ timeout: 15000 });
		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');
		await expect(page.getByText('Someone Thanked Your Trailmark')).toBeVisible({ timeout: 15000 });

		// === 8. Finally, Alice answers a daily prompt from outside; it surfaces under the prompt ===
		const answerText = `Answering from the trail ${testId.slice(0, 8)}`;
		await gotoTab(page, gotoHydrated, '/tabs/prompts/pmt-1');
		await expect(page.getByRole('heading', { name: 'From Outside' })).toBeVisible({
			timeout: 15000
		});
		await page.getByRole('button', { name: 'Answer From Outside' }).click();
		const answerBox = page.getByPlaceholder(COMPOSER_PLACEHOLDER);
		await expect(answerBox).toBeVisible({ timeout: 12000 });
		await answerBox.fill(answerText);
		const postAnswer = page.getByRole('button', { name: 'Post Note' });
		await expect(postAnswer).toBeEnabled({ timeout: 12000 });
		await postAnswer.click();
		await expect(page.getByText(answerText)).toBeVisible({ timeout: 12000 });
	});
});
