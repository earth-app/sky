import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
	isNative: vi.fn(() => true),
	platform: vi.fn(() => 'ios')
}));

const authorize = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const setSessionToken = vi.hoisted(() => vi.fn());
const authRef = vi.hoisted(() => ({
	store: null as null | {
		sessionToken: string | null;
		currentUser: unknown;
		setSessionToken: (token: string) => void;
	}
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: cap.isNative, getPlatform: cap.platform }
}));
vi.mock('@capacitor-community/apple-sign-in', () => ({ SignInWithApple: { authorize } }));
vi.mock('#build/fetch.mjs', () => ({ $fetch: fetchMock }));
vi.mock('@earth-app/crust/src/stores/auth', async () => {
	const { reactive } = await import('vue');
	const store = reactive({
		sessionToken: null as string | null,
		currentUser: null as unknown,
		setSessionToken
	});
	authRef.store = store;
	return { useAuthStore: () => store };
});

import {
	isAppleNativeAvailable,
	isAppleNativeUnavailableError,
	isAppleSignInCancelled,
	startAppleNativeAuth
} from '~/composables/useAppleNativeAuth';

const BASE_URL = 'https://app.test.invalid';
// deliberately trailing-slashed; the composable has to trim it
const API_BASE_URL = 'https://api.test.invalid/';

const CREDENTIAL = {
	identityToken: 'id-token-abc',
	authorizationCode: 'auth-code-xyz',
	email: 'someone@privaterelay.appleid.com',
	givenName: 'Ada',
	familyName: 'Lovelace'
};

function authorizeArgs(): Record<string, unknown> {
	const call = authorize.mock.calls[0];
	if (!call) throw new Error('SignInWithApple.authorize was never called');
	return call[0] as Record<string, unknown>;
}

function exchangeCall(): [string, { body: Record<string, unknown>; method: string }] {
	const call = fetchMock.mock.calls[0];
	if (!call) throw new Error('the token exchange never happened');
	return call as [string, { body: Record<string, unknown>; method: string }];
}

let restoreConfig: () => void = () => {};

beforeEach(() => {
	vi.clearAllMocks();
	const cfg = useRuntimeConfig();
	const previous = { baseUrl: cfg.public.baseUrl, apiBaseUrl: cfg.public.apiBaseUrl };
	cfg.public.baseUrl = BASE_URL;
	cfg.public.apiBaseUrl = API_BASE_URL;
	restoreConfig = () => {
		cfg.public.baseUrl = previous.baseUrl;
		cfg.public.apiBaseUrl = previous.apiBaseUrl;
	};
	cap.isNative.mockReturnValue(true);
	cap.platform.mockReturnValue('ios');
	authorize.mockResolvedValue({ response: CREDENTIAL });
	fetchMock.mockResolvedValue({ session_token: 'sess-new', user: { id: 'u1' } });
	if (authRef.store) {
		authRef.store.sessionToken = null;
		authRef.store.currentUser = null;
	}
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	restoreConfig();
});

describe('isAppleNativeAvailable', () => {
	it('is true only for a native iOS build', () => {
		expect(isAppleNativeAvailable()).toBe(true);

		cap.platform.mockReturnValue('android');
		expect(isAppleNativeAvailable()).toBe(false);

		cap.platform.mockReturnValue('ios');
		cap.isNative.mockReturnValue(false);
		expect(isAppleNativeAvailable()).toBe(false);
	});
});

describe('isAppleNativeUnavailableError', () => {
	it('recognises every shape Capacitor uses for a missing native plugin', () => {
		expect(
			isAppleNativeUnavailableError(new Error('SignInWithApple does not have web implementation'))
		).toBe(false);
		expect(isAppleNativeUnavailableError(new Error('Not implemented on ios'))).toBe(true);
		expect(isAppleNativeUnavailableError(new Error('Plugin is not available'))).toBe(true);
		expect(isAppleNativeUnavailableError({ message: 'UNIMPLEMENTED' })).toBe(true);
	});

	it('does not swallow a real failure, and survives a message-less error', () => {
		expect(isAppleNativeUnavailableError(new Error('The operation could not be completed'))).toBe(
			false
		);
		expect(isAppleNativeUnavailableError(null)).toBe(false);
		expect(isAppleNativeUnavailableError(undefined)).toBe(false);
		expect(isAppleNativeUnavailableError('not implemented')).toBe(false);
		expect(isAppleNativeUnavailableError({ code: 'UNIMPLEMENTED' })).toBe(false);
	});
});

describe('isAppleSignInCancelled', () => {
	it('accepts the tag, every cancel spelling, and the ASAuthorization code', () => {
		expect(isAppleSignInCancelled(Object.assign(new Error('x'), { appleCancelled: true }))).toBe(
			true
		);
		expect(isAppleSignInCancelled(new Error('The user canceled the request'))).toBe(true);
		expect(isAppleSignInCancelled(new Error('User cancelled'))).toBe(true);
		expect(isAppleSignInCancelled({ code: 'ASAuthorizationErrorCanceled' })).toBe(true);
	});

	it('is false for a genuine failure or a missing error', () => {
		expect(isAppleSignInCancelled(new Error('Invalid client'))).toBe(false);
		expect(isAppleSignInCancelled(null)).toBe(false);
		expect(isAppleSignInCancelled({ appleCancelled: false })).toBe(false);
	});
});

describe('startAppleNativeAuth authorization request', () => {
	it('refuses to run anywhere but native iOS, without touching the plugin', async () => {
		cap.platform.mockReturnValue('android');
		await expect(startAppleNativeAuth()).rejects.toThrow(
			'Native Apple Sign In is only available on iOS.'
		);
		expect(authorize).not.toHaveBeenCalled();
	});

	it('sends the bundle id, the crust callback redirect, and a mobile-tagged state', async () => {
		await startAppleNativeAuth('signup');
		expect(authorizeArgs()).toMatchObject({
			clientId: 'com.earthapp.sky',
			redirectURI: `${BASE_URL}/api/auth/callback`,
			scopes: 'email name',
			state: 'apple:mobile:signup'
		});
	});

	it('defaults the context to login and tags link flows distinctly', async () => {
		await startAppleNativeAuth();
		expect(authorizeArgs().state).toBe('apple:mobile:login');

		authorize.mockClear();
		await startAppleNativeAuth('link');
		expect(authorizeArgs().state).toBe('apple:mobile:link');
	});

	it('generates a fresh 128-bit hex nonce per attempt', async () => {
		await startAppleNativeAuth();
		const first = authorizeArgs().nonce as string;
		expect(first).toMatch(/^[0-9a-f]{32}$/);

		authorize.mockClear();
		await startAppleNativeAuth();
		expect(authorizeArgs().nonce).not.toBe(first);
	});
});

describe('startAppleNativeAuth failure classification', () => {
	it('tags a user cancellation so callers can stay silent instead of falling back', async () => {
		authorize.mockRejectedValue({ code: 'ASAuthorizationErrorCanceled' });
		const error = await startAppleNativeAuth().catch((e: unknown) => e);
		expect(isAppleSignInCancelled(error)).toBe(true);
		expect((error as Error).message).toBe('Sign in cancelled.');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rethrows a missing-plugin error untouched so the web OAuth fallback can trigger', async () => {
		const original = new Error('SignInWithApple is not implemented');
		authorize.mockRejectedValue(original);
		const error = await startAppleNativeAuth().catch((e: unknown) => e);
		expect(error).toBe(original);
		expect(isAppleSignInCancelled(error)).toBe(false);
		expect(isAppleNativeUnavailableError(error)).toBe(true);
	});

	it('rethrows a real authorization failure as neither cancelled nor unavailable', async () => {
		authorize.mockRejectedValue(new Error('invalid_client'));
		const error = await startAppleNativeAuth().catch((e: unknown) => e);
		expect(isAppleSignInCancelled(error)).toBe(false);
		expect(isAppleNativeUnavailableError(error)).toBe(false);
	});

	it('rejects a credential with no identity token before contacting the API', async () => {
		authorize.mockResolvedValue({ response: { ...CREDENTIAL, identityToken: '' } });
		await expect(startAppleNativeAuth()).rejects.toThrow('Apple did not return an identity token.');
		expect(fetchMock).not.toHaveBeenCalled();

		authorize.mockResolvedValue({ response: null });
		await expect(startAppleNativeAuth()).rejects.toThrow('Apple did not return an identity token.');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('startAppleNativeAuth token exchange', () => {
	it('posts to the mantle2 apple endpoint with is_linking off by default', async () => {
		await startAppleNativeAuth();
		const [url, options] = exchangeCall();
		const parsed = new URL(url);
		expect(parsed.origin + parsed.pathname).toBe(
			`${new URL(API_BASE_URL).origin}/v2/users/oauth/apple`
		);
		expect(parsed.searchParams.get('is_linking')).toBe('false');
		expect(options.method).toBe('POST');
	});

	it('flags is_linking for the link context and reports it back', async () => {
		const result = await startAppleNativeAuth('link');
		expect(new URL(exchangeCall()[0]).searchParams.get('is_linking')).toBe('true');
		expect(result.isLinking).toBe(true);
	});

	it('trims a trailing slash off apiBaseUrl rather than doubling it', async () => {
		await startAppleNativeAuth();
		expect(exchangeCall()[0]).not.toContain('//v2/');
	});

	it('forwards the credential plus the current session and the same nonce it signed with', async () => {
		authRef.store!.sessionToken = 'existing-session';
		await startAppleNativeAuth('link');
		const body = exchangeCall()[1].body;
		expect(body).toEqual({
			id_token: 'id-token-abc',
			authorization_code: 'auth-code-xyz',
			session_token: 'existing-session',
			email: 'someone@privaterelay.appleid.com',
			given_name: 'Ada',
			family_name: 'Lovelace',
			// replay protection is worthless if the value sent to Apple is not the one verified
			nonce: authorizeArgs().nonce
		});
	});

	it('omits the first-authorization-only profile fields when Apple withholds them', async () => {
		authorize.mockResolvedValue({ response: { identityToken: 'id-token-abc' } });
		await startAppleNativeAuth();
		const body = exchangeCall()[1].body;
		expect(body.email).toBeUndefined();
		expect(body.given_name).toBeUndefined();
		expect(body.family_name).toBeUndefined();
		expect(body.authorization_code).toBeUndefined();
		expect(body.session_token).toBeNull();
	});
});

describe('startAppleNativeAuth session handling', () => {
	it('stores the session and the returned user so the auth redirect fires immediately', async () => {
		const result = await startAppleNativeAuth();
		expect(setSessionToken).toHaveBeenCalledWith('sess-new');
		expect(authRef.store!.currentUser).toEqual({ id: 'u1' });
		expect(result).toMatchObject({ sessionToken: 'sess-new', isLinking: false });
		expect(result.raw).toEqual(CREDENTIAL);
	});

	it('never half-authenticates when the API rejects the exchange', async () => {
		fetchMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));
		await expect(startAppleNativeAuth()).rejects.toThrow('Unauthorized');
		expect(setSessionToken).not.toHaveBeenCalled();
		expect(authRef.store!.currentUser).toBeNull();
	});

	it('never half-authenticates when the API omits the session token', async () => {
		fetchMock.mockResolvedValue({ user: { id: 'u1' } });
		await expect(startAppleNativeAuth()).rejects.toThrow(
			'Apple sign-in succeeded but no session token was returned.'
		);
		expect(setSessionToken).not.toHaveBeenCalled();
		expect(authRef.store!.currentUser).toBeNull();
	});

	it('leaves currentUser alone when the API returns no user object', async () => {
		fetchMock.mockResolvedValue({ session_token: 'sess-new', user: null });
		const result = await startAppleNativeAuth();
		expect(setSessionToken).toHaveBeenCalledWith('sess-new');
		expect(authRef.store!.currentUser).toBeNull();
		expect(result.user).toBeNull();
	});
});
