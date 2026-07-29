import type { BrowserContext, Page } from '@playwright/test';
import {
	collectCoherence,
	settleAnimations,
	settleOverlayAnimations,
	summarize,
	type CoherenceOptions,
	type CoherenceReport
} from './utils/a11y-helpers';
import { suppressV060Tours } from './utils/feature-helpers';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeEvent, makeNotification, makeUser, paginate } from './utils/mock-data';
import { installNativeMock } from './utils/native-mock';
import { seedStepTypeQuestActive, STEP_TYPE_QUEST_ID } from './utils/quest-helpers';

/**
 * UI-coherence gate: does the surface hold together as a layout, on the surfaces the
 * other gates never reach. `layout.mobile.spec.ts` measures the tab pages; every
 * modal, sheet, drawer, popover, action sheet and toast in this app only exists after
 * an interaction, so none of them was ever measured. A malformed table shipped inside
 * the profile's "View Points" sheet because of exactly that hole.
 *
 * Five audits per surface, all from one in-page geometry pass (see `collectCoherence`):
 * content cut off by a clipping ancestor, sideways scroll that is not a deliberate
 * rail, interactive boxes stacked on top of each other, malformed tables, and text
 * crammed into less space than it needs.
 */

const MODAL = 'ion-modal.show-modal';
const POPOVER = 'ion-popover:not(.overlay-hidden)';
const SHEET = 'ion-action-sheet:not(.overlay-hidden)';
const TOAST_HOST = '.m-toast-host';

// #region assertions

/**
 * All five audits are soft so one surface reports every defect it has in a single
 * run; a soft failure still fails the test, it just does not short-circuit the rest.
 */
function assertCoherent(surface: string, r: CoherenceReport): void {
	expect
		.soft(
			summarize(r.clipped),
			`${surface}: ${r.clipped.length}/${r.candidates} boxes are cut off by a clipping ancestor`
		)
		.toBe('');
	expect
		.soft(
			summarize(r.hscroll),
			`${surface}: scroll containers scroll sideways without being a rail`
		)
		.toBe('');
	expect
		.soft(
			summarize(r.overlaps),
			`${surface}: ${r.overlaps.length} interactive pairs overlap past the 25% budget (of ${r.interactives} measured)`
		)
		.toBe('');
	expect
		.soft(
			summarize(r.tableIssues),
			`${surface}: ${r.tables} tables / ${r.tableRows} rows are malformed`
		)
		.toBe('');
	expect
		.soft(
			summarize(r.tightGaps),
			`${surface}: ${r.tightGaps.length}/${r.pairs} stacked text pairs touch or overlap`
		)
		.toBe('');
	expect
		.soft(
			summarize(r.shortLines),
			`${surface}: ${r.shortLines.length}/${r.textBoxes} text boxes are shorter than one of their own lines`
		)
		.toBe('');
	expect
		.soft(
			r.scrollWidth,
			`${surface}: the document scrolls horizontally (${r.scrollWidth}px of content in a ${r.clientWidth}px viewport)`
		)
		.toBeLessThanOrEqual(r.clientWidth + 1);
}

/** Settle, measure, assert. A surface that measures nothing is a broken test, not a pass. */
async function audit(
	page: Page,
	surface: string,
	opts: CoherenceOptions = {}
): Promise<CoherenceReport> {
	await settleAnimations(page, surface);
	if (opts.rootSelector) await settleOverlayAnimations(page, surface);
	const report = await collectCoherence(page, opts);
	expect(
		report.candidates,
		`${surface}: the audit measured no text or interactive boxes at all`
	).toBeGreaterThan(0);
	assertCoherent(surface, report);
	return report;
}

// #endregion

// #region openers

/** Keep the shell interactive: no auto tour, no first-launch onboarding modal. */
async function quietShell(context: BrowserContext): Promise<void> {
	await installNativeMock(context, { platform: 'ios' });
	await suppressV060Tours(context);
	// index auto-opens the onboarding quest modal on a first-ever launch, which would
	// cover the page; runs after native-mock so it merges into its prefs store
	await context.addInitScript(() => {
		const w = window as unknown as { __prefs?: Record<string, string> };
		w.__prefs = { ...(w.__prefs ?? {}), hasOpened: 'true' };
	});
}

async function openContentDrawer(page: Page, triggerId: string, title: string): Promise<void> {
	await expect(page.locator(triggerId)).toBeVisible({ timeout: 15_000 });
	await page.locator(triggerId).click();
	const drawer = page.locator(MODAL);
	await expect(drawer).toBeVisible({ timeout: 12_000 });
	// exact: the points sheet also carries a "12,480 Points" total heading
	await expect(drawer.getByRole('heading', { name: title, exact: true })).toBeVisible({
		timeout: 12_000
	});
}

/** The report kebab -> action sheet -> the report modal, as in report.spec.ts. */
async function openReportMenu(page: Page): Promise<void> {
	await page.locator('[data-testid="report-slot"] ion-button').click();
	await expect(page.locator(SHEET)).toBeVisible({ timeout: 12_000 });
}

/**
 * The in-app toast dismisses itself after its dwell (3.2s for info), which can expire
 * while the animation poll is still settling. Raise it again rather than measure air.
 */
async function auditToast(page: Page, surface: string, raise: () => Promise<void>): Promise<void> {
	for (let attempt = 1; attempt <= 3; attempt++) {
		await raise();
		await expect(page.locator('.m-toast').first()).toBeVisible({ timeout: 12_000 });
		await settleOverlayAnimations(page, surface);
		if ((await page.locator('.m-toast').count()) === 0) continue;
		const report = await collectCoherence(page, { rootSelector: TOAST_HOST });
		if (report.candidates === 0) continue;
		assertCoherent(surface, report);
		return;
	}
	throw new Error(`${surface}: the toast dismissed itself before it could be measured, 3x over`);
}

// #endregion

test.describe('UI coherence on interaction surfaces (mobile)', () => {
	test.beforeEach(async ({ context }) => {
		test.slow();
		await quietShell(context);
	});

	test('profile: View Badges sheet', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		const user = await asUser({ username: 'coherbadges' });

		await gotoTab(page, gotoHydrated, `/tabs/profile/${user.id}`);
		await openContentDrawer(page, '#badges', 'Badges');
		await expect(page.locator(`${MODAL} ion-searchbar`)).toBeVisible({ timeout: 12_000 });

		await audit(page, 'profile View Badges sheet (MContentDrawer)', { rootSelector: MODAL });
	});

	test('profile: View Points sheet', async ({ page, gotoHydrated, asUser, mockApi }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		const user = await asUser({ username: 'coherpoints' });

		// the default mock has no points route, so the table would render empty and the
		// table audit would be vacuous; seed a history with a long reason and a negative
		// change so the Date/Change/Reason columns all carry real content
		const now = Date.now();
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/[^/]+\/points\/?$/,
			status: 200,
			body: {
				points: 12_480,
				history: [
					{
						reason: 'Completed the Daily Explorer quest',
						difference: 120,
						timestamp: now - 60_000
					},
					{ reason: 'Answered a prompt', difference: 25, timestamp: now - 3_600_000 },
					{ reason: 'Wrote an article', difference: 300, timestamp: now - 7_200_000 },
					{ reason: 'Expired event signup reverted', difference: -40, timestamp: now - 86_400_000 },
					{
						reason: 'Walked a Curiosity Trail all the way to the reveal and left a trailmark',
						difference: 1500,
						timestamp: now - 172_800_000
					},
					{ reason: 'Friend accepted', difference: 10, timestamp: now - 259_200_000 }
				]
			},
			once: false
		});

		await gotoTab(page, gotoHydrated, `/tabs/profile/${user.id}`);
		await openContentDrawer(page, '#points-history', 'Points');
		// the table must actually have rows, otherwise the table audit proves nothing
		await expect
			.poll(async () => page.locator(`${MODAL} table tbody tr`).count(), { timeout: 12_000 })
			.toBeGreaterThanOrEqual(6);

		const report = await audit(page, 'profile View Points sheet (UTable)', {
			rootSelector: MODAL
		});
		expect(report.tables, 'the points sheet rendered no table').toBeGreaterThan(0);
		expect(report.tableRows, 'the points table rendered no rows').toBeGreaterThan(0);
	});

	test('notifications list', async ({ page, gotoHydrated, asUser, mockApi }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'cohernotif' });
		const createdAt = Math.floor(Date.now() / 1000) - 3600;
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/notifications\/?$/,
			status: 200,
			body: {
				items: [
					makeNotification({
						id: 'notif-short',
						title: 'Welcome Aboard',
						message: 'Thanks for joining The Earth App.',
						read: false,
						created_at: createdAt
					}),
					makeNotification({
						id: 'notif-long',
						title: 'A Notification Title That Runs Well Past One Line On A Phone Screen',
						message:
							'A friend challenged you to a quest, and the challenge expires in three days unless you accept it or hand it off to somebody else in your shared garden.',
						source: 'quest',
						read: false,
						created_at: createdAt
					}),
					makeNotification({
						id: 'notif-read',
						title: 'Quest Complete',
						message: 'You finished Trail Blazer.',
						source: 'quest',
						read: true,
						created_at: createdAt
					})
				],
				total: 3,
				unread_count: 2,
				has_warnings: false,
				has_errors: false
			},
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/profile/notifications');
		await expect(page.locator('#notifications-list')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Welcome Aboard')).toBeVisible({ timeout: 12_000 });

		await audit(page, 'notifications list (/tabs/profile/notifications)');
	});

	test('event: Attendees drawer', async ({ page, gotoHydrated, asUser, mockApi }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'coherattend' });
		// the Attendees button only renders for an attendee or the host
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/events\/evt-1\/?$/,
			status: 200,
			body: makeEvent({
				id: 'evt-1',
				name: 'Event 1',
				host: makeUser({ id: 'host-1', username: 'host' }),
				hostId: 'host-1',
				is_attending: true,
				attendee_count: 2
			}),
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/events/evt-1');
		await expect(page.getByRole('heading', { name: 'Event 1' }).first()).toBeVisible({
			timeout: 15_000
		});
		// the outgoing dashboard is still onstage mid-transition and swallows the tap
		await settleAnimations(page, 'event detail before the drawer');
		const trigger = page
			.locator('ion-content:visible')
			.first()
			.getByRole('button', { name: /attendees/i })
			.first();
		await expect(trigger).toBeVisible({ timeout: 15_000 });
		await trigger.click();
		await expect(page.locator(MODAL)).toBeVisible({ timeout: 12_000 });
		await expect(
			page.locator(MODAL).getByRole('heading', { name: /event attendees/i })
		).toBeVisible({ timeout: 12_000 });

		await audit(page, 'event Attendees drawer (MContentDrawer)', { rootSelector: MODAL });
	});

	test('report: kebab action sheet, modal, and reason option sheet', async ({
		page,
		gotoHydrated,
		asUser
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'coherreport' });

		await gotoHydrated('/__test__/widget-harness?report=1');
		await expect(page.getByTestId('harness-ready')).toHaveText('ready', { timeout: 15_000 });

		await openReportMenu(page);
		await audit(page, 'report kebab action sheet', { rootSelector: SHEET });

		await page
			.locator(SHEET)
			.locator('button', { hasText: /^Report$/ })
			.click();
		await expect(page.locator(`${MODAL} ion-title`)).toHaveText(/report prompt/i, {
			timeout: 12_000
		});
		await audit(page, 'report modal', { rootSelector: MODAL });

		// the reason select opens its own action sheet holding all nine reasons
		await page.locator(`${MODAL} ion-select`).click();
		await expect(page.locator('ion-action-sheet.select-action-sheet')).toBeVisible({
			timeout: 12_000
		});
		await audit(page, 'report reason option sheet', {
			rootSelector: 'ion-action-sheet.select-action-sheet'
		});
	});

	test('activity selector modal', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'coheractsel', account: { account_type: 'ORGANIZER' } });

		await gotoTab(page, gotoHydrated, '/tabs/events/new');
		await page.getByRole('button', { name: /select activities/i }).click();
		await expect(page.locator(`${MODAL} ion-searchbar`)).toBeVisible({ timeout: 15_000 });
		// the selector opens on the activity-type chips; only a search fetches real rows, and
		// measuring the chips alone would miss the result list this modal exists to show
		await page.locator(`${MODAL} ion-searchbar input`).fill('Sample');
		await expect(
			page
				.locator(MODAL)
				.getByText(/sample activity/i)
				.first()
		).toBeVisible({ timeout: 12_000 });

		await audit(page, 'activity selector modal (/tabs/events/new)', { rootSelector: MODAL });
	});

	test('challenge-friend picker, and the error toast it raises over itself', async ({
		page,
		gotoHydrated,
		asUser,
		mockApi
	}) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		const me = await asUser({ id: 'coher-me', username: 'coherchallenger' });
		me.friends = ['friend-a', 'friend-b'];
		await mockApi.registerUser(me);

		const friendA = makeUser({ id: 'friend-a', username: 'longwindedfriendname' });
		const friendB = makeUser({ id: 'friend-b', username: 'shortie' });
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/friends/,
			status: 200,
			body: paginate([friendA, friendB]),
			once: false
		});
		await mockApi.set({
			backend: 'mantle',
			method: 'GET',
			path: /^\/v2\/users\/current\/circle/,
			status: 200,
			body: paginate([]),
			once: false
		});

		await gotoTab(page, gotoHydrated, '/tabs/quests');
		await page.locator('#challenge-friend-trigger').click();
		const list = page.locator('#challenge-friend-list');
		await expect(list).toBeVisible({ timeout: 15_000 });
		await expect(list.locator('ion-item[data-username]').first()).toBeVisible({ timeout: 12_000 });

		await audit(page, 'challenge-friend picker modal', { rootSelector: MODAL });

		// a failed challenge raises an error MToast on top of the still-open picker: the one
		// place the toast host has to step over an ionic overlay's own z-index
		await mockApi.set({
			backend: 'mantle',
			method: 'POST',
			path: /^\/v2\/users\/current\/quest\/challenge/,
			status: 500,
			body: { message: 'The challenge service is unavailable right now.' },
			once: false
		});
		await auditToast(page, 'in-app error toast over an open modal (MToast)', async () => {
			await list.locator('ion-item[data-username="shortie"]').click();
		});
	});

	test('in-app info toast (MToast)', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'cohertoast' });

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('ion-toggle').first()).toBeVisible({ timeout: 15_000 });
		await settleAnimations(page, 'settings before the toast');

		// native-mock's Dialog.confirm accepts by default, so Clear Logs always toasts. scope to
		// the row: "Clear Cache" carries the same button label and toasts through the OS instead
		const clear = page
			.locator('ion-item')
			.filter({ hasText: 'Clear Logs' })
			.getByRole('button', { name: 'Clear' });
		await auditToast(page, 'in-app info toast (MToast)', async () => {
			await clear.click();
		});
	});

	test('quest step modal', async ({ page, gotoHydrated, asUser, mockApi }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'cohersteps' });
		await seedStepTypeQuestActive(mockApi);

		await gotoHydrated(`/tabs/quests/${STEP_TYPE_QUEST_ID}?step=0`);
		await expect(page.locator(MODAL)).toBeVisible({ timeout: 15_000 });
		await expect(page.locator(MODAL).getByPlaceholder(/type your answer/i)).toBeVisible({
			timeout: 12_000
		});

		await audit(page, 'quest step modal (describe_text)', { rootSelector: MODAL });
	});

	test('create menu: the tab-bar fab list', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'coherfab' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		// ionic moves aria-label off the host onto its shadow button, so the attribute
		// selector never matches; the role query resolves the inner button instead
		const fab = page.getByRole('button', { name: 'Create Content' });
		await expect(fab).toBeVisible({ timeout: 15_000 });
		await fab.click();
		// the list items carry router-link, so ionic renders their native element as an anchor
		await expect(page.getByRole('link', { name: 'New Prompt' })).toBeVisible({
			timeout: 12_000
		});

		await audit(page, 'create fab list (ion-tab-bar#navbar)', {
			rootSelector: 'ion-tab-bar#navbar'
		});
	});

	test('create menu: prompt create page', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'coherpromptnew' });

		await gotoTab(page, gotoHydrated, '/tabs/prompts/new');
		await expect(page.locator('ion-textarea').first().locator('textarea')).toBeVisible({
			timeout: 15_000
		});

		await audit(page, 'prompt create page (/tabs/prompts/new)');
	});

	test('create menu: article create page', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		// WRITER + PUBLIC clears the account/visibility gate in articles/new.vue
		await asUser({
			username: 'coherarticlenew',
			account: { account_type: 'WRITER', visibility: 'PUBLIC' }
		});

		await gotoTab(page, gotoHydrated, '/tabs/articles/new');
		await expect(page.getByText(/create new article/i)).toBeVisible({ timeout: 15_000 });

		await audit(page, 'article create page (/tabs/articles/new)');
	});

	test('create menu: event create page', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'coherreventnew', account: { account_type: 'ORGANIZER' } });

		await gotoTab(page, gotoHydrated, '/tabs/events/new');
		await expect(page.getByPlaceholder(/enter event name/i)).toBeVisible({ timeout: 15_000 });

		await audit(page, 'event create page (/tabs/events/new)');
	});

	for (const key of ['theme', 'scale', 'font', 'units'] as const) {
		test(`settings select popover: ${key}`, async ({ page, gotoHydrated, asUser }) => {
			skipIfIntegration('measures the mocked surfaces at phone width');
			await asUser({ username: `cohersel${key}` });

			await gotoTab(page, gotoHydrated, '/tabs/settings');
			const select = page.locator(`#setting-${key}`);
			await expect(select).toBeVisible({ timeout: 15_000 });
			await select.click();
			await expect(page.locator(POPOVER)).toBeVisible({ timeout: 12_000 });
			await expect(page.locator(`${POPOVER} ion-radio`).first()).toBeVisible({ timeout: 12_000 });

			await audit(page, `settings "${key}" select popover`, { rootSelector: POPOVER });
		});
	}

	test('onboarding persona picker', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({
			username: 'coherpersona',
			activities: [],
			mutual_count: 0,
			account: { username: 'coherpersona', email_verified: false }
		});

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		const checklist = page.locator('#welcome-checklist');
		await expect(checklist).toBeVisible({ timeout: 15_000 });
		await checklist.getByRole('button', { name: 'Pick Interests' }).click();
		await expect(
			page.locator(MODAL).getByRole('heading', { name: 'Tailor Your Experience' })
		).toBeVisible({ timeout: 12_000 });

		await audit(page, 'onboarding persona picker modal', { rootSelector: MODAL });
	});

	// the audit could silently degrade to a vacuous pass if the collector stopped finding
	// anything; plant one defect per detector and prove each one still fires
	test('the audit catches planted violations', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'cohersanity' });

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('ion-toggle').first()).toBeVisible({ timeout: 15_000 });
		await settleAnimations(page, 'self-check');

		await page
			.locator('ion-content:visible')
			.first()
			.evaluate((host) => {
				const stage = document.createElement('div');
				// pinned into the viewport; appended at the end of a long page it would sit below
				// the fold and the audit would (correctly) never look at it
				stage.setAttribute(
					'style',
					'position:fixed;top:80px;left:8px;width:260px;z-index:1;background:#fff'
				);
				stage.innerHTML = [
					// (a) text clipped by an overflow:hidden parent that cannot scroll
					'<div id="planted-clipper" style="width:80px;height:40px;overflow:hidden">',
					'<span id="planted-clipped" style="display:block;width:300px;height:20px;font-size:14px;white-space:nowrap">a sentence far wider than its parent</span>',
					'</div>',
					// (b) two 60%-overlapping buttons
					'<div style="position:relative;height:60px">',
					'<button id="planted-over-a" style="position:absolute;left:0;top:0;width:50px;height:50px">A</button>',
					'<button id="planted-over-b" style="position:absolute;left:20px;top:0;width:50px;height:50px">B</button>',
					'</div>',
					// (c) a table row missing a cell
					'<table id="planted-table" style="width:240px">',
					'<thead><tr><th>Date</th><th>Change</th><th>Reason</th></tr></thead>',
					'<tbody><tr><td>now</td><td>+5</td><td>full row</td></tr>',
					'<tr><td>then</td><td>ragged row</td></tr></tbody>',
					'</table>',
					// (d) sideways scroll in a box that is not a rail
					'<div id="planted-hscroll" style="width:120px;overflow-x:hidden">',
					'<span style="display:block;width:600px;height:12px;background:#eee"></span>',
					'</div>',
					// (e) two text blocks with no gap and no leading to spare, so the words touch
					'<div id="planted-stack" style="display:block">',
					'<div id="planted-first" style="margin:0;font-size:14px;line-height:14px">first block</div>',
					'<div id="planted-second" style="margin:0;font-size:14px;line-height:14px">second block</div>',
					'</div>',
					'<div id="planted-short" style="height:6px;font-size:14px;line-height:20px">squeezed line</div>'
				].join('');
				host.appendChild(stage);
			});

		const r = await collectCoherence(page);

		expect(r.clipped.join('\n'), 'the clip audit missed text cut off by its parent').toContain(
			'#planted-clipped'
		);
		expect(r.overlaps.join('\n'), 'the overlap audit missed two 60%-overlapping buttons').toContain(
			'#planted-over-a'
		);
		expect(r.tableIssues.join('\n'), 'the table audit missed a row with a missing cell').toContain(
			'header declares 3'
		);
		expect(
			r.hscroll.join('\n'),
			'the horizontal-scroll audit missed a 600px track in a 120px hidden box'
		).toContain('#planted-hscroll');
		expect(r.tightGaps.join('\n'), 'the spacing audit missed two touching text blocks').toContain(
			'#planted-second'
		);
		expect(
			r.shortLines.join('\n'),
			'the line-height audit missed a 6px box holding a 20px line'
		).toContain('#planted-short');
	});
});

// the text-size prompt only opens for a user who has NOT completed the welcome tour, so this
// group deliberately skips the tour-suppression the rest of the spec relies on
test.describe('UI coherence on the first-launch sheets (mobile)', () => {
	test.beforeEach(async ({ context }) => {
		test.slow();
		await installNativeMock(context, { platform: 'ios' });
		await context.addInitScript(() => {
			try {
				window.localStorage.removeItem('earth_app_completed_tours');
			} catch {
				// localStorage unavailable; the tour just auto-plays and the chain still runs
			}
			const w = window as unknown as { __prefs?: Record<string, string> };
			w.__prefs = { ...(w.__prefs ?? {}), hasOpened: 'true' };
			delete w.__prefs!['sky:has-seen-text-size-prompt'];
			w.__prefs!['sky:oauth-username-prompt-pending'] = 'true';
		});
	});

	test('onboarding text-size prompt', async ({ page, gotoHydrated, asUser }) => {
		skipIfIntegration('measures the mocked surfaces at phone width');
		await asUser({ username: 'cohertextsize' });

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		// the username step opens first and hands off to the text-size sheet on close
		await expect(page.getByRole('heading', { name: 'Pick a Username' })).toBeVisible({
			timeout: 25_000
		});
		await page.getByRole('button', { name: 'Keep This Username' }).click();
		await expect(page.getByRole('heading', { name: 'How does this Look?' })).toBeVisible({
			timeout: 20_000
		});

		await audit(page, 'onboarding text-size prompt sheet', { rootSelector: MODAL });
	});
});
