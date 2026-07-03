import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefsSet = vi.fn(async (..._args: any[]) => {});
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		set: (...args: any[]) => prefsSet(...args),
		get: vi.fn(async () => ({ value: null })),
		remove: vi.fn(async () => {})
	}
}));

import { useDeepLinkRouting } from '~/composables/useDeepLinkRouting';

const APP_HOST = 'https://app.earth-app.com';

beforeEach(() => {
	prefsSet.mockClear();
});

describe('useDeepLinkRouting.resolveDeepLink', () => {
	let resolveDeepLink: ReturnType<typeof useDeepLinkRouting>['resolveDeepLink'];
	beforeEach(() => {
		resolveDeepLink = useDeepLinkRouting().resolveDeepLink;
	});

	it('ignores empty / unparseable input', () => {
		expect(resolveDeepLink('')).toEqual({ type: 'ignore', target: '' });
		expect(resolveDeepLink('not a url')).toEqual({ type: 'ignore', target: '' });
	});

	it('ignores a foreign host', () => {
		expect(resolveDeepLink('https://evil.example.com/tabs/dashboard')).toEqual({
			type: 'ignore',
			target: ''
		});
	});

	it('maps the bare host root to the dashboard tab', () => {
		expect(resolveDeepLink(`${APP_HOST}/`)).toEqual({
			type: 'internal',
			target: '/tabs/dashboard'
		});
	});

	it('maps /tabs to the dashboard tab', () => {
		expect(resolveDeepLink(`${APP_HOST}/tabs`)).toEqual({
			type: 'internal',
			target: '/tabs/dashboard'
		});
	});

	it('keeps a known tabs path internal and preserves query + hash', () => {
		expect(resolveDeepLink(`${APP_HOST}/tabs/discover?q=hike#top`)).toEqual({
			type: 'internal',
			target: '/tabs/discover?q=hike#top'
		});
	});

	it('routes an unknown /tabs/* path externally', () => {
		const res = resolveDeepLink(`${APP_HOST}/tabs/unknown-thing`);
		expect(res.type).toBe('external');
	});

	it('rewrites a content prefix path under /tabs', () => {
		expect(resolveDeepLink(`${APP_HOST}/articles/art-1`)).toEqual({
			type: 'internal',
			target: '/tabs/articles/art-1'
		});
	});

	it('maps /discover and /dashboard shortcuts to their tabs', () => {
		expect(resolveDeepLink(`${APP_HOST}/discover`).target).toBe('/tabs/discover');
		expect(resolveDeepLink(`${APP_HOST}/dashboard`).target).toBe('/tabs/dashboard');
	});

	it('maps /profile/quests to the quests tab', () => {
		expect(resolveDeepLink(`${APP_HOST}/profile/quests?open=q1`)).toEqual({
			type: 'internal',
			target: '/tabs/quests?open=q1'
		});
	});

	it('keeps generic /profile paths internal', () => {
		expect(resolveDeepLink(`${APP_HOST}/profile/someuser`)).toEqual({
			type: 'internal',
			target: '/profile/someuser'
		});
	});

	it('keeps auth pages internal', () => {
		for (const p of ['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password']) {
			expect(resolveDeepLink(`${APP_HOST}${p}`)).toEqual({ type: 'internal', target: p });
		}
	});

	it('sends external-only legal pages to external', () => {
		const res = resolveDeepLink(`${APP_HOST}/privacy-policy`);
		expect(res.type).toBe('external');
	});

	it('strips a trailing slash before matching', () => {
		expect(resolveDeepLink(`${APP_HOST}/dashboard/`).target).toBe('/tabs/dashboard');
	});

	describe('invite links', () => {
		it('routes /invite/<code> to signup with the ref preserved and persists it', () => {
			const res = resolveDeepLink(`${APP_HOST}/invite/ABC234`);
			expect(res).toEqual({ type: 'internal', target: '/signup?ref=ABC234' });
			expect(prefsSet).toHaveBeenCalledWith({ key: 'referral_code', value: 'ABC234' });
		});

		it('resolves the custom-scheme invite host', () => {
			const res = resolveDeepLink('com.earthapp.sky://invite/XYZ789');
			expect(res).toEqual({ type: 'internal', target: '/signup?ref=XYZ789' });
		});

		it('persists a ?ref= query param even on a non-invite path', () => {
			resolveDeepLink(`${APP_HOST}/tabs/dashboard?ref=FROMQUERY`);
			expect(prefsSet).toHaveBeenCalledWith({ key: 'referral_code', value: 'FROMQUERY' });
		});
	});

	describe('oauth completion', () => {
		it('returns oauth-complete with token + provider + resolved context', () => {
			const url = `${APP_HOST}/oauth/complete?session_token=tok123&provider=github&context=login`;
			const res = resolveDeepLink(url);
			expect(res).toMatchObject({
				type: 'oauth-complete',
				target: '/tabs/dashboard',
				sessionToken: 'tok123',
				provider: 'github',
				context: 'login'
			});
		});

		it('routes a reauth completion back to the profile editor', () => {
			const url = `${APP_HOST}/oauth/complete?session_token=tok123&context=reauth`;
			const res = resolveDeepLink(url);
			expect(res).toMatchObject({
				type: 'oauth-complete',
				target: '/tabs/profile/editor?success=reauth_completed'
			});
		});

		it('takes the trailing segment of a colon-delimited raw state value', () => {
			const url = `${APP_HOST}/oauth/complete?token=tok&state=github:mobile:signup`;
			const res = resolveDeepLink(url);
			expect(res).toMatchObject({ type: 'oauth-complete', context: 'signup' });
		});

		it('routes a token-less signup completion back to /signup with an error', () => {
			const url = `${APP_HOST}/oauth/complete?context=signup&error=denied`;
			const res = resolveDeepLink(url);
			expect(res).toEqual({ type: 'internal', target: '/signup?error=denied' });
		});

		it('defaults a token-less error to /login', () => {
			const url = `${APP_HOST}/oauth/complete`;
			const res = resolveDeepLink(url);
			expect(res).toEqual({ type: 'internal', target: '/login?error=auth_failed' });
		});

		it('reads the session token from the URL hash fragment', () => {
			const url = `${APP_HOST}/auth/callback-mobile#session_token=hashtok`;
			const res = resolveDeepLink(url);
			expect(res).toMatchObject({ type: 'oauth-complete', sessionToken: 'hashtok' });
		});
	});
});
