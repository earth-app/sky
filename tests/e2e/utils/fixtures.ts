import { test as baseTest, expect } from '@nuxt/test-utils/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveCoverageForTest } from './coverage';
import { MockClient } from './mock-client';
import { makeAdmin, makeUser } from './mock-data';

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo root is three up from tests/e2e/utils (must match global-setup.ts)
const INTEGRATION_SESSION_FILE = resolve(__dirname, '../../../.integration-session.json');

export const integrationMode = process.env.MOCK_DISABLED === '1';

let cachedSession: { session_token: string; user: Record<string, any> } | null = null;
function loadIntegrationSession() {
	if (cachedSession) return cachedSession;
	try {
		const raw = readFileSync(INTEGRATION_SESSION_FILE, 'utf-8');
		cachedSession = JSON.parse(raw);
		return cachedSession!;
	} catch (err) {
		throw new Error(
			`[integration] cached session file not found at ${INTEGRATION_SESSION_FILE} - global-setup must run with MOCK_DISABLED=1 first. ${(err as Error).message}`
		);
	}
}

async function loginAsRealAdmin(
	context: BrowserContext,
	_overrides: Record<string, any> = {}
): Promise<Record<string, any>> {
	const session = loadIntegrationSession();
	await context.addCookies([
		{
			name: 'session_token',
			value: session.session_token,
			domain: '127.0.0.1',
			path: '/',
			sameSite: 'Lax',
			secure: false
		}
	]);
	await seedSessionStorage(context, session.session_token);
	return session.user;
}

export interface TestFixtures {
	testId: string;
	mockApi: MockClient;
	asAnonymous: () => Promise<void>;
	asUser: (overrides?: Record<string, any>) => Promise<Record<string, any>>;
	asAdmin: (overrides?: Record<string, any>) => Promise<Record<string, any>>;
	gotoHydrated: (path: string) => Promise<void>;
}

async function seedSessionStorage(context: BrowserContext, token: string): Promise<void> {
	await context.addInitScript((t) => {
		try {
			window.localStorage.setItem('session_token', t);
		} catch {
			// localStorage unavailable in this context; the guard's Preferences path is mocked separately
		}
	}, token);
}

export const test = baseTest.extend<TestFixtures>({
	// One UUID per test → used to scope mock overrides + the X-Test-Id header
	testId: async ({}, use) => {
		await use(randomUUID());
	},

	// Browser context is rebuilt with a header injector + JS coverage hooks
	context: async ({ context, testId, browserName }, use) => {
		await context.setExtraHTTPHeaders({ 'x-test-id': testId });
		await context.addInitScript(() => {
			try {
				window.localStorage.setItem('CapacitorStorage.sky:has-seen-text-size-prompt', 'true');
				window.localStorage.setItem('sky:has-seen-text-size-prompt', 'true');
				window.localStorage.setItem(
					'earth_app_completed_tours',
					JSON.stringify(['welcome', 'notifications', 'verify-email'])
				);
			} catch {
				// localStorage unavailable; native-mock specs seed the flag another way
			}
		});

		// Stamp X-Test-Id on every request so the mock server can scope overrides
		// to this test. Also surface it via a cookie for belt-and-suspenders.
		await context.addCookies([
			{
				name: 'x-test-id',
				value: testId,
				domain: '127.0.0.1',
				path: '/',
				sameSite: 'Lax'
			}
		]);

		await context.route(
			/^https?:\/\/(challenges\.cloudflare\.com|fonts\.(?:googleapis|gstatic)\.com|api\.iconify\.design|cdn\.earth-app\.com|i\.ytimg\.com|www\.youtube\.com|pixabay\.com|upload\.wikimedia\.org|en\.wikipedia\.org)\//,
			(route) => route.fulfill({ status: 204, body: '' })
		);

		// Coverage hooks - chromium only
		if (browserName === 'chromium' && process.env.COVERAGE) {
			await context.addInitScript(() => {
				// noop: presence of script ensures consistent context
			});
		}

		await use(context);
	},

	// Decorate page with auto-coverage start/stop
	page: async ({ page, browserName }, use, testInfo) => {
		const coverageEnabled = browserName === 'chromium' && process.env.COVERAGE === '1';
		if (coverageEnabled) {
			await page.coverage.startJSCoverage({ resetOnNavigation: false });
		}
		await use(page);
		if (coverageEnabled) {
			try {
				const entries = await page.coverage.stopJSCoverage();
				await saveCoverageForTest(testInfo.testId, entries);
			} catch {
				// page may have been closed already
			}
		}
	},

	mockApi: async ({ testId }, use) => {
		const client = new MockClient(testId);
		// Sky has no Nitro server, so the only state to reset lives in the mock
		// servers themselves; scoped reset by testId keeps parallel workers clean.
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), 3_000);
		await client.reset({ signal: ac.signal }).catch(() => {});
		clearTimeout(timer);
		await use(client);
		const ac2 = new AbortController();
		const timer2 = setTimeout(() => ac2.abort(), 3_000);
		await client.reset({ signal: ac2.signal }).catch(() => {});
		clearTimeout(timer2);
	},

	asAnonymous: async ({ context, mockApi }, use) => {
		const fn = async () => {
			await mockApi.loginAs(null);
			await context.clearCookies({ name: 'session_token' });
		};
		await use(fn);
	},

	asUser: async ({ context, mockApi, testId }, use) => {
		const fn = async (overrides: Record<string, any> = {}) => {
			if (process.env.MOCK_DISABLED === '1') {
				return await loginAsRealAdmin(context, overrides);
			}
			const sessionToken = `mock-token-${testId}`;
			const user = makeUser({
				id: overrides.id ?? `test-user-${testId.slice(0, 8)}`,
				username: overrides.username ?? `testuser-${testId.slice(0, 6)}`,
				...overrides
			});
			await mockApi.registerUser(user);
			await mockApi.loginAs(user.id, sessionToken);
			await context.addCookies([
				{
					name: 'session_token',
					value: sessionToken,
					domain: '127.0.0.1',
					path: '/',
					sameSite: 'Lax',
					secure: false
				}
			]);
			await seedSessionStorage(context, sessionToken);
			return user;
		};
		await use(fn);
	},

	asAdmin: async ({ context, mockApi, testId }, use) => {
		const fn = async (overrides: Record<string, any> = {}) => {
			if (process.env.MOCK_DISABLED === '1') {
				return await loginAsRealAdmin(context, overrides);
			}
			const sessionToken = `mock-admin-token-${testId}`;
			const admin = makeAdmin({
				id: overrides.id ?? `admin-user-${testId.slice(0, 8)}`,
				username: overrides.username ?? `admin-${testId.slice(0, 6)}`,
				...overrides
			});
			await mockApi.registerUser(admin);
			await mockApi.loginAs(admin.id, sessionToken);
			await context.addCookies([
				{
					name: 'session_token',
					value: sessionToken,
					domain: '127.0.0.1',
					path: '/',
					sameSite: 'Lax',
					secure: false
				}
			]);
			await seedSessionStorage(context, sessionToken);
			return admin;
		};
		await use(fn);
	},

	gotoHydrated: async ({ page }, use) => {
		const waitForHydration = async () => {
			await page
				.waitForFunction(
					() =>
						typeof (window as any).useNuxtApp === 'function' &&
						(window as any).useNuxtApp().isHydrating === false,
					{ timeout: 8_000 }
				)
				.catch(() => {});
		};
		const waitForAuthSettled = async () => {
			await page
				.waitForFunction(
					() => {
						const nuxt = (window as any).useNuxtApp?.();
						if (!nuxt) return true;
						const pinia = nuxt.$pinia;
						if (!pinia) return true;
						const auth = pinia.state.value?.auth;
						if (!auth) return true;
						return auth.currentUser !== undefined && !auth.fetchPromise;
					},
					{ timeout: 8_000 }
				)
				.catch(() => {});
		};

		const fn = async (path: string) => {
			const isTabRoute = path === '/tabs' || path.startsWith('/tabs/');
			if (isTabRoute) {
				// warm the SPA at root so the IonRouterOutlet initializes; the index page
				// auto-redirects an authed user into /tabs/*, which primes the outlet stack
				await page.goto('/', { waitUntil: 'domcontentloaded' });
				await waitForHydration();
				await page
					.waitForURL((url) => url.pathname.startsWith('/tabs'), { timeout: 8_000 })
					.catch(() => {});
				const [targetPath, targetQuery] = [path.split('?')[0]!, path.split('?')[1] ?? ''];

				let landed = false;
				for (let attempt = 0; attempt < 4 && !landed; attempt++) {
					const pushed = await page
						.evaluate((p) => {
							const router = (window as any).useNuxtApp?.().$router;
							if (!router) return false;
							router.push(p);
							return true;
						}, path)
						.catch(() => false);
					if (!pushed) {
						// router unreachable (hydration never completed); direct goto as a fallback
						await page.goto(path, { waitUntil: 'domcontentloaded' });
					}
					landed = await page
						.waitForURL(
							(url) =>
								url.pathname === targetPath &&
								(targetQuery === '' || url.search.replace(/^\?/, '') === targetQuery),
							{ timeout: 4_000 }
						)
						.then(() => true)
						.catch(() => false);
				}
				// the active ion-page's content must be attached + visible before asserting
				await page
					.locator('ion-content:visible')
					.first()
					.waitFor({ state: 'visible', timeout: 8_000 })
					.catch(() => {});

				await page
					.evaluate(() => {
						const inOverlay = (el: Element) => !!el.closest('ion-modal, ion-popover, ion-alert');
						const tabs = document.querySelector('ion-tabs');
						if (tabs) {
							for (const el of Array.from(document.querySelectorAll('div.ion-page'))) {
								if (!tabs.contains(el) && !el.querySelector('ion-tabs') && !inOverlay(el)) {
									(el as HTMLElement).remove();
								}
							}
						}
						const pages = Array.from(document.querySelectorAll('div.ion-page'));
						for (const el of pages) {
							if (inOverlay(el)) continue;
							const he = el as HTMLElement;
							const hidden =
								he.classList.contains('ion-page-hidden') ||
								he.getAttribute('aria-hidden') === 'true' ||
								he.offsetParent === null;
							if (hidden) he.remove();
						}
					})
					.catch(() => {});
			} else {
				await page.goto(path, { waitUntil: 'domcontentloaded' });
			}
			await waitForHydration();
			await waitForAuthSettled();
		};
		await use(fn);
	}
});

export { expect };

export function skipIfIntegration(reason: string = 'requires seeded mock data') {
	test.skip(integrationMode, reason);
}

export async function expectToast(page: Page, partial: string | RegExp) {
	const matcher = typeof partial === 'string' ? new RegExp(partial, 'i') : partial;
	await expect(page.getByText(matcher).first()).toBeVisible({ timeout: 5000 });
}

export async function expectTitleContains(page: Page, partial: string) {
	await expect(page).toHaveTitle(new RegExp(partial, 'i'));
}

export async function findByRoleName(
	page: Page,
	role: Parameters<Page['getByRole']>[0],
	name: string | RegExp
) {
	return page.getByRole(role, { name }).first();
}

export async function timeNavigation(
	page: Page,
	url: string,
	waitFor: () => Promise<unknown>
): Promise<number> {
	const start = performance.now();
	await page.goto(url);
	await waitFor();
	return performance.now() - start;
}
