import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';

// the welcome tour is disabled in the base fixture (earth_app_completed_tours is seeded so it
// never fires). these specs either drive it deterministically via the dashboard "Replay Welcome
// Tour" button or, for the auto-play/durability cases, clear that seed per test so a fresh user
// path runs. the tour renders a teleported role=dialog card (MSiteTour.vue) at body level.

const TOUR_TITLES = [
	'Welcome to The Earth App',
	'Your Tab Bar',
	'Start Here',
	'Discover What You Love',
	'Quests: Guided Adventures',
	"You're All Set"
];

// precise + teleport-safe: the tour card is the only dialog labelled by the tour title
function tourDialog(page: import('@playwright/test').Page) {
	return page.locator('[role="dialog"][aria-labelledby="site-tour-title"]');
}

// clears the fixture's completed-tours seed AFTER it runs, so a fresh-user path can auto-play.
// leaves the durable Preferences mirror (CapacitorStorage.sky:welcome-tour-completed) untouched
async function enableFreshUserTour(context: import('@playwright/test').BrowserContext) {
	await context.addInitScript(() => {
		try {
			window.localStorage.removeItem('earth_app_completed_tours');
		} catch {
			// localStorage unavailable; nothing to clear
		}
	});
}

test.describe('Welcome tour', () => {
	test('auto-plays for a fresh user landing on the dashboard', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('drives mock onboarding chain');
		await asUser({ username: 'touruser' });
		await enableFreshUserTour(context);
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// the onboarding chain (username -> text-size -> tour) has short polling delays, so poll
		// the teleported dialog + first title within a generous window rather than racing it
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 20_000 });
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[0] })).toBeVisible({
			timeout: 20_000
		});
	});

	test('exposes an accessible dialog and a labelled close control', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('opens the tour via the dashboard replay button');
		await asUser({ username: 'touruser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		const replay = page.getByRole('button', { name: 'Replay Welcome Tour' });
		await expect(replay).toBeVisible({ timeout: 12_000 });
		await replay.click();

		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });
		await expect(dialog).toHaveAttribute('aria-modal', 'true');
		await expect(dialog).toHaveAttribute('aria-labelledby', 'site-tour-title');

		// the label target is the visible title heading
		const title = dialog.locator('#site-tour-title');
		await expect(title).toBeVisible();
		await expect(title).toHaveText(TOUR_TITLES[0]!);

		await expect(dialog.getByRole('button', { name: 'Close tour' })).toBeVisible();
	});

	test('steps forward through titles and back again', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('opens the tour via the dashboard replay button');
		await asUser({ username: 'touruser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await page.getByRole('button', { name: 'Replay Welcome Tour' }).click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[0] })).toBeVisible();

		// forward: Welcome -> Your Tab Bar -> Start Here
		await dialog.locator('[data-tour-next]').click();
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[1] })).toBeVisible({
			timeout: 8_000
		});
		await dialog.locator('[data-tour-next]').click();
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[2] })).toBeVisible({
			timeout: 8_000
		});

		// back: Start Here -> Your Tab Bar
		await dialog.getByRole('button', { name: 'Back' }).click();
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[1] })).toBeVisible({
			timeout: 8_000
		});
	});

	test('finishing CTA on the last step routes to quests', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('opens the tour via the dashboard replay button');
		await asUser({ username: 'touruser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await page.getByRole('button', { name: 'Replay Welcome Tour' }).click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// advance through every remaining step to reach "You're All Set"
		for (const title of TOUR_TITLES.slice(1)) {
			await dialog.locator('[data-tour-next]').click();
			await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 8_000 });
		}

		await dialog.getByRole('button', { name: 'Start Your First Quest' }).click();
		await page.waitForURL(/\/tabs\/quests(\/|$)/, { timeout: 10_000 });
	});

	test('close button dismisses the tour', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('opens the tour via the dashboard replay button');
		await asUser({ username: 'touruser' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await page.getByRole('button', { name: 'Replay Welcome Tour' }).click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		await dialog.getByRole('button', { name: 'Close tour' }).click();
		await expect(dialog).toBeHidden({ timeout: 8_000 });
	});

	test('completion survives a completed-tours wipe and does not replay', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('guards the ios localStorage-reclamation replay fix');
		await asUser({ username: 'touruser' });
		await enableFreshUserTour(context);
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		// open deterministically and click Next through to Finish (stays on the dashboard)
		await page.getByRole('button', { name: 'Replay Welcome Tour' }).click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });
		for (const title of TOUR_TITLES.slice(1)) {
			await dialog.locator('[data-tour-next]').click();
			await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 8_000 });
		}
		// last step's Next reads "Finish" and closes the tour on completion
		await dialog.locator('[data-tour-next]').click();
		await expect(dialog).toBeHidden({ timeout: 8_000 });

		// completion mirrored into durable Preferences (localStorage key survives our per-test wipe)
		await expect
			.poll(
				() =>
					page.evaluate(() =>
						window.localStorage.getItem('CapacitorStorage.sky:welcome-tour-completed')
					),
				{ timeout: 8_000 }
			)
			.toBe('true');

		// reload: our init script wipes earth_app_completed_tours again (simulating reclamation);
		// restoreWelcomeTourCompletion must re-seed from the mirror so the tour never auto-replays
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		// let the onboarding chain's delays elapse, then assert the tour stayed closed
		await page.waitForTimeout(4_000);
		// the tour dialog staying hidden is the real no-replay signal; do not assert on the
		// page heading text, which substring-matches the MOTD card's "Welcome to The Earth App!"
		await expect(dialog).toBeHidden();
	});

	test('leaving mid-tour surfaces a resume chip on the dashboard', async ({
		page,
		context,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('resume chip reads the sky:welcome-tour-resume-step preference');
		await asUser({ username: 'touruser' });
		await enableFreshUserTour(context);
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await page.getByRole('button', { name: 'Replay Welcome Tour' }).click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// advance two steps so the persisted resume index is > 0
		await dialog.locator('[data-tour-next]').click();
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[1] })).toBeVisible({
			timeout: 8_000
		});
		await dialog.locator('[data-tour-next]').click();
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[2] })).toBeVisible({
			timeout: 8_000
		});

		await dialog.getByRole('button', { name: 'Close tour' }).click();
		await expect(dialog).toBeHidden({ timeout: 8_000 });

		// close-tour persists the resume step into Preferences (localStorage on web)
		await expect
			.poll(
				() =>
					page.evaluate(() =>
						window.localStorage.getItem('CapacitorStorage.sky:welcome-tour-resume-step')
					),
				{ timeout: 8_000 }
			)
			.toBeTruthy();

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.getByText('Pick up your tour where you left off')).toBeVisible({
			timeout: 12_000
		});
	});
});

test.describe('Welcome tour resilience (no phantom-id errors)', () => {
	// ids removed from the reshaped tour: the welcome/finish steps are centered (no id) and the
	// discover/quests steps now point at the real tab buttons, so these must never be looked up
	const REMOVED_PHANTOM_IDS = [
		'"title"',
		'"discover-orientation"',
		'"quests-orientation"',
		'"finish"'
	];

	test('replays cleanly with no missing-target warnings and centers the first step', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('opens the tour via the dashboard replay button');
		await asUser({ username: 'touruser' });

		const tourWarnings: string[] = [];
		page.on('console', (msg) => {
			const text = msg.text();
			if (text.includes('not found for tour highlight') || text.includes('no visible bounds')) {
				tourWarnings.push(text);
			}
		});

		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await page.getByRole('button', { name: 'Replay Welcome Tour' }).click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });
		await expect(dialog.getByRole('heading', { name: TOUR_TITLES[0] })).toBeVisible();

		// the first step is an intentional centered welcome step (no target id): its card sits in
		// the MIDDLE of the viewport, not pinned to the top under the notch (the fallback fix)
		const viewport = page.viewportSize();
		expect(viewport).not.toBeNull();
		if (viewport) {
			await expect
				.poll(
					async () => {
						const box = await dialog.boundingBox();
						if (!box) return Number.POSITIVE_INFINITY;
						return Math.abs(box.y + box.height / 2 - viewport.height / 2);
					},
					{ timeout: 5_000 }
				)
				.toBeLessThan(viewport.height * 0.3);
		}

		// advance through every remaining step; a phantom id would throw or blank the step
		for (const title of TOUR_TITLES.slice(1)) {
			await dialog.locator('[data-tour-next]').click();
			await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 8_000 });
		}

		// no removed phantom id was ever looked up (getting-started may still warn-and-center if
		// the onboarding card is absent - that path is allowed and handled by the fallback)
		for (const warning of tourWarnings) {
			for (const id of REMOVED_PHANTOM_IDS) {
				expect(warning).not.toContain(id);
			}
		}
	});

	test('MTourButton shows an attention ring when unseen and starts its tour on click', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('drives the discover MTourButton + its site tour');
		await asUser({ username: 'touruser' });

		// discover-index is not in the fixture completed-tours seed, so the ring should surface
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await gotoTab(page, gotoHydrated, '/tabs/discover');

		const tourButton = page.locator('#discover-help');
		await expect(tourButton).toBeVisible({ timeout: 12_000 });
		// ring appears once the empty seen-flag resolves from Preferences
		await expect(tourButton).toHaveClass(/m-tour-button--attn/, { timeout: 8_000 });

		await tourButton.click();
		const dialog = tourDialog(page);
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// clicking marks the tour seen, so the ring stops pulsing
		await expect(tourButton).not.toHaveClass(/m-tour-button--attn/, { timeout: 8_000 });
	});
});
