import type { BrowserContext } from '@playwright/test';
import type { MockClient } from './mock-client';
import { makeUser } from './mock-data';

// helpers for the v0.6.0 multi-user flows (Curiosity Trails / Shared Garden / Trailmarks). sky
// mirrors crust's feature-helpers, adapted to the Capacitor session model: identity resolves via
// the mock X-Test-Id override plus the session_token cookie + localStorage seed the guard reads.

export interface TestActor {
	user: Record<string, any>;
	token: string;
}

// deterministic far-apart lat/lng per test so parallel trailmark specs never share a geo bucket
// (0.1deg grid, spacing >> the 2km max radius). fed to installNativeMock({ geo })
export function uniqueGeo(testId: string): { latitude: number; longitude: number } {
	let h = 0;
	for (const c of testId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	const latitude = Number(((h % 1200) / 10 - 60).toFixed(4));
	const longitude = Number((((h >>> 8) % 3200) / 10 - 160).toFixed(4));
	return { latitude, longitude };
}

// build a per-test-unique actor (id/username/token embed the testId)
export function makeActor(
	testId: string,
	key: string,
	overrides: Record<string, any> = {}
): TestActor {
	const user = makeUser({
		id: `${key}-${testId.slice(0, 8)}`,
		username: `${key}-${testId.slice(0, 6)}`,
		...overrides
	});
	return { user, token: `tok-${key}-${testId}` };
}

// register actors with the mock so /v2/users/current resolves each of them
export async function registerActors(mockApi: MockClient, ...actors: TestActor[]): Promise<void> {
	for (const actor of actors) await mockApi.registerUser(actor.user);
}

// swap both the browser session (cookie + localStorage) and the mock identity to act as this
// actor. mock direct calls resolve via the (unchanged) X-Test-Id header -> this actor; the token
// keeps SSR/native lookups consistent. call gotoHydrated() after this to reload the page.
export async function actAs(
	context: BrowserContext,
	mockApi: MockClient,
	actor: TestActor
): Promise<void> {
	await mockApi.loginAs(actor.user.id, actor.token);
	await context.clearCookies({ name: 'session_token' });
	await context.addCookies([
		{
			name: 'session_token',
			value: actor.token,
			domain: '127.0.0.1',
			path: '/',
			sameSite: 'Lax',
			secure: false
		}
	]);
	// the auth guard reads localStorage on cold boot; seed it for the next navigation
	await context.addInitScript((t) => {
		try {
			window.localStorage.setItem('session_token', t);
		} catch {
			// localStorage unavailable; the cookie path still resolves the mock identity
		}
	}, actor.token);
}

// the v0.6.0 SiteTours (trails/trailmarks/shared-garden) auto-start for a fresh user via
// startTourIfNew, which would dim the page and swallow taps mid-flow. flow specs seed all tours
// as completed so the UI is interactive; the dedicated tour specs skip this to assert auto-play.
export async function suppressV060Tours(context: BrowserContext): Promise<void> {
	await context.addInitScript(() => {
		try {
			window.localStorage.setItem(
				'earth_app_completed_tours',
				JSON.stringify([
					'welcome',
					'notifications',
					'verify-email',
					'trails',
					'trailmarks',
					'shared-garden'
				])
			);
		} catch {
			// localStorage unavailable; the tour just auto-plays and specs dismiss it
		}
	});
}
