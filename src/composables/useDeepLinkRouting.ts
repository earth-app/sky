import { Preferences } from '@capacitor/preferences';

type DeepLinkResult =
	| { type: 'internal'; target: string }
	| { type: 'external'; target: string }
	| { type: 'ignore'; target: string }
	| {
			type: 'oauth-complete';
			target: string;
			sessionToken: string;
			provider: string;
			context: string;
	  };

const EXTERNAL_ONLY_PATHS = new Set([
	'/about',
	'/terms',
	'/terms-of-service',
	'/privacy',
	'/privacy-policy'
]);

const TABS_PREFIX_PATHS = ['/activities/', '/articles/', '/events/', '/prompts/'];

const OAUTH_COMPLETE_PATHS = new Set([
	'/oauth/complete',
	'/oauth-complete',
	'/auth/complete',
	'/auth/callback-mobile'
]);

const REFERRAL_CODE_KEY = 'referral_code';

// best-effort persist; invite resolution must never block on storage
async function persistReferralCode(code: string) {
	if (!code) return;
	try {
		await Preferences.set({ key: REFERRAL_CODE_KEY, value: code });
	} catch (err) {
		console.warn('[deep-link] failed to persist referral code:', err);
	}
}

function normalizePath(pathname: string) {
	if (!pathname) return '/';
	if (pathname.length > 1 && pathname.endsWith('/')) {
		return pathname.slice(0, -1);
	}
	return pathname;
}

function hasPrefix(pathname: string, prefixes: string[]) {
	return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function isKnownTabsPath(pathname: string) {
	if (pathname === '/tabs/dashboard') return true;
	if (pathname === '/tabs/discover') return true;
	if (pathname === '/tabs/profile') return true;
	if (pathname === '/tabs/profile/editor') return true;

	if (pathname.startsWith('/tabs/profile/')) return true;
	if (pathname.startsWith('/tabs/activities/')) return true;
	if (pathname.startsWith('/tabs/articles/')) return true;
	if (pathname.startsWith('/tabs/events/')) return true;
	if (pathname.startsWith('/tabs/prompts/')) return true;

	return false;
}

export function useDeepLinkRouting() {
	const config = useRuntimeConfig();

	const allowedHosts = computed(() => {
		const hosts = new Set<string>(['app.earth-app.com']);

		for (const maybeUrl of [config.public.baseUrl, config.public.crustBaseUrl]) {
			if (!maybeUrl || typeof maybeUrl !== 'string') continue;

			try {
				hosts.add(new URL(maybeUrl).host.toLowerCase());
			} catch {
				// Ignore invalid runtime config URLs.
			}
		}

		return hosts;
	});

	const resolveDeepLink = (rawUrl: string): DeepLinkResult => {
		if (!rawUrl) return { type: 'ignore', target: '' };

		let parsed: URL;
		try {
			parsed = new URL(rawUrl);
		} catch {
			return { type: 'ignore', target: '' };
		}

		const isCustomScheme = parsed.protocol === 'com.earthapp.sky:';
		const host = parsed.host.toLowerCase();
		if (!isCustomScheme && !allowedHosts.value.has(host)) {
			return { type: 'ignore', target: '' };
		}

		const pathname = normalizePath(parsed.pathname);
		const query = parsed.search || '';
		const hash = parsed.hash || '';

		const refParam = parsed.searchParams.get('ref');
		if (refParam) void persistReferralCode(refParam);

		let inviteCode = '';
		if (pathname.startsWith('/invite/')) {
			inviteCode = pathname.slice('/invite/'.length).split('/')[0] || '';
		} else if (isCustomScheme && host === 'invite') {
			inviteCode = pathname.replace(/^\//, '').split('/')[0] || '';
		}
		if (inviteCode) {
			void persistReferralCode(inviteCode);
			return { type: 'internal', target: `/signup?ref=${encodeURIComponent(inviteCode)}` };
		}

		// OAuth callback completion (universal/app link from the crust callback): extract token and
		// hand back to the caller so it can populate the auth store and route the user in-app.
		if (
			isCustomScheme ||
			OAUTH_COMPLETE_PATHS.has(pathname) ||
			pathname.startsWith('/oauth/complete/')
		) {
			const sessionToken =
				parsed.searchParams.get('session_token') ||
				parsed.searchParams.get('sessionToken') ||
				parsed.searchParams.get('token') ||
				new URLSearchParams(parsed.hash.replace(/^#/, '')).get('session_token') ||
				'';
			const provider = parsed.searchParams.get('provider') || '';
			// Crust returns the resolved context directly in the `context` query param.
			// Older flows may still send the raw `state` value (e.g. "github:mobile:signup");
			// take the trailing segment in that case.
			const rawContext =
				parsed.searchParams.get('context') || parsed.searchParams.get('state') || '';
			const context = rawContext.includes(':')
				? rawContext.split(':').filter(Boolean).pop() || ''
				: rawContext;

			if (sessionToken) {
				// reauth context returns to the profile editor so the delete section can
				// re-read the recently-authenticated state and unlock the danger button
				const target =
					context === 'reauth'
						? '/tabs/profile/editor?success=reauth_completed'
						: '/tabs/dashboard';
				return {
					type: 'oauth-complete',
					target,
					sessionToken,
					provider,
					context
				};
			}

			// No token; treat as a sign-in error. Route back to the form that started the flow so
			// the existing error toast pipeline can surface a contextual message.
			const errorCode = parsed.searchParams.get('error') || 'auth_failed';
			const errorTarget =
				context === 'signup'
					? '/signup'
					: context === 'link' || context === 'reauth'
						? '/tabs/profile/editor'
						: '/login';
			return {
				type: 'internal',
				target: `${errorTarget}?error=${encodeURIComponent(errorCode)}`
			};
		}

		if (EXTERNAL_ONLY_PATHS.has(pathname)) {
			return { type: 'external', target: parsed.toString() };
		}

		if (pathname === '/' || pathname === '') {
			return { type: 'internal', target: `/tabs/dashboard${query}${hash}` };
		}

		if (pathname === '/tabs') {
			return { type: 'internal', target: `/tabs/dashboard${query}${hash}` };
		}

		if (pathname.startsWith('/tabs/')) {
			if (isKnownTabsPath(pathname)) {
				return { type: 'internal', target: `${pathname}${query}${hash}` };
			}

			return { type: 'external', target: parsed.toString() };
		}

		if (hasPrefix(pathname, TABS_PREFIX_PATHS)) {
			return { type: 'internal', target: `/tabs${pathname}${query}${hash}` };
		}

		if (pathname === '/discover') {
			return { type: 'internal', target: `/tabs/discover${query}${hash}` };
		}

		if (pathname === '/dashboard') {
			return { type: 'internal', target: `/tabs/dashboard${query}${hash}` };
		}

		// the challenge notification links to crust's /profile/quests?open=<id>
		if (pathname === '/profile/quests') {
			return { type: 'internal', target: `/tabs/quests${query}${hash}` };
		}

		if (pathname === '/profile' || pathname.startsWith('/profile/')) {
			return { type: 'internal', target: `${pathname}${query}${hash}` };
		}

		if (
			pathname === '/login' ||
			pathname === '/signup' ||
			pathname === '/verify-email' ||
			pathname === '/forgot-password' ||
			pathname === '/reset-password'
		) {
			return { type: 'internal', target: `${pathname}${query}${hash}` };
		}

		return { type: 'external', target: parsed.toString() };
	};

	return {
		resolveDeepLink
	};
}
