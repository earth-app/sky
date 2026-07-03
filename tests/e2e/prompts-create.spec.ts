import { expect, test } from './utils/fixtures';
import { expectNativeToast } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

test.describe('Prompt create', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('creates a prompt and surfaces the success toast', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		await asUser();
		await gotoHydrated('/tabs/prompts/new');

		const input = page.locator('ion-textarea').first().locator('textarea');
		await expect(input).toBeVisible({ timeout: 12_000 });
		await input.click();
		// >=10 chars enables the Create button; keep under 100 to pass validation
		await input.fill('What is one small win you had this week?');

		const create = page.getByRole('button', { name: /^create$/i });
		await expect(create).toBeEnabled({ timeout: 8000 });
		await create.click();

		await expectNativeToast(page, /created successfully/i);
	});
});
