import { expect, test } from './utils/fixtures';
import { makePromptResponse } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

test.describe('Prompt respond', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('renders the prompt and its existing responses', async ({ page, asUser, gotoHydrated }) => {
		await asUser();
		await gotoHydrated('/tabs/prompts/pmt-1');

		await expect(page.getByText(/sample prompt 1\?/i).first()).toBeVisible({ timeout: 12_000 });
		// the responses mock seeds two entries with this default body
		await expect(page.getByText(/write playwright tests/i).first()).toBeVisible({
			timeout: 8000
		});
	});

	test('posts a response and clears the input', async ({ page, asUser, mockApi, gotoHydrated }) => {
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/prompts\/pmt-1\/responses$/,
			status: 201,
			body: makePromptResponse({ id: 'pr-new', prompt_id: 'pmt-1', response: 'My fresh take.' }),
			once: false
		});
		await gotoHydrated('/tabs/prompts/pmt-1');

		const input = page.locator('#response-input textarea');
		await expect(input).toBeVisible({ timeout: 12_000 });
		await input.click();
		await input.fill('My fresh take on this prompt.');

		const post = page.locator('#post-button');
		await expect(post).toBeEnabled();
		await post.click();

		// on success the composable resets newResponse to '', clearing the textarea
		await expect(input).toHaveValue('', { timeout: 8000 });
	});
});
