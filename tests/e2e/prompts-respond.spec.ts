import { expect, skipIfIntegration, test } from './utils/fixtures';
import { makePromptResponse, paginate } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

test.describe('Prompt respond', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('renders the prompt and its existing responses', async ({ page, asUser, gotoHydrated }) => {
		skipIfIntegration('pmt-1 mock prompt');
		await asUser();
		await gotoHydrated('/tabs/prompts/pmt-1');

		await expect(page.getByText(/sample prompt 1\?/i).first()).toBeVisible({ timeout: 12_000 });
		// the responses mock seeds two entries with this default body
		await expect(page.getByText(/write playwright tests/i).first()).toBeVisible({
			timeout: 8000
		});
	});

	test('posts a response and clears the input', async ({ page, asUser, mockApi, gotoHydrated }) => {
		skipIfIntegration('pmt-1 mock prompt');
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

		const input = page.locator('#response-input textarea:not(.cloned-input)');
		await expect(input).toBeVisible({ timeout: 12_000 });
		await input.click();
		await input.fill('My fresh take on this prompt.');

		const post = page.locator('#post-button');
		await expect(post).toBeEnabled();
		await post.click();

		// on success the composable resets newResponse to '', clearing the textarea
		await expect(input).toHaveValue('', { timeout: 8000 });
	});

	test('the posted response renders the user avatar, not the placeholder', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated,
		baseURL
	}) => {
		skipIfIntegration('pmt-1 mock prompt');

		// same-origin image so the avatar blob fetch actually resolves in the harness
		const avatarUrl = new URL('/cloud.png', baseURL).toString();
		const user = await asUser({ account: { avatar_url: avatarUrl } });

		const posted = makePromptResponse({
			id: 'pr-avatar',
			prompt_id: 'pmt-1',
			response: 'Freshly posted avatar response.',
			owner: user
		});

		// the post re-fetches the list, so the GET must also carry the owner's avatar
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/prompts\/pmt-1\/responses/,
			status: 200,
			body: paginate([posted]),
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/prompts\/pmt-1\/responses$/,
			status: 201,
			body: posted,
			once: false
		});

		await gotoHydrated('/tabs/prompts/pmt-1');

		const input = page.locator('#response-input textarea:not(.cloned-input)');
		await expect(input).toBeVisible({ timeout: 12_000 });
		await input.click();
		await input.fill('Freshly posted avatar response.');

		const post = page.locator('#post-button');
		await expect(post).toBeEnabled();
		await post.click();
		// input clears once the post succeeds and the list re-fetches
		await expect(input).toHaveValue('', { timeout: 8000 });

		const card = page.locator('ion-card').filter({ hasText: 'Freshly posted avatar response.' });
		await expect(card).toBeVisible({ timeout: 8000 });

		console.log('CARD_HTML_START', await card.innerHTML(), 'CARD_HTML_END');

		const avatarImg = card.locator('img').first();
		await expect(avatarImg).toBeVisible({ timeout: 8000 });

		// must resolve to the user's image (sized remote url or a fetched blob), never the
		// /favicon.png placeholder the pre-fix user-store lookup produced for a just-posted response
		await expect
			.poll(() => avatarImg.getAttribute('src'), { timeout: 8000 })
			.toMatch(/cloud\.png|^blob:/);
		const src = await avatarImg.getAttribute('src');
		expect(src).not.toContain('favicon.png');
		expect(src).not.toContain('earth-app.png');
	});
});
