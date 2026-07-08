import type { BrowserContext, Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { expectNativeToast, gotoTab } from './utils/journey-helpers';
import type { MockClient } from './utils/mock-client';
import { installNativeMock } from './utils/native-mock';

const TOUR_TITLES = [
	'Welcome to The Earth App',
	'Your Tab Bar',
	'Start Here',
	'Discover What You Love',
	'Quests: Guided Adventures',
	"You're All Set"
];

// removed from the reshaped tour; a lookup of any of these is the phantom-id regression
const REMOVED_PHANTOM_IDS = [
	'"title"',
	'"discover-orientation"',
	'"quests-orientation"',
	'"finish"'
];

// required onboarding steps; all present flips isComplete so the card/checklist hide
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

// the teleported tour card is the only dialog labelled by the tour title
function tourDialog(page: Page) {
	return page.locator('[role="dialog"][aria-labelledby="site-tour-title"]');
}

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

// force a fresh-onboarding pref state on every full load: clear the tour-completed localStorage
// seed, drop the text-size "seen" flag, and mark the oauth username prompt pending so the full
// visible chain (username -> text-size -> tour) plays. runs after native-mock so __prefs exists.
async function seedFreshOnboarding(context: BrowserContext) {
	await context.addInitScript(() => {
		try {
			window.localStorage.removeItem('earth_app_completed_tours');
		} catch {
			// localStorage unavailable; the durable Preferences mirror is not seeded either
		}
		const w = window as any;
		if (w.__prefs) {
			delete w.__prefs['sky:has-seen-text-size-prompt'];
			w.__prefs['sky:oauth-username-prompt-pending'] = 'true';
		}
	});
}

// bind the just-created signup user as current for this test + persist a token so the shell
// treats subsequent cold loads as authenticated (identity resolves via the testId mapping)
async function bindSignedUpUser(
	context: BrowserContext,
	mockApi: MockClient,
	username: string,
	testId: string
): Promise<string> {
	const uid = `new-${username}`;
	const token = `mock-token-${testId}`;
	await mockApi.loginAs(uid, token);
	await context.addCookies([
		{
			name: 'session_token',
			value: token,
			domain: '127.0.0.1',
			path: '/',
			sameSite: 'Lax',
			secure: false
		}
	]);
	await context.addInitScript((t) => {
		try {
			window.localStorage.setItem('session_token', t);
		} catch {
			// localStorage unavailable; bootstrapAuth falls back to Preferences/cookie
		}
	}, token);
	return uid;
}

test.describe('New-user onboarding journey', () => {
	test('signs up, verifies email, walks the onboarding chain, and lands on the dashboard toward the first quest', async ({
		page,
		context,
		mockApi,
		gotoHydrated,
		asAnonymous,
		testId
	}) => {
		skipIfIntegration('drives mock signup/verify/onboarding + native deep-link shell');

		// capture the two console classes that historically break this flow across the whole run
		const cyclicErrors: string[] = [];
		const missingTourWarnings: string[] = [];
		page.on('console', (msg) => {
			const t = msg.text();
			if (/Converting circular structure to JSON/i.test(t)) cyclicErrors.push(t);
			if (t.includes('not found for tour highlight') || t.includes('no visible bounds'))
				missingTourWarnings.push(t);
		});

		await installNativeMock(context, { platform: 'ios' });
		await seedFreshOnboarding(context);
		await asAnonymous();

		// --- signup seam: form -> submit -> verify-email handoff ---
		await gotoHydrated('/signup');
		await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible();

		const username = `journey${testId.slice(0, 6)}`;
		await page.getByPlaceholder(/me@example\.com/i).fill(`${username}@example.com`);
		await page.getByPlaceholder(/cooldude78/i).fill(username);
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');
		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		await page.waitForURL(/\/verify-email/, { timeout: 12_000 });
		await expectNativeToast(page, /verification email/i);

		// --- verify seam: the created user is unverified; enter the 8-digit code ---
		await bindSignedUpUser(context, mockApi, username, testId);
		await gotoHydrated('/verify-email');

		await expect(page.getByText(/Email Verification/i).first()).toBeVisible({ timeout: 12_000 });

		// a stray fresh-user welcome tour can overlay the verify screen; dismiss it so the code
		// field is reachable (the real tour still plays later on the dashboard chain)
		const strayTour = tourDialog(page);
		if (await strayTour.isVisible().catch(() => false)) {
			await strayTour.getByRole('button', { name: 'Close tour' }).click();
			await expect(strayTour).toBeHidden({ timeout: 5_000 });
		}

		const codeInput = page.getByPlaceholder(/12345678/i);
		await codeInput.click();
		await codeInput.fill('12345678');
		await page.getByRole('button', { name: /^Verify$/i }).click();

		// 204 -> onEmailVerified routes into the profile editor
		await page.waitForURL(/\/tabs\/profile\/editor/, { timeout: 12_000 });

		// --- onboarding chain + dashboard seams ---
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// step 1: username prompt (oauth-pending seeded) -> keep the auto username
		const usernameHeading = page.getByRole('heading', { name: 'Pick a Username' });
		await expect(usernameHeading).toBeVisible({ timeout: 20_000 });
		await page.getByRole('button', { name: 'Keep This Username' }).click();
		await expect(usernameHeading).toBeHidden({ timeout: 10_000 });
		// durable: skipping clears the one-shot pending flag
		await expect
			.poll(() =>
				page.evaluate(() => (window as any).__prefs?.['sky:oauth-username-prompt-pending'])
			)
			.toBeFalsy();

		// step 2: text-size prompt hands off from the username step
		const textSizeHeading = page.getByRole('heading', { name: 'How does this Look?' });
		await expect(textSizeHeading).toBeVisible({ timeout: 15_000 });
		await page.locator('button[role="radio"]').filter({ hasText: 'A bit bigger' }).click();
		await page.getByRole('button', { name: 'Looks Good' }).click();
		await expect(textSizeHeading).toBeHidden({ timeout: 10_000 });
		// durable: confirming records the "seen" flag
		await expect
			.poll(() => page.evaluate(() => (window as any).__prefs?.['sky:has-seen-text-size-prompt']))
			.toBe('true');

		// step 3: welcome tour auto-plays once text-size closes
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 20_000 });
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[0] })).toBeVisible({
			timeout: 20_000
		});

		// dashboard content renders under the tour (fresh-user getting-started card + hero + feed)
		await expect(page.locator('#getting-started')).toBeVisible({ timeout: 12_000 });
		const hero = page.getByRole('heading', { name: /Your Journeys/i });
		await expect(hero).toBeVisible({ timeout: 12_000 });
		// hydration-flash guard: the hero must not flash-then-hide once shown
		await page.waitForTimeout(500);
		await expect(hero).toBeVisible();
		await expect(page.getByRole('heading', { name: /Your Feed/i })).toBeVisible({
			timeout: 12_000
		});
		await expect
			.poll(async () => page.locator('ion-card').count(), { timeout: 15_000 })
			.toBeGreaterThan(0);

		// finish CTA leads toward the first quest
		for (const title of TOUR_TITLES.slice(1)) {
			await dialog.locator('[data-tour-next]').click();
			await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 8_000 });
		}
		await dialog.getByRole('button', { name: 'Start Your First Quest' }).click();
		await page.waitForURL(/\/tabs\/quests(\/|$)/, { timeout: 10_000 });

		// durable: finishing (even via the CTA) mirrors completion into Preferences
		await expect
			.poll(() => page.evaluate(() => (window as any).__prefs?.['sky:welcome-tour-completed']), {
				timeout: 8_000
			})
			.toBe('true');

		// seam guards for the whole journey
		expect(cyclicErrors, `unhead cyclic-json (H): ${cyclicErrors.join('\n')}`).toEqual([]);
		expect(
			missingTourWarnings,
			`tour target lookups failed: ${missingTourWarnings.join('\n')}`
		).toEqual([]);
	});
});

test.describe('New-user onboarding journey (edge cases)', () => {
	test('a signup validation error keeps the user on the form', async ({
		page,
		gotoHydrated,
		asAnonymous
	}) => {
		// client-side validation, backend-independent (no skipIfIntegration)
		await asAnonymous();
		await gotoHydrated('/signup');

		// a username with a space fails the no-whitespace rule before any network call
		await page.getByPlaceholder(/cooldude78/i).fill('has space');
		await page.getByPlaceholder(/SuperSecretPassword/i).fill('SuperSecretPassword_');
		await page.getByRole('button', { name: /^Sign Up$/i }).click();

		await expect(
			page
				.locator('#signup-form')
				.getByText(/cannot contain spaces/i)
				.first()
		).toBeVisible({ timeout: 10_000 });
		expect(page.url()).not.toMatch(/\/verify-email/);
		expect(page.url()).not.toMatch(/\/tabs(\/|$)/);
	});

	test('an already-verified user skips the code-entry screen', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('depends on the email_verified override');
		await installNativeMock(context, { platform: 'ios' });
		await asUser({
			username: 'verifieduser',
			account: { username: 'verifieduser', email_verified: true, email: 'verified@example.com' }
		});
		await gotoHydrated('/verify-email');

		await expect(page.getByText(/already verified/i)).toBeVisible({ timeout: 12_000 });
		await expect(page.getByRole('button', { name: 'Back to Profile' })).toBeVisible();
		// the 8-digit code field must not render
		await expect(page.getByPlaceholder(/12345678/i)).toHaveCount(0);
	});

	test('replaying the tour after onboarding is complete centers gracefully and does not error', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('mock onboarding complete state');

		const tourWarnings: string[] = [];
		const pageErrors: string[] = [];
		page.on('console', (msg) => {
			const t = msg.text();
			if (t.includes('not found for tour highlight') || t.includes('no visible bounds'))
				tourWarnings.push(t);
		});
		page.on('pageerror', (err) => pageErrors.push(String(err)));

		await asUser({ username: 'tourdone', account: { username: 'tourdone', email_verified: true } });
		// every required step complete -> getting-started + checklist gate themselves off
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/onboarding\/?$/,
			status: 200,
			body: { state: onboardingState({ completed_steps: [...REQUIRED_STEPS] }) },
			once: false
		});
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await expect(page.locator('#title')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#getting-started')).toHaveCount(0);
		await expect(page.locator('#welcome-checklist')).toHaveCount(0);

		await page.getByRole('button', { name: 'Replay Welcome Tour' }).click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[0] })).toBeVisible();

		// step through every title; the "Start Here" step's target (#getting-started) is absent for
		// a completed user, so it must center gracefully rather than throw or blank
		for (const title of TOUR_TITLES.slice(1)) {
			await dialog.locator('[data-tour-next]').click();
			await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 8_000 });
		}

		// no tour-related uncaught error, and no phantom-id lookup (a getting-started warn is allowed)
		const tourPageErrors = pageErrors.filter((e) => /tour|highlight|bounds/i.test(e));
		expect(tourPageErrors, tourPageErrors.join('\n')).toEqual([]);
		for (const w of tourWarnings) for (const id of REMOVED_PHANTOM_IDS) expect(w).not.toContain(id);
	});
});
