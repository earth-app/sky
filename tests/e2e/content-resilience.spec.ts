/**
 * Content-resilience + cross-content navigation suite (mobile shell).
 *
 * Exercises the shared request layer (vendored crust makeRequest -> normalizeResponseBody +
 * one-shot retry) and the single-item store guards (classifyItemFetch) against the native
 * CapacitorHttp failure modes that used to blank the app or clobber a good cache:
 *
 *   (a) body arriving as an unparsed JSON STRING (text/plain transport body)
 *   (b) body wrapped in the { data, status, url } transport ENVELOPE
 *   (c) a PARTIAL object missing required fields (rejected at the store boundary -> no crash)
 *   (d) a transient 500 that RECOVERS on retry
 *
 * Runs on chromium AND webkit (webkit ~ iOS WKWebView) so transport-shape quirks surface.
 */

import type { Page } from '@playwright/test';
import { expect, skipIfIntegration, test } from './utils/fixtures';
import { gotoTab } from './utils/journey-helpers';
import { makeActivity, makeArticle, makeEvent, makePrompt } from './utils/mock-data';

// collect only genuine JS crashes; ignore benign backend/resource misses surfaced as
// unhandled rejections (e.g. the mock has no cosmetic avatar image -> a 404 pageerror)
function trackPageErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => {
		const msg = err?.message ?? String(err);
		// network fetch rejection (chromium: `[GET] "url": 404`; webkit: `FetchError: [GET] ...`)
		if (/FetchError|\[(GET|POST|PUT|PATCH|DELETE)\]\s+"/.test(msg)) return;
		if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return;
		errors.push(msg);
	});
	return errors;
}

test.describe('Cross-content navigation does not blank between tabs/types', () => {
	test('walks dashboard -> discover -> article -> prompt -> event -> activity', async ({
		page,
		asUser,
		gotoHydrated
	}) => {
		skipIfIntegration();
		const errors = trackPageErrors(page);
		await asUser();

		await gotoTab(page, gotoHydrated, '/tabs/dashboard');
		await expect(page.locator('#title')).toBeVisible({ timeout: 12_000 });

		await gotoTab(page, gotoHydrated, '/tabs/discover');
		await expect(page.locator('#discover-results')).toBeVisible({ timeout: 12_000 });

		await gotoHydrated('/tabs/articles/art-1');
		await expect(page.getByRole('heading', { name: 'Article 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});

		await gotoHydrated('/tabs/prompts/pmt-1');
		await expect(page.getByText(/sample prompt 1\?/i).first()).toBeVisible({ timeout: 12_000 });

		await gotoHydrated('/tabs/events/evt-1');
		await expect(page.getByText('Event 1').first()).toBeVisible({ timeout: 12_000 });

		await gotoHydrated('/tabs/activities/act-1');
		await expect(page.getByRole('heading', { name: 'Sample Activity 1', level: 1 })).toBeVisible({
			timeout: 12_000
		});

		// return to a previously-seen article: a good render must survive the round trip
		await gotoHydrated('/tabs/articles/art-2');
		await expect(page.getByRole('heading', { name: 'Article 2', level: 1 })).toBeVisible({
			timeout: 12_000
		});

		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});
});

test.describe('Article detail self-heals malformed responses', () => {
	test('renders when the body arrives as an unparsed JSON string', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		await asUser();
		// non-seeded id so the detail fetch hits only this override (seeded ids get pre-seeded
		// into the store by the page's Related list, which would win the race)
		await mockApi.respondRawString(
			'GET',
			'/v2/articles/art-str-1',
			makeArticle({ id: 'art-str-1', title: 'Stringified Article' })
		);
		await gotoHydrated('/tabs/articles/art-str-1');
		await expect(page.getByRole('heading', { name: 'Stringified Article', level: 1 })).toBeVisible({
			timeout: 12_000
		});
	});

	test('renders when the body is wrapped in a { data } envelope', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondEnvelope(
			'GET',
			'/v2/articles/art-env-1',
			makeArticle({ id: 'art-env-1', title: 'Enveloped Article' })
		);
		await gotoHydrated('/tabs/articles/art-env-1');
		await expect(page.getByRole('heading', { name: 'Enveloped Article', level: 1 })).toBeVisible({
			timeout: 12_000
		});
	});

	test('does not crash on a partial object missing the author', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		const errors = trackPageErrors(page);
		await asUser();
		// partial payload is rejected by the store's isValidArticle guard (never reaches the card),
		// so the app-shell must stay interactive and error-free. non-seeded id so this override
		// is the only source for the detail fetch
		await mockApi.set({
			method: 'GET',
			path: '^/v2/articles/art-partial-1$',
			status: 200,
			body: { id: 'art-partial-1', title: 'Half Built' },
			once: false
		});
		await gotoHydrated('/tabs/articles/art-partial-1');
		await expect(page).toHaveURL(/art-partial-1/);
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('recovers after a transient 500 (retry hits the healthy backend)', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondTransientThenSuccess('GET', '/v2/articles/art-4');
		await gotoHydrated('/tabs/articles/art-4');
		await expect(page.getByRole('heading', { name: 'Article 4', level: 1 })).toBeVisible({
			timeout: 12_000
		});
	});
});

test.describe('Prompt detail self-heals malformed responses', () => {
	test('renders when the body is wrapped in a { data } envelope', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondEnvelope(
			'GET',
			'/v2/prompts/pmt-env-1',
			makePrompt({ id: 'pmt-env-1', prompt: 'Enveloped prompt body?' })
		);
		await gotoHydrated('/tabs/prompts/pmt-env-1');
		await expect(page.getByText('Enveloped prompt body?').first()).toBeVisible({ timeout: 12_000 });
	});

	test('recovers after a transient 500', async ({ page, asUser, mockApi, gotoHydrated }) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondTransientThenSuccess('GET', '/v2/prompts/pmt-3');
		await gotoHydrated('/tabs/prompts/pmt-3');
		await expect(page.getByText(/sample prompt 3\?/i).first()).toBeVisible({ timeout: 12_000 });
	});
});

test.describe('Event detail self-heals malformed responses', () => {
	test('renders when the body arrives as an unparsed JSON string', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondRawString(
			'GET',
			'/v2/events/evt-2',
			makeEvent({ id: 'evt-2', name: 'Stringified Event' })
		);
		await gotoHydrated('/tabs/events/evt-2');
		await expect(page.getByText('Stringified Event').first()).toBeVisible({ timeout: 12_000 });
	});

	test('recovers after a transient 500', async ({ page, asUser, mockApi, gotoHydrated }) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondTransientThenSuccess('GET', '/v2/events/evt-3');
		await gotoHydrated('/tabs/events/evt-3');
		await expect(page.getByText('Event 3').first()).toBeVisible({ timeout: 12_000 });
	});
});

test.describe('Activity detail self-heals malformed responses', () => {
	test('renders when the body is wrapped in a { data } envelope', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondEnvelope(
			'GET',
			'/v2/activities/act-env-1',
			makeActivity({ id: 'act-env-1', name: 'Enveloped Activity' })
		);
		await gotoHydrated('/tabs/activities/act-env-1');
		await expect(page.getByRole('heading', { name: 'Enveloped Activity', level: 1 })).toBeVisible({
			timeout: 12_000
		});
	});

	test('recovers after a transient 500', async ({ page, asUser, mockApi, gotoHydrated }) => {
		skipIfIntegration();
		await asUser();
		await mockApi.respondTransientThenSuccess('GET', '/v2/activities/act-3');
		await gotoHydrated('/tabs/activities/act-3');
		await expect(page.getByRole('heading', { name: 'Sample Activity 3', level: 1 })).toBeVisible({
			timeout: 12_000
		});
	});
});

test.describe('Profile editor + settings load under degraded responses', () => {
	test('profile editor renders even when a secondary fetch is transiently degraded', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		const errors = trackPageErrors(page);
		await asUser();
		// a flaky secondary fetch (badges) 500s once; the editor must still render
		await mockApi.respondTransientThenSuccess('GET', /^\/v2\/users\/[^/]+\/badges$/);
		await gotoHydrated('/tabs/profile/editor');
		await expect(page.getByText(/Edit Profile/i).first()).toBeVisible({ timeout: 15_000 });
		expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
	});

	test('settings page loads and the units control is interactive under a degraded fetch', async ({
		page,
		asUser,
		mockApi,
		gotoHydrated
	}) => {
		skipIfIntegration();
		await asUser();
		// arm a one-shot 500 on a profile fetch; settings reads local prefs so it must render regardless
		await mockApi.respondTransientThenSuccess('GET', /^\/v2\/users\/[^/]+\/points$/);
		await gotoTab(page, gotoHydrated, '/tabs/settings');
		await expect(page.locator('#settings')).toBeVisible({ timeout: 12_000 });
		await expect(page.locator('#setting-units').first()).toBeVisible({ timeout: 12_000 });
	});
});
