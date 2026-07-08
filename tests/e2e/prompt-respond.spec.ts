import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast } from './utils/journey-helpers';
import { makePromptResponse, paginate } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

// regexes match any prompt id so overrides bind to the freshly-created prompt too
const CREATE_PROMPT = /\/v2\/prompts$/;
const RESPONSES_GET = /^\/v2\/prompts\/[^/]+\/responses/;
const RESPONSES_POST = /^\/v2\/prompts\/[^/]+\/responses$/;
const RESPONSE_ITEM = /^\/v2\/prompts\/[^/]+\/responses\/[^/]+$/;
const JOURNEY_TAP = /^\/api\/user\/journey$/;

// request predicates run against the pathname; request.url() is absolute so ^-anchored regexes miss
const urlPath = (u: string) => new URL(u).pathname;

test.describe('Journey: prompt create -> respond -> edit -> delete', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('one session: create a prompt, respond, edit, then delete the response', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('native bridge + mock prompt/response writes');
		const user = await asUser();

		// created prompt starts with zero responses
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: RESPONSES_GET,
			status: 200,
			body: paginate([]),
			once: false
		});

		await gotoHydrated('/tabs/prompts/new');
		const promptInput = page.locator('ion-textarea').first().locator('textarea:not(.cloned-input)');
		await expect(promptInput).toBeVisible({ timeout: 12_000 });
		await promptInput.click();
		const promptText = 'What is one small win you had this week?';
		await promptInput.fill(promptText);

		const create = page.getByRole('button', { name: /^create$/i });
		await expect(create).not.toHaveClass(/button-disabled/, { timeout: 8000 });

		const createSeen = page.waitForRequest(
			(r) => r.method() === 'POST' && CREATE_PROMPT.test(urlPath(r.url())),
			{ timeout: 12_000 }
		);
		await create.click();

		// mantle2 contract is {prompt, visibility}, NOT {title, description}
		const createBody = (await createSeen).postDataJSON() ?? {};
		expect(createBody).toMatchObject({ prompt: promptText, visibility: 'PUBLIC' });
		expect(createBody).not.toHaveProperty('title');
		expect(createBody).not.toHaveProperty('description');

		await expectNativeToast(page, /created successfully/i);

		// new.vue routes to the created prompt; capture its id for the response endpoints
		await page.waitForURL(/\/tabs\/prompts\/prompt-[a-z0-9]+$/i, { timeout: 12_000 });
		const promptId = new URL(page.url()).pathname.split('/').pop()!;
		expect(promptId).toMatch(/^prompt-/);

		const responseText = 'Finishing this quest felt like a real win.';
		const posted = makePromptResponse({
			id: 'pr-journey-1',
			prompt_id: promptId,
			response: responseText,
			owner: user
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: RESPONSES_POST,
			status: 201,
			body: posted,
			once: false
		});
		// newest GET override wins (unshift); the post refetches, so the list must carry it
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: RESPONSES_GET,
			status: 200,
			body: paginate([posted]),
			once: false
		});
		// journey tap must reflect the new response as a streak increment
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: JOURNEY_TAP,
			status: 200,
			body: { count: 4, incremented: true },
			once: false
		});

		const respInput = page.locator('#response-input textarea:not(.cloned-input)');
		await expect(respInput).toBeVisible({ timeout: 12_000 });
		await respInput.click();
		await respInput.fill(responseText);

		// moderation checkText runs before the POST (obscenity load in testBuild), so allow headroom
		const postSeen = page.waitForRequest(
			(r) => r.method() === 'POST' && RESPONSES_POST.test(urlPath(r.url())),
			{ timeout: 15_000 }
		);
		const postBtn = page.locator('#post-button');
		await expect(postBtn).not.toHaveClass(/button-disabled/);
		await postBtn.click();

		// POST body is {content}; on success the composable clears the input
		expect((await postSeen).postDataJSON()).toMatchObject({ content: responseText });
		await expect(respInput).toHaveValue('', { timeout: 8000 });

		const postedCard = page.locator('ion-card').filter({ hasText: responseText });
		await expect(postedCard).toBeVisible({ timeout: 8000 });
		// journey streak reflected the response
		await expectNativeToast(page, /on your journey/i);

		const editedText = 'On reflection, finishing that quest taught me to pace myself.';
		const edited = makePromptResponse({
			id: 'pr-journey-1',
			prompt_id: promptId,
			response: editedText,
			owner: user
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'PATCH',
			path: RESPONSE_ITEM,
			status: 200,
			body: edited,
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: RESPONSES_GET,
			status: 200,
			body: paginate([edited]),
			once: false
		});

		// owner actions (Edit/Delete) live behind the response card's kebab
		await postedCard.locator('[data-testid="report-button"]').click();
		const editSheet = page.locator('ion-action-sheet');
		await expect(editSheet).toBeVisible({ timeout: 8000 });
		const patchSeen = page.waitForRequest(
			(r) => r.method() === 'PATCH' && RESPONSE_ITEM.test(urlPath(r.url())),
			{ timeout: 12_000 }
		);
		await editSheet.locator('button', { hasText: /^Edit$/ }).click();

		const editModal = page.locator('ion-modal:visible');
		await expect(editModal).toBeVisible({ timeout: 8000 });
		const editArea = editModal.locator('textarea:not(.cloned-input)').first();
		await editArea.click();
		await editArea.fill(editedText);
		await editModal.locator('ion-button', { hasText: /^Save$/ }).click();

		// PATCH body is {id, content}; the edit persists and the modal closes
		expect((await patchSeen).postDataJSON()).toMatchObject({
			id: 'pr-journey-1',
			content: editedText
		});
		await expectNativeToast(page, /successfully updated/i);
		await expect(page.locator('ion-modal:visible')).toHaveCount(0, { timeout: 8000 });
		await expect(page.locator('ion-card').filter({ hasText: editedText })).toBeVisible({
			timeout: 8000
		});

		await mockApi.set({
			backend: 'mantle',
			method: 'DELETE',
			path: RESPONSE_ITEM,
			status: 204,
			body: '',
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: RESPONSES_GET,
			status: 200,
			body: paginate([]),
			once: false
		});

		const editedCard = page.locator('ion-card').filter({ hasText: editedText });
		await editedCard.locator('[data-testid="report-button"]').click();
		const deleteSheet = page.locator('ion-action-sheet');
		await expect(deleteSheet).toBeVisible({ timeout: 8000 });
		const deleteSeen = page.waitForRequest(
			(r) => r.method() === 'DELETE' && RESPONSE_ITEM.test(urlPath(r.url())),
			{ timeout: 12_000 }
		);
		await deleteSheet.locator('button', { hasText: /^Delete$/ }).click();

		await deleteSeen;
		// a destructive confirm dialog must gate the delete (native-mock accepts by default)
		const dialogs = await page.evaluate(() => (window as any).__dialogs ?? []);
		expect(
			dialogs.some(
				(d: any) => d.kind === 'confirm' && /delete this response/i.test(d.message ?? '')
			)
		).toBe(true);
		await expectNativeToast(page, /successfully deleted/i);
		await expect(page.locator('ion-card').filter({ hasText: editedText })).toHaveCount(0, {
			timeout: 8000
		});
	});

	test('an empty response keeps the Post button disabled (no POST fires)', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('pmt-1 mock prompt');
		await asUser();

		let posted = false;
		page.on('request', (r) => {
			if (r.method() === 'POST' && RESPONSES_POST.test(urlPath(r.url()))) posted = true;
		});

		await gotoHydrated('/tabs/prompts/pmt-1');
		const respInput = page.locator('#response-input textarea:not(.cloned-input)');
		await expect(respInput).toBeVisible({ timeout: 12_000 });

		// ion-button reflects disabled via the button-disabled class; Playwright's toBeDisabled
		// is unreliable on ion-button (see report.spec), so assert the class instead
		const postBtn = page.locator('#post-button');
		await expect(postBtn).toHaveClass(/button-disabled/, { timeout: 8000 });

		// whitespace-only trims to empty, so the button stays disabled
		await respInput.click();
		await respInput.fill('     ');
		await expect(postBtn).toHaveClass(/button-disabled/);

		// the disabled Post button never invokes a response POST
		await page.waitForTimeout(600);
		expect(posted).toBe(false);
	});

	test('a response POST 5xx surfaces a formatted error and keeps the draft', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('pmt-1 mock prompt + forced 5xx');
		await asUser();
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: RESPONSES_POST,
			status: 500,
			body: { message: 'The server is temporarily unavailable. Please try again.' },
			once: false
		});

		await gotoHydrated('/tabs/prompts/pmt-1');
		const respInput = page.locator('#response-input textarea:not(.cloned-input)');
		await expect(respInput).toBeVisible({ timeout: 12_000 });

		const draft = 'This is my thoughtful, benign response draft.';
		await respInput.click();
		await respInput.fill(draft);

		const postBtn = page.locator('#post-button');
		await expect(postBtn).not.toHaveClass(/button-disabled/);
		await postBtn.click();

		await expectNativeToast(page, /unavailable|try again|error|unknown|wrong|fail/i);
		// no data loss: the draft survives the failed post
		await expect(respInput).toHaveValue(draft, { timeout: 8000 });

		// error is user-facing prose, never a raw [500]-style transport string
		const toasts: string[] = await page.evaluate(() => (window as any).__toasts ?? []);
		expect(toasts.every((t) => !/\[\d{3}\]/.test(t))).toBe(true);
	});

	test('client moderation blocks an obviously-bad response before it posts', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration('client moderation pre-check (obscenity/spam heuristics)');
		await asUser();
		// if the block ever regressed, this makes the POST succeed instead of hang so the
		// no-POST assertion below stays the meaningful signal
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: RESPONSES_POST,
			status: 201,
			body: makePromptResponse({ id: 'pr-mod', prompt_id: 'pmt-1', response: 'should not post' }),
			once: false
		});

		await gotoHydrated('/tabs/prompts/pmt-1');

		let posted = false;
		page.on('request', (r) => {
			if (r.method() === 'POST' && RESPONSES_POST.test(urlPath(r.url()))) posted = true;
		});

		const respInput = page.locator('#response-input textarea:not(.cloned-input)');
		await expect(respInput).toBeVisible({ timeout: 12_000 });

		// trips the spam heuristic two ways (repeated token + repeated char); no profanity dict needed
		const spam = 'deal '.repeat(15).trim() + ' ' + 'a'.repeat(40);
		await respInput.click();
		await respInput.fill(spam);

		const postBtn = page.locator('#post-button');
		await expect(postBtn).not.toHaveClass(/button-disabled/);
		await postBtn.click();

		await expectNativeToast(page, /looks like spam|inappropriate/i);
		expect(posted).toBe(false);
		// draft is retained, not silently discarded
		await expect(respInput).toHaveValue(spam);
	});
});
