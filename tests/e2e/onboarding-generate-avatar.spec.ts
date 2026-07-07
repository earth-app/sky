import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { MANTLE_PORT } from './utils/mock-server';
import { installNativeMock } from './utils/native-mock';

// the optional "Generate Avatar" onboarding step reuses the profile editor's
// regenerateAvatar() call (PUT /v2/users/current/profile_photo). the cloud prompt
// seeds primarily from username + full name (activities are additive), so a
// brand-new user with zero activities still gets a photo, and users re-roll freely.
// completion is DERIVED: the step is done only while the user has a custom avatar
// (GET profile_photo returns bytes); a default placeholder keeps it a to-do.
// not start-anchored: waitForRequest matches these against the FULL request url
// (http://host:port/v2/...), while mockApi.set matches the source against the pathname
const profilePhotoPut = /\/v2\/users\/current\/profile_photo\/?$/;
const onboardingStepPath = /\/v2\/users\/current\/onboarding\/step\/?$/;

// give the user a real (mock-backed) avatar_url so the has-custom-avatar signal
// resolves against the mock GET profile_photo route
function avatarUser(testId: string, username: string) {
	const id = `av-${testId.slice(0, 8)}`;
	return {
		id,
		username,
		full_name: 'Ava Tar',
		activities: [],
		account: {
			avatar_url: `http://127.0.0.1:${MANTLE_PORT}/v2/users/${id}/profile_photo`
		}
	};
}

async function openChecklist(page: any) {
	const checklist = page.locator('#welcome-checklist');
	await expect(checklist).toBeVisible({ timeout: 12_000 });
	return checklist;
}

test.describe('Onboarding Generate Avatar step', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('stays pending with NO avatar, then a successful generate auto-completes it', async ({
		page,
		gotoHydrated,
		asUser,
		testId
	}) => {
		skipIfIntegration('mock onboarding + profile_photo');
		// no activities, and the default mock GET profile_photo 404s -> no custom avatar
		await asUser(avatarUser(testId, 'avataruser'));
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const checklist = await openChecklist(page);
		// pending: the CTA reads Generate (not Regenerate) and is actionable
		const genBtn = checklist.getByRole('button', { name: 'Generate Avatar', exact: true });
		await expect(genBtn).toBeEnabled({ timeout: 8_000 });
		await expect(checklist.getByRole('button', { name: 'Regenerate Avatar' })).toHaveCount(0);

		const putReq = page.waitForRequest(
			(req: any) => req.method() === 'PUT' && profilePhotoPut.test(req.url())
		);
		const stepReq = page.waitForRequest(
			(req: any) =>
				req.method() === 'POST' &&
				onboardingStepPath.test(req.url()) &&
				JSON.parse(req.postData() || '{}').step === 'generate_avatar'
		);

		await genBtn.click();
		await putReq;

		await expectNativeToast(page, /avatar generated/i);
		// the has-avatar watcher persists the step; CTA relabels to Regenerate (re-roll)
		await stepReq;
		await expect(checklist.getByRole('button', { name: 'Regenerate Avatar' })).toBeVisible({
			timeout: 8_000
		});
	});

	test('auto-completes on load when the user already has a custom avatar (no click)', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi,
		testId
	}) => {
		skipIfIntegration('mock onboarding + profile_photo');
		const user = avatarUser(testId, 'hasavataruser');
		await asUser(user);
		// user already has a generated avatar: GET profile_photo returns bytes
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /\/v2\/users\/[^/]+\/profile_photo/,
			status: 200,
			body: {},
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const checklist = await openChecklist(page);
		// derived-done without any interaction: CTA is the re-roll label
		await expect(checklist.getByRole('button', { name: 'Regenerate Avatar' })).toBeVisible({
			timeout: 8_000
		});
	});

	test('re-roll: regenerating again fires another update (no once-only gating)', async ({
		page,
		gotoHydrated,
		asUser,
		testId
	}) => {
		skipIfIntegration('mock onboarding + profile_photo');
		await asUser(avatarUser(testId, 'rerolluser'));
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const checklist = await openChecklist(page);

		// first generation flips the step to done
		const put1 = page.waitForRequest(
			(req: any) => req.method() === 'PUT' && profilePhotoPut.test(req.url())
		);
		await checklist.getByRole('button', { name: 'Generate Avatar', exact: true }).click();
		await put1;

		const regenBtn = checklist.getByRole('button', { name: 'Regenerate Avatar' });
		await expect(regenBtn).toBeVisible({ timeout: 8_000 });
		await expect(regenBtn).toBeEnabled();

		// second generation - re-roll must be allowed after completion
		const put2 = page.waitForRequest(
			(req: any) => req.method() === 'PUT' && profilePhotoPut.test(req.url())
		);
		await regenBtn.click();
		await put2;
		await expect(regenBtn).toBeEnabled({ timeout: 8_000 });
	});

	test('error: a degraded/500 result surfaces a toast, clears the spinner, and does not complete the step', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi,
		testId
	}) => {
		skipIfIntegration('overrides profile_photo with an error');
		await asUser(avatarUser(testId, 'erroravataruser'));
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// force the generate endpoint into a graceful degraded/error result
		await mockApi.set({
			backend: 'mantle',
			method: 'PUT',
			path: profilePhotoPut,
			status: 500,
			body: { message: 'Avatar Generation is Temporarily Unavailable.' },
			once: false
		});

		const stepBodies: string[] = [];
		page.on('request', (req: any) => {
			if (req.method() === 'POST' && onboardingStepPath.test(req.url())) {
				stepBodies.push(JSON.parse(req.postData() || '{}').step);
			}
		});

		const checklist = await openChecklist(page);
		const genBtn = checklist.getByRole('button', { name: 'Generate Avatar', exact: true });
		await expect(genBtn).toBeEnabled({ timeout: 8_000 });
		await genBtn.click();

		// regenerateAvatar requests responseType:'blob', so ofetch can't parse the JSON error
		// body into a message; the toast shows the generic server error. the point of this test
		// is that an error toast fires (not the exact copy), the spinner clears, no false complete
		await expectNativeToast(
			page,
			/temporarily unavailable|avatar generation failed|internal server error/i
		);

		// no stuck spinner: the CTA returns to its labeled, enabled Generate state
		await expect(genBtn).toBeEnabled({ timeout: 8_000 });
		await expect(genBtn).toBeVisible();
		// the step must NOT be falsely completed on failure
		expect(stepBodies).not.toContain('generate_avatar');
	});

	test('sparse user: missing account fields do not crash the step', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock sparse user + profile_photo');
		const user = await asUser({ username: 'sparseuser' });
		// replace with a bare native-shaped user: no activities and a minimal account
		// (no avatar_url) to exercise the absent-field guards
		await mockApi.registerUser({
			id: user.id,
			username: 'sparseuser',
			account: { username: 'sparseuser', email_verified: true }
		});
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const checklist = await openChecklist(page);
		const genBtn = checklist.getByRole('button', { name: 'Generate Avatar', exact: true });
		await expect(genBtn).toBeEnabled({ timeout: 8_000 });

		const putReq = page.waitForRequest(
			(req: any) => req.method() === 'PUT' && profilePhotoPut.test(req.url())
		);
		await genBtn.click();
		await putReq;

		// success path runs even with no avatar_url to reprime; no crash, toast fires
		await expectNativeToast(page, /avatar generated/i);
		await expect(checklist).toBeVisible();
	});
});

test.describe('Profile editor Regenerate Avatar attention ring', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('rings when the user has no custom avatar', async ({
		page,
		gotoHydrated,
		asUser,
		testId
	}) => {
		skipIfIntegration('mock profile_photo 404');
		// default mock GET profile_photo 404s -> default placeholder -> ring
		await asUser(avatarUser(testId, 'ringuser'));
		await gotoTab(page, gotoHydrated, '/tabs/profile/editor');

		// ring lives on the ion-button host; scope to the editor avatar so we don't
		// collide with the dashboard checklist (kept mounted mid-transition), whose
		// CTA also reads Regenerate once the user has a custom avatar
		const regen = page.locator('#avatar ion-button', { hasText: 'Regenerate Avatar' });
		await expect(regen).toBeVisible({ timeout: 12_000 });
		// the attention ring class lands once the store confirms the 404
		await expect(regen).toHaveClass(/animate-pulse/, { timeout: 8_000 });
	});

	test('drops the ring once the user has a custom avatar', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi,
		testId
	}) => {
		skipIfIntegration('mock profile_photo 200');
		await asUser(avatarUser(testId, 'noringuser'));
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /\/v2\/users\/[^/]+\/profile_photo/,
			status: 200,
			body: {},
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/profile/editor');

		// ring lives on the ion-button host; scope to the editor avatar so we don't
		// collide with the dashboard checklist (kept mounted mid-transition), whose
		// CTA also reads Regenerate once the user has a custom avatar
		const regen = page.locator('#avatar ion-button', { hasText: 'Regenerate Avatar' });
		await expect(regen).toBeVisible({ timeout: 12_000 });
		// give the avatar fetch a beat to resolve; a loaded avatar must not ring
		await page.waitForTimeout(1500);
		await expect(regen).not.toHaveClass(/animate-pulse/);
	});
});
