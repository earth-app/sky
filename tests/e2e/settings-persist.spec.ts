import type { BrowserContext, Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { installNativeMock } from './utils/native-mock';

function visibleToggle(page: Page, labelRe: RegExp) {
	return page.locator('ion-content:visible ion-toggle', { hasText: labelRe }).first();
}

async function setToggle(page: Page, labelRe: RegExp, desired: boolean): Promise<void> {
	const toggle = visibleToggle(page, labelRe);
	await expect(toggle).toBeVisible({ timeout: 12_000 });
	const current = (await toggle.getAttribute('aria-checked')) === 'true';
	if (current !== desired) await toggle.click();
	await expect
		.poll(() => toggle.getAttribute('aria-checked'), { timeout: 8000 })
		.toBe(String(desired));
}

async function setSelect(page: Page, id: string, value: string): Promise<void> {
	const sel = page.locator(`#${id}`).first();
	await expect(sel).toBeVisible({ timeout: 12_000 });
	await sel.evaluate(
		(el, v) => el.dispatchEvent(new CustomEvent('ionChange', { detail: { value: v } })),
		value
	);
	await expect.poll(() => sel.evaluate((el: any) => el.value ?? ''), { timeout: 8000 }).toBe(value);
}

async function selectValue(page: Page, id: string): Promise<string> {
	return page
		.locator(`#${id}`)
		.first()
		.evaluate((el: any) => (el.value ?? '') as string);
}

// the app theme token lives on <html> via applyAppSettingsToDocument; read exact class tokens
// (not the className string) so a color-mode "-mode" suffix can never alias the light check
async function readTheme(page: Page): Promise<{ light: boolean; dark: boolean }> {
	return page.evaluate(() => {
		const c = document.documentElement.classList;
		return { light: c.contains('light'), dark: c.contains('dark') };
	});
}

// the raw JSON-encoded value the app persisted under a Preferences key (useSettings JSON.stringifies)
async function readPref(page: Page, key: string): Promise<string | null> {
	return page.evaluate((k) => (window as any).__prefs?.[k] ?? null, key);
}

// wait until the session is mirrored into durable Preferences, then snapshot the whole store (token
// + user snapshot + every app.setting.<key>) so the relaunch can restore auth AND settings
async function readDurablePrefs(page: Page): Promise<Record<string, string>> {
	await expect
		.poll(() => page.evaluate(() => (window as any).__prefs?.['session_token'] ?? null), {
			timeout: 12_000
		})
		.toBeTruthy();
	return page.evaluate(() => ({ ...((window as any).__prefs ?? {}) }));
}

// re-apply the durable native store on every future document load - native-mock wipes __prefs each
// navigation, so this (registered after it) restores what the OS keeps across a relaunch
async function seedDurablePrefs(
	context: BrowserContext,
	prefs: Record<string, string>
): Promise<void> {
	await context.addInitScript((p) => {
		const w = window as any;
		w.__prefs ||= {};
		for (const k of Object.keys(p)) w.__prefs[k] = (p as Record<string, string>)[k]!;
	}, prefs);
}

// collect genuine JS crashes; ignore benign backend/resource misses
function trackPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => {
		const msg = err?.message ?? String(err);
		if (/FetchError|\[(GET|POST|PUT|PATCH|DELETE)\]\s+"/.test(msg)) return;
		if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return;
		errors.push(msg);
	});
	return errors;
}

// discover's summary renders "Activities - N Results"; N only grows when a NEW page loads (not on
// lazy card hydration), so it is the reliable "another page fetched" signal
async function activitiesResultCount(page: Page): Promise<number> {
	const el = page.getByText(/activities\s*-\s*\d+\s*results/i).first();
	const raw = (await el.textContent().catch(() => '')) ?? '';
	const match = raw.replace(/\s+/g, ' ').match(/-\s*(\d+)\s*results/i);
	return match ? Number(match[1]) : -1;
}

// scope the scroll to discover's OWN ion-content; a bare querySelector grabs the first (hidden)
// kept-alive page's scroller and the list never scrolls (keep-alive trap)
async function scrollDiscoverToBottom(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const results = document.querySelector('#discover-results');
		const content = (results?.closest('ion-content') ??
			document.querySelector('ion-content')) as any;
		const scrollEl = await content?.getScrollElement?.();
		if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight });
	});
}

test.describe('Settings persistence across a cold relaunch (native ios)', () => {
	test.beforeEach(async ({ context }) => {
		// the durable Preferences store + CapacitorHttp shim only exist on a native platform
		await installNativeMock(context, { platform: 'ios' });
	});

	test('changes theme/units/data-saver/auto-load/haptics, applies each immediately, and persists them all across a cold relaunch', async ({
		context,
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock settings persistence');
		const errors = trackPageErrors(page);
		await asUser();

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('#settings')).toBeVisible({ timeout: 12_000 });

		// change several settings through the real controls
		await setSelect(page, 'setting-theme', 'dark');
		await setSelect(page, 'setting-units', 'metric');
		await setToggle(page, /Data Saver/i, true);
		await setToggle(page, /Auto-Load/i, false);
		await setToggle(page, /Haptic Feedback/i, false);

		// applied immediately: the dark theme token is on <html>, light is not
		const applied = await readTheme(page);
		expect(applied.dark).toBe(true);
		expect(applied.light).toBe(false);

		// persisted immediately to durable Preferences under app.setting.<key> (JSON-encoded)
		expect(await readPref(page, 'app.setting.theme')).toBe('"dark"');
		expect(await readPref(page, 'app.setting.units')).toBe('"metric"');
		expect(await readPref(page, 'app.setting.dataSaverMode')).toBe('true');
		expect(await readPref(page, 'app.setting.discoverAutoLoad')).toBe('false');
		expect(await readPref(page, 'app.setting.hapticFeedback')).toBe('false');

		// COLD RELAUNCH: re-seed the durable store the OS keeps across a kill; the fresh document
		// wipes __prefs + the settings cache, so persistence must come purely from Preferences
		const durable = await readDurablePrefs(page);
		await seedDurablePrefs(context, durable);
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('#settings')).toBeVisible({ timeout: 12_000 });

		// every control reflects the saved value on the fresh boot
		await expect.poll(() => selectValue(page, 'setting-theme'), { timeout: 12_000 }).toBe('dark');
		await expect.poll(() => selectValue(page, 'setting-units'), { timeout: 12_000 }).toBe('metric');
		await expect
			.poll(() => visibleToggle(page, /Data Saver/i).getAttribute('aria-checked'), {
				timeout: 12_000
			})
			.toBe('true');
		await expect
			.poll(() => visibleToggle(page, /Auto-Load/i).getAttribute('aria-checked'), {
				timeout: 12_000
			})
			.toBe('false');
		await expect
			.poll(() => visibleToggle(page, /Haptic Feedback/i).getAttribute('aria-checked'), {
				timeout: 12_000
			})
			.toBe('false');

		// document is still themed dark after the relaunch (no reset to system/light)
		const afterTheme = await readTheme(page);
		expect(afterTheme.dark).toBe(true);
		expect(afterTheme.light).toBe(false);

		// and the durable values survived intact
		expect(await readPref(page, 'app.setting.theme')).toBe('"dark"');
		expect(await readPref(page, 'app.setting.units')).toBe('"metric"');
		expect(await readPref(page, 'app.setting.dataSaverMode')).toBe('true');
		expect(await readPref(page, 'app.setting.discoverAutoLoad')).toBe('false');

		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('a persisted Data Saver setting gates discover auto-load (explicit Load More only) after a relaunch', async ({
		context,
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock + seeded catalog pagination');
		await asUser();

		// turn Data Saver ON through the UI; leave Auto-Load at its default (ON) so the ONLY thing
		// that can suppress paging on discover is the data-saver gate, not the auto-load setting
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await setToggle(page, /Data Saver/i, true);
		expect(await readPref(page, 'app.setting.dataSaverMode')).toBe('true');
		expect(await readPref(page, 'app.setting.discoverAutoLoad')).not.toBe('false');

		// relaunch straight into discover; the gate must come from the persisted setting on a fresh
		// boot (app.vue's dataSaver watcher reads it back and disables the IonInfiniteScroll)
		const durable = await readDurablePrefs(page);
		await seedDurablePrefs(context, durable);
		await gotoTab(page, gotoHydrated, '/tabs/discover?tab=activity');
		expect(await readPref(page, 'app.setting.dataSaverMode')).toBe('true');

		await expect(page.locator('#discover-segments')).toBeVisible({ timeout: 12_000 });
		const input = page.locator('#discover-search input').first();
		await input.click();
		await input.fill('Sample');
		await input.press('Enter');

		await expect(page.getByText(/activities\s*-\s*\d+\s*results/i)).toBeVisible({
			timeout: 15_000
		});
		await expect.poll(() => activitiesResultCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
		await page.waitForTimeout(1500);

		const before = await activitiesResultCount(page);
		expect(before).toBeGreaterThan(0);

		// scrolling to the bottom must NOT load another page (data saver disables auto-load)
		for (let i = 0; i < 3; i += 1) {
			await scrollDiscoverToBottom(page);
			await page.waitForTimeout(900);
		}
		expect(await activitiesResultCount(page)).toBe(before);

		// the explicit Load More button still fetches the next page
		await page
			.locator('#discover-results ion-button')
			.last()
			.click()
			.catch(() => {});
		await expect
			.poll(() => activitiesResultCount(page), { timeout: 15_000 })
			.toBeGreaterThan(before);
	});

	test('a single setting toggle round-trips through Preferences with the exact persisted value', async ({
		context,
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock single-setting round-trip');
		await asUser();

		// sound effects defaults OFF and is isolated from the other flows; flip it and read back the
		// exact JSON-encoded boolean the set() wrote under the namespaced key
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await setToggle(page, /Sound Effects/i, true);
		expect(await readPref(page, 'app.setting.soundEffects')).toBe('true');

		const durable = await readDurablePrefs(page);
		await seedDurablePrefs(context, durable);
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('#settings')).toBeVisible({ timeout: 12_000 });

		// the fresh boot reads the identical value back and the toggle reflects it
		await expect
			.poll(() => visibleToggle(page, /Sound Effects/i).getAttribute('aria-checked'), {
				timeout: 12_000
			})
			.toBe('true');
		expect(await readPref(page, 'app.setting.soundEffects')).toBe('true');
	});

	test('the persisted dark theme applies on relaunch with no light-theme flash', async ({
		context,
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration('native mock theme pre-paint');
		await asUser();

		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await setSelect(page, 'setting-theme', 'dark');
		expect((await readTheme(page)).dark).toBe(true);

		const durable = await readDurablePrefs(page);
		await seedDurablePrefs(context, durable);

		// arm the pre-paint theme (nuxt color-mode reads this key at document-start) and a sampler
		// that records the html theme token on every class mutation from the earliest point
		await context.addInitScript(() => {
			try {
				localStorage.setItem('nuxt-color-mode', 'dark');
			} catch {
				// localStorage unavailable; the seeded Preferences path still themes on boot
			}
		});
		await context.addInitScript(() => {
			const w = window as any;
			w.__themeSamples = [];
			const sample = () => {
				const c = document.documentElement.classList;
				w.__themeSamples.push({ light: c.contains('light'), dark: c.contains('dark') });
			};
			try {
				new MutationObserver(sample).observe(document.documentElement, {
					attributes: true,
					attributeFilter: ['class']
				});
			} catch {
				// no MutationObserver; skip flash tracking
			}
			sample();
		});

		// relaunch anywhere authed; the theme is app-wide, so the dashboard proves it too
		await gotoTab(page, gotoHydrated, '/tabs/dashboard');

		await expect.poll(() => readTheme(page).then((t) => t.dark), { timeout: 12_000 }).toBe(true);
		const samples = (await page.evaluate(() => (window as any).__themeSamples ?? [])) as {
			light: boolean;
			dark: boolean;
		}[];
		// the html never carried the light token at any observed moment during boot (no flash)
		expect(
			samples.some((s) => s.light === true),
			`theme flashed light during boot: ${JSON.stringify(samples)}`
		).toBe(false);
	});
});
