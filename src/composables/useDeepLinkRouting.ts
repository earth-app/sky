type DeepLinkResult = {
	type: 'internal' | 'external' | 'ignore';
	target: string;
};

const EXTERNAL_ONLY_PATHS = new Set([
	'/about',
	'/terms',
	'/terms-of-service',
	'/privacy',
	'/privacy-policy'
]);

const TABS_PREFIX_PATHS = ['/activities/', '/articles/', '/events/', '/prompts/'];

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

		const host = parsed.host.toLowerCase();
		if (!allowedHosts.value.has(host)) {
			return { type: 'ignore', target: '' };
		}

		const pathname = normalizePath(parsed.pathname);
		const query = parsed.search || '';
		const hash = parsed.hash || '';

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

		if (pathname === '/profile' || pathname.startsWith('/profile/')) {
			return { type: 'internal', target: `${pathname}${query}${hash}` };
		}

		if (pathname === '/login' || pathname === '/signup' || pathname === '/verify-email') {
			return { type: 'internal', target: `${pathname}${query}${hash}` };
		}

		return { type: 'external', target: parsed.toString() };
	};

	return {
		resolveDeepLink
	};
}
