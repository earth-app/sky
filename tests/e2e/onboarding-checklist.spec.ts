import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

// the onboarding checklist + the above-the-fold Getting-Started card both live on the
// dashboard and read the same useOnboarding singleton. these specs drive the mock
// onboarding endpoints (GET state, POST dismiss) rather than any live backend.
const onboardingGet = /^\/v2\/users\/current\/onboarding\/?$/;
const dismissPath = /\/v2\/users\/current\/onboarding\/dismiss\/?$/;

// required (non-optional) steps; generate_avatar is the only optional row, so isComplete
// flips exactly when these are all done and the Getting-Started denominator counts them
const REQUIRED_STEPS = [
	'welcome',
	'pick_interests',
	'first_activity',
	'first_quest_started',
	'first_prompt_response',
	'first_article_read',
	'first_quest_completed',
	'first_friend',
	'verify_email'
];

// a full OnboardingState-shaped body for GET overrides
function onboardingState(overrides: Record<string, any> = {}) {
	const now = Date.now();
	return {
		user_id: 'onboard-user',
		completed_steps: [],
		persona: null,
		interests: [],
		started_at: now,
		finished_at: null,
		dismissed_at: null,
		updated_at: now,
		...overrides
	};
}

// keep a fresh user free of auto-completing signals so the checklist watchers stay quiet
// (email_verified false, no activities, no friends) - 'welcome' still auto-completes
// because the fixture seeds the welcome tour as done
function freshUser(username: string) {
	return {
		username,
		activities: [],
		mutual_count: 0,
		account: { username, email_verified: false }
	};
}

test.describe('Getting-Started card', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('renders above the fold for an incomplete user, before the checklist', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mock onboarding state');
		await asUser(freshUser('gsuser'));
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const card = page.locator('#getting-started');
		await expect(card).toBeVisible({ timeout: 12_000 });
		await expect(card).toBeInViewport();
		await expect(card.getByRole('heading', { name: 'Getting Started' })).toBeVisible();
		// N/M count where M is the required-step total
		await expect(card).toContainText(/\d+\/\d+/);
		// a live progressbar reflects the count
		await expect(card.getByRole('progressbar')).toBeVisible();

		// the checklist below renders once state resolves; assert the card precedes it in the DOM
		await expect(page.locator('#welcome-checklist')).toBeVisible({ timeout: 12_000 });
		const order = await page.evaluate(() => {
			const gs = document.getElementById('getting-started');
			const wc = document.getElementById('welcome-checklist');
			if (!gs || !wc) return null;
			return gs.compareDocumentPosition(wc) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
		});
		expect(order).toBe('before');
	});

	test('"View Checklist" scrolls the checklist into view', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mock onboarding state');
		await asUser(freshUser('gsscrolluser'));
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const card = page.locator('#getting-started');
		await expect(card).toBeVisible({ timeout: 12_000 });

		await card.getByRole('button', { name: 'View Checklist' }).click();

		// the CTA calls scrollIntoView on #welcome-checklist; assert it lands in the viewport
		await expect(page.locator('#welcome-checklist')).toBeInViewport({ timeout: 10_000 });
	});

	test('hides once every required step is complete', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock onboarding state');
		await asUser(freshUser('gscompleteuser'));
		// all required steps done -> isComplete true -> card gates itself off (count 0)
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: onboardingGet,
			status: 200,
			body: { state: onboardingState({ completed_steps: [...REQUIRED_STEPS] }) },
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// the dashboard itself is up
		await expect(page.locator('#title')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#getting-started')).toHaveCount(0);
	});

	test('hides when the onboarding is dismissed', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock onboarding state');
		await asUser(freshUser('gsdismisseduser'));
		// dismissed_at set (and 'welcome' pre-marked so the tour watcher fires no clobbering POST)
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: onboardingGet,
			status: 200,
			body: { state: onboardingState({ completed_steps: ['welcome'], dismissed_at: Date.now() }) },
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await expect(page.locator('#title')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#getting-started')).toHaveCount(0);
	});
});

test.describe('Welcome checklist', () => {
	test.beforeEach(async ({ context }) => {
		await installNativeMock(context, { platform: 'ios' });
	});

	test('"Hide Checklist" dismisses: fires the POST, hides the card, and toasts', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('mock onboarding dismiss + native toast');
		await asUser(freshUser('dismissuser'));
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const checklist = page.locator('#welcome-checklist');
		await expect(checklist).toBeVisible({ timeout: 12_000 });

		const dismissReq = page.waitForRequest(
			(req) => req.method() === 'POST' && dismissPath.test(req.url())
		);
		await checklist.getByRole('button', { name: 'Hide Checklist' }).click();
		await dismissReq;

		// dismiss() resolves true -> success toast, and show becomes false -> card removed
		await expectNativeToast(page, /checklist dismissed/i);
		await expect(page.locator('#welcome-checklist')).toHaveCount(0);
		await expect(page.locator('#getting-started')).toHaveCount(0);
	});

	test('dismiss persists across a reload', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('mock onboarding dismiss persistence');
		await asUser(freshUser('dismisspersistuser'));
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const checklist = page.locator('#welcome-checklist');
		await expect(checklist).toBeVisible({ timeout: 12_000 });

		const dismissReq = page.waitForRequest(
			(req) => req.method() === 'POST' && dismissPath.test(req.url())
		);
		await checklist.getByRole('button', { name: 'Hide Checklist' }).click();
		await dismissReq;
		await expect(page.locator('#welcome-checklist')).toHaveCount(0);

		// the mock records dismissed_at on onboardingFor; re-entering the dashboard rehydrates
		// the singleton from GET, which now reports the dismissal -> stays hidden
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.locator('#title')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#welcome-checklist')).toHaveCount(0);
		await expect(page.locator('#getting-started')).toHaveCount(0);
	});

	test('a failed state fetch shows the retry card, and Retry recovers', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock onboarding fetch failure + retry');
		await asUser(freshUser('retryuser'));
		// persistent 500 so both auto-retry attempts fail and the error card surfaces
		// instead of the checklist silently vanishing
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: onboardingGet,
			status: 500,
			body: { message: 'Internal error' },
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const errorCard = page.locator('#welcome-checklist-error');
		await expect(errorCard).toBeVisible({ timeout: 12_000 });
		const retryBtn = errorCard.getByRole('button', { name: 'Retry' });
		await expect(retryBtn).toBeVisible();
		// the checklist proper must not be present while the fetch is failing
		await expect(page.locator('#welcome-checklist')).toHaveCount(0);

		// arm a healthy response; the newest override matches first and wins over the 500
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: onboardingGet,
			status: 200,
			body: { state: onboardingState({ completed_steps: ['welcome'] }) },
			once: false
		});
		await retryBtn.click();

		await expect(page.locator('#welcome-checklist')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#welcome-checklist-error')).toHaveCount(0);
	});
});
