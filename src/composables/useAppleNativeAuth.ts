import { SignInWithApple, type SignInWithAppleResponse } from '@capacitor-community/apple-sign-in';
import { Capacitor } from '@capacitor/core';
import type { User } from 'types/user';

type AppleAuthContext = 'login' | 'signup' | 'link';

// The Capacitor `appId` from capacitor.config.ts. Apple's native flow uses the
// Bundle ID as the audience for the returned identity token; this is bound to
// the "Sign In with Apple" entitlement in Xcode.
const APPLE_NATIVE_CLIENT_ID = 'com.earthapp.sky';

export function isAppleNativeAvailable(): boolean {
	return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

function randomNonce(): string {
	const bytes = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i += 1) {
			bytes[i] = Math.floor(Math.random() * 256);
		}
	}
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isCancelError(error: unknown): boolean {
	const message = (error as { message?: string; code?: string })?.message?.toLowerCase() || '';
	const code = (error as { code?: string })?.code || '';
	return (
		message.includes('cancel') ||
		message.includes('canceled') ||
		message.includes('cancelled') ||
		code === 'ASAuthorizationErrorCanceled'
	);
}

export function isAppleNativeUnavailableError(error: unknown): boolean {
	const message = (error as { message?: string })?.message?.toLowerCase() || '';
	// Capacitor throws this when the JS shim loads but the native plugin is
	// missing from the iOS binary (i.e. `npx cap sync ios` was never run after
	// the package was added to Package.swift, or the app wasn't rebuilt).
	return (
		message.includes('not implemented') ||
		message.includes('not available') ||
		message.includes('unimplemented')
	);
}

// True when the user dismissed the native Apple sheet. `startAppleNativeAuth` tags the
// cancellation error so callers can distinguish "user backed out" (do nothing) from a real
// failure (which should fall back to the browser flow).
export function isAppleSignInCancelled(error: unknown): boolean {
	return (
		Boolean((error as { appleCancelled?: boolean } | null)?.appleCancelled) || isCancelError(error)
	);
}

export type AppleNativeAuthResult = {
	sessionToken: string;
	user: unknown;
	isLinking: boolean;
	raw: SignInWithAppleResponse['response'];
};

export async function startAppleNativeAuth(
	context: AppleAuthContext = 'login'
): Promise<AppleNativeAuthResult> {
	if (!isAppleNativeAvailable()) {
		throw new Error('Native Apple Sign In is only available on iOS.');
	}

	const config = useRuntimeConfig();
	const authStore = useAuthStore();

	const redirectURI = new URL('/api/auth/callback', config.public.baseUrl).toString();
	const nonce = randomNonce();
	const state = `apple:mobile:${context}`;

	let response: SignInWithAppleResponse;
	try {
		response = await SignInWithApple.authorize({
			clientId: APPLE_NATIVE_CLIENT_ID,
			redirectURI,
			scopes: 'email name',
			state,
			nonce
		});
	} catch (error) {
		if (isCancelError(error)) {
			throw Object.assign(new Error('Sign in cancelled.'), { appleCancelled: true });
		}
		console.warn('[apple-auth] native authorization failed:', error);
		throw error;
	}

	const credential = response.response;
	if (!credential?.identityToken) {
		throw new Error('Apple did not return an identity token.');
	}

	const isLinking = context === 'link';
	const currentToken = authStore.sessionToken || null;

	const apiBase = (config.public.apiBaseUrl || 'https://api.earth-app.com').replace(/\/+$/, '');
	const url = `${apiBase}/v2/users/oauth/apple?is_linking=${isLinking}`;

	// Apple only returns email / givenName / familyName on the very first
	// authorization for an Apple ID + app pair. Forward them so mantle2 can use
	// them when creating a brand-new account — they are ignored when linking
	// or when the user already exists.
	let result: { session_token: string; user: unknown };
	try {
		result = await $fetch<{ session_token: string; user: unknown }>(url, {
			method: 'POST',
			body: {
				id_token: credential.identityToken,
				authorization_code: credential.authorizationCode || undefined,
				session_token: currentToken,
				email: credential.email || undefined,
				given_name: credential.givenName || undefined,
				family_name: credential.familyName || undefined,
				nonce
			}
		});
	} catch (error) {
		console.error('[apple-auth] token exchange with the API failed:', error);
		throw error;
	}

	if (!result?.session_token) {
		throw new Error('Apple sign-in succeeded but no session token was returned.');
	}

	authStore.setSessionToken(result.session_token);

	// Mirror the username/password login path (crust useLogin): set the user object directly
	// from the response instead of relying on a follow-up /v2/users/current round-trip. This is
	// what makes the auth-driven redirect fire reliably right after a native Apple sign-in.
	if (result.user && typeof result.user === 'object') {
		authStore.currentUser = result.user as User;
	}

	return {
		sessionToken: result.session_token,
		user: result.user,
		isLinking,
		raw: credential
	};
}
