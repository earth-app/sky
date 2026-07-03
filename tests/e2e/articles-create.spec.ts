import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

test.describe('Article create (WRITER)', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('publishes an article and surfaces the success toast', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('writes to backend + asserts mock success toast');
		// WRITER + PUBLIC (default) passes the new.vue account/visibility gate
		await asUser({ account: { account_type: 'WRITER', visibility: 'PUBLIC' } });
		await gotoHydrated('/tabs/articles/new');

		// the form heading confirms the writer gate let us through
		await expect(page.getByText(/create new article/i)).toBeVisible({ timeout: 12_000 });

		await page.getByPlaceholder(/wonderful world of pizzas/i).fill('My Test Article');
		await page.getByPlaceholder(/pizzas are great because/i).fill('A short description.');
		await page
			.getByPlaceholder(/the first reason pizzas are great/i)
			.fill('The full body of the article goes here with plenty of clean content.');

		await page.getByRole('button', { name: /create article/i }).click();

		await expectNativeToast(page, /created successfully/i);
	});
});
