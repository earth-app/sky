import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { makeUser } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';

function usernameInput(page: Page) {
	return page.locator('input[placeholder="Enter your username"]:not(.cloned-input)').first();
}

function bioInput(page: Page) {
	return page.locator('textarea[placeholder="Tell us about yourself"]:not(.cloned-input)').first();
}

function saveButton(page: Page) {
	return page.getByRole('button', { name: /Save Profile/i }).first();
}

async function openEditor(
	page: Page,
	gotoHydrated: (path: string) => Promise<void>
): Promise<void> {
	await gotoTab(page, gotoHydrated, '/tabs/profile/editor');
	await expect(page.getByText('Edit Profile').first()).toBeVisible({ timeout: 15_000 });
	await expect(usernameInput(page)).toBeVisible({ timeout: 12_000 });
}

// in-SPA navigation that preserves the live pinia session (a reload would refetch + drop optimism)
async function pushInApp(page: Page, path: string): Promise<void> {
	await page.evaluate((p) => (window as any).useNuxtApp?.().$router?.push(p), path);
}

async function getToasts(page: Page): Promise<string[]> {
	try {
		return (await page.evaluate(() => (window as any).__toasts ?? [])) as string[];
	} catch {
		return [];
	}
}

// no user-facing toast may leak a raw transport code / api path (the "Sky error formatting" bar)
async function expectNoRawApiToast(page: Page): Promise<void> {
	for (const t of await getToasts(page)) {
		expect(t, `toast leaked a bracketed status code: ${t}`).not.toMatch(/\[\d{3}\]/);
		expect(t, `toast leaked a raw api path: ${t}`).not.toMatch(/\/v2\//);
	}
}

test.describe('Profile edit journey (native ios)', () => {
	test.beforeEach(async ({ context }) => {
		// the editor's native toasts, Dialog.confirm, CapacitorHttp shim + durable Preferences
		// all require isNativePlatform()=true from the mock
		await installNativeMock(context, { platform: 'ios' });
	});

	test('edits avatar, username, bio + privacy in one session and reflects on the public profile', async ({
		page,
		asUser,
		gotoHydrated,
		testId
	}) => {
		skipIfIntegration('mock profile editor mutations + native shell');
		const short = testId.slice(0, 6);
		const oldUsername = `edit-${short}`;
		const newUsername = `renamed${short}`;
		const newBio = 'A fresh biography written during the edit session.';
		const me = await asUser({
			username: oldUsername,
			account: { account_type: 'ORGANIZER', bio: 'An older biography.' }
		});
		const userId = me.id as string;

		// count only the exact profile PATCH so the invalid-username guard can prove none fired
		let profilePatches = 0;
		page.on('request', (r) => {
			if (r.method() === 'PATCH' && /\/v2\/users\/current(\?|$)/.test(r.url())) profilePatches++;
		});

		await openEditor(page, gotoHydrated);

		// 1) flip a field-privacy setting FIRST (email PRIVATE -> PUBLIC) via its own PATCH.
		// a field_privacy success mutates props.user.account, tripping MProfileEditor's deep account
		// watcher which RE-SYNCS the form from the server object - so it must run BEFORE the dirty
		// username/bio edits, else the re-sync wipes them and Save stays disabled
		const privacyPatch = page.waitForRequest(
			(r) => r.method() === 'PATCH' && /\/v2\/users\/current\/field_privacy/.test(r.url()),
			{ timeout: 12_000 }
		);
		await page
			.locator('#privacy ion-select')
			.first()
			.evaluate((el) =>
				el.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'PUBLIC' } }))
			);
		expect((await privacyPatch).postDataJSON()).toMatchObject({ email: 'PUBLIC' });
		// let the deep account watcher's re-sync settle before we start editing the dirty fields
		await page.waitForTimeout(500);

		// 2) avatar area + its generate affordance is present, and generation round-trips
		const regen = page.locator('#avatar ion-button', { hasText: 'Regenerate Avatar' });
		await expect(regen).toBeVisible({ timeout: 12_000 });
		const photoPut = page.waitForRequest(
			(r) => r.method() === 'PUT' && /\/v2\/users\/current\/profile_photo/.test(r.url()),
			{ timeout: 15_000 }
		);
		await regen.click();
		await photoPut;
		await expectNativeToast(page, /avatar regenerated/i);

		// 3) an invalid (spaced) username is rejected inline and never reaches the PATCH
		const username = usernameInput(page);
		await username.click();
		await username.fill('foo bar');
		await saveButton(page).click();
		await expectNativeToast(page, /cannot contain spaces/i);
		expect(profilePatches, 'a spaced username must not reach the profile PATCH').toBe(0);
		await expect(username).toBeVisible(); // form stays open for a retry

		// 4) correct the username + edit the bio - the LAST state changes before Save, so nothing
		// mutates props.user.account after this and hasProfileChanges stays true (Save enabled)
		await username.fill(newUsername);
		const bio = bioInput(page);
		await bio.click();
		await bio.fill(newBio);

		// 5) save - the PATCH carries the new username + bio, then the success toast fires
		const savePatch = page.waitForRequest(
			(r) => r.method() === 'PATCH' && /\/v2\/users\/current(\?|$)/.test(r.url()),
			{ timeout: 15_000 }
		);
		await saveButton(page).click();
		const body = (await savePatch).postDataJSON() ?? {};
		expect(body.username).toBe(newUsername);
		expect(body.bio).toBe(newBio);
		await expectNativeToast(page, /profile updated successfully/i);
		await expectNoRawApiToast(page);

		// 6) reflect on the public profile: a FRESH by-id read shows the NEW handle the mock
		// persisted. only the top-level username round-trips through the flat-merge PATCH (and
		// #profile-title reads exactly that), so we read BY ID; the by-@handle read can't re-key and
		// the editor reads the un-updated account.username. gotoTab reloads, clearing the useUser
		// cache the editor primed, so the read is proven fresh, not stale (bug class E).
		await gotoTab(page, gotoHydrated, `/tabs/profile/${userId}`);
		await expect(page.locator('#profile-title')).toContainText(`@${newUsername}`, {
			timeout: 12_000
		});
		await expect(page.locator('#profile-title')).not.toContainText(oldUsername);

		// 7) the account-type badge holds its value and never flashes to a wrong one
		const badge = page.getByText(/organizer/i).first();
		await expect(badge).toBeVisible({ timeout: 12_000 });
		await page.waitForTimeout(1200);
		await expect(badge).toBeVisible();
	});

	test('a field-privacy change persists after reopening the editor in-session', async ({
		page,
		asUser,
		gotoHydrated,
		testId
	}) => {
		skipIfIntegration('mock field-privacy mutation + native shell');
		await asUser({ username: `privacy-${testId.slice(0, 6)}` });
		await openEditor(page, gotoHydrated);

		const emailPrivacy = page.locator('#privacy ion-select').first();
		await expect(emailPrivacy).toBeVisible({ timeout: 12_000 });

		// flip email PRIVATE -> PUBLIC; the dedicated field_privacy PATCH carries it
		const patch = page.waitForRequest(
			(r) => r.method() === 'PATCH' && /\/v2\/users\/current\/field_privacy/.test(r.url()),
			{ timeout: 12_000 }
		);
		await emailPrivacy.evaluate((el) =>
			el.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'PUBLIC' } }))
		);
		expect((await patch).postDataJSON()).toMatchObject({ email: 'PUBLIC' });
		// the optimistic on-success value applies in the current mount
		await expect
			.poll(() => emailPrivacy.evaluate((el: any) => el.value), { timeout: 8_000 })
			.toBe('PUBLIC');

		// leave + return in-SPA (no reload) so pinia keeps the mutation, then reopen the editor
		await pushInApp(page, '/tabs/dashboard');
		await page.waitForURL(/\/tabs\/dashboard/, { timeout: 12_000 });
		await pushInApp(page, '/tabs/profile/editor');
		await page.waitForURL(/\/tabs\/profile\/editor/, { timeout: 12_000 });

		const reopened = page.locator('ion-content:visible #privacy ion-select').first();
		await expect(reopened).toBeVisible({ timeout: 12_000 });
		await expect
			.poll(() => reopened.evaluate((el: any) => el.value), { timeout: 8_000 })
			.toBe('PUBLIC');
	});

	test('a save 4xx surfaces the formatted server message, never a raw [4xx]', async ({
		page,
		asUser,
		gotoHydrated,
		mockApi,
		testId
	}) => {
		skipIfIntegration('overrides the profile PATCH with a 4xx');
		await asUser({ username: `saveerr-${testId.slice(0, 6)}` });
		await openEditor(page, gotoHydrated);

		// force the save into a 4xx carrying a human message the ui must relay verbatim
		await mockApi.set({
			backend: 'mantle',
			method: 'PATCH',
			path: /^\/v2\/users\/current\/?$/,
			status: 400,
			body: { message: 'We Could Not Save Your Profile Right Now.' },
			once: false
		});

		// a bio-only change avoids the username-change confirm and still fires the PATCH
		const bio = bioInput(page);
		await bio.click();
		await bio.fill('Bio edited into a rejected save.');
		await saveButton(page).click();

		// the formatted server reason shows - not a bracketed [400] and not a raw /v2/ path
		await expectNativeToast(page, /could not save your profile/i);
		await expectNoRawApiToast(page);
		// the form stays open so the user can retry
		await expect(bioInput(page)).toBeVisible();
	});

	test('the account-type badge holds the optimistic value and does not flash-revert on a stale echo', async ({
		page,
		asAdmin,
		gotoHydrated,
		mockApi,
		testId
	}) => {
		skipIfIntegration('admin rank editor + stale-echo override are mock-only');
		await asAdmin({ username: `rankadmin-${testId.slice(0, 6)}` });

		// dedicated target so the mutation never leaks into the shared seeds
		const target = makeUser({
			id: `flash-target-${testId.slice(0, 8)}`,
			username: `flashtgt-${testId.slice(0, 6)}`,
			account: { account_type: 'WRITER' }
		});
		await mockApi.registerUser(target);

		// the PUT echoes the OLD level (WRITER); the flash-revert bug would let this stale echo win
		await mockApi.set({
			backend: 'mantle',
			method: 'PUT',
			path: new RegExp(`/v2/users/${target.id}/account_type`),
			status: 200,
			body: target,
			once: false
		});

		await gotoTab(page, gotoHydrated, `/tabs/profile/${target.id}`);
		await expect(page.locator('#profile-title')).toContainText(
			new RegExp(`@${target.username}`, 'i'),
			{ timeout: 12_000 }
		);

		const editor = page.locator('[data-testid="type-badge-editor"]');
		await expect(editor).toBeVisible({ timeout: 12_000 });
		await expect(editor).toContainText(/writer/i);

		await editor.click();
		const sheet = page.locator('ion-action-sheet');
		await expect(sheet).toBeVisible({ timeout: 8_000 });
		await sheet.locator('button', { hasText: /^Organizer$/ }).click();

		// the optimistic override shows the new level immediately...
		await expect(editor).toContainText(/organizer/i, { timeout: 8_000 });
		// ...and it STICKS despite the stale WRITER echo (overrideType/effectiveType seam)
		await page.waitForTimeout(1200);
		await expect(editor).toContainText(/organizer/i);
		await expect(editor).not.toContainText(/writer/i);
	});
});
