import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makeQuest, makeUserQuestProgress } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';
import { gotoQuestDetail } from './utils/quest-helpers';

test.describe('Head cyclic-JSON regression', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('loading the active quest does not throw a circular-structure head error', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('depends on seeded quest data + mock backend + native bridge');

		const cyclicErrors: string[] = [];
		page.on('pageerror', (e) => {
			if (/circular structure/i.test(String(e))) cyclicErrors.push(String(e));
		});

		await asUser();
		// the real Runner quest shape: leading match_terms, alt-groups, distance + photo steps
		const runner = makeQuest({
			id: 'runner',
			title: 'Runner',
			mobile_only: true,
			steps: [
				{
					type: 'match_terms',
					description: 'Match the track events.',
					parameters: [
						'Match the track events.',
						[
							['60m', 'One straight run'],
							['400m', 'A full lap']
						]
					]
				},
				[
					{ type: 'respond_to_prompt', description: 'Respond.', parameters: ['running'] },
					{ type: 'article_read_time', description: 'Read.', parameters: ['SPORT', 900] }
				],
				{ type: 'distance_covered', description: 'Run 1 mile.', parameters: [1600] },
				{
					type: 'take_photo_validation',
					description: 'Photo of your shoes.',
					parameters: ['shoes', 0.6],
					delay: 14400
				}
			]
		});
		await mockApi.registerQuest(runner);
		await mockApi.setActiveQuest(
			makeUserQuestProgress(runner, {
				currentStepIndex: 3,
				progress: [
					{ type: 'match_terms', index: 0, submittedAt: Date.now() },
					{ type: 'respond_to_prompt', index: 1, altIndex: 0, submittedAt: Date.now() },
					{ type: 'distance_covered', index: 2, submittedAt: Date.now() }
				]
			})
		);

		await gotoQuestDetail(page, gotoHydrated, 'runner');
		await expect(page.locator('#tile-end')).toBeVisible({ timeout: 12_000 });
		// let a couple of reactive head flushes run
		await page.waitForTimeout(500);

		expect(cyclicErrors, cyclicErrors.join(' | ')).toEqual([]);
	});
});
