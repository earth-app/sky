import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

type OAuthFlowContext = 'login' | 'signup' | 'link' | 'unlink' | 'unknown';

type OAuthFlowState = {
	active: boolean;
	context: OAuthFlowContext;
	provider: string;
	startedAt: number;
};

const OAUTH_FLOW_STORAGE_KEY = 'mobile_oauth_flow_state';
const OAUTH_FLOW_MAX_AGE_MS = 15 * 60 * 1000;

const REQUIRED_QUERY_PARAMS = ['client_id'] as const;

function getDefaultState(): OAuthFlowState {
	return {
		active: false,
		context: 'unknown',
		provider: '',
		startedAt: 0
	};
}

function readState(): OAuthFlowState {
	if (!import.meta.client) return getDefaultState();

	try {
		const raw = localStorage.getItem(OAUTH_FLOW_STORAGE_KEY);
		if (!raw) return getDefaultState();

		const parsed = JSON.parse(raw) as Partial<OAuthFlowState>;
		const nextState: OAuthFlowState = {
			active: Boolean(parsed.active),
			context: (parsed.context as OAuthFlowContext) || 'unknown',
			provider: typeof parsed.provider === 'string' ? parsed.provider : '',
			startedAt: Number(parsed.startedAt || 0)
		};

		if (nextState.active && Date.now() - nextState.startedAt > OAUTH_FLOW_MAX_AGE_MS) {
			return getDefaultState();
		}

		return nextState;
	} catch {
		return getDefaultState();
	}
}

function writeState(nextState: OAuthFlowState) {
	if (!import.meta.client) return;

	try {
		localStorage.setItem(OAUTH_FLOW_STORAGE_KEY, JSON.stringify(nextState));
	} catch {
		// Ignore localStorage errors.
	}
}

export type OAuthValidationResult =
	| { ok: true }
	| {
			ok: false;
			reason: 'invalid-url' | 'missing-client-id' | 'unsupported-provider';
			detail?: string;
	  };

export function validateOAuthUrl(url: string): OAuthValidationResult {
	if (!url || typeof url !== 'string') {
		return { ok: false, reason: 'invalid-url' };
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, reason: 'invalid-url' };
	}

	for (const param of REQUIRED_QUERY_PARAMS) {
		const value = parsed.searchParams.get(param);
		if (!value) {
			return { ok: false, reason: 'missing-client-id', detail: param };
		}
	}

	return { ok: true };
}

// Crust's mobile contract: the OAuth `state` parameter must be `<provider>:mobile[:context][:session_token]`.
// The server reads `:mobile` and routes the callback through the mobile-aware /oauth/complete path
// (universal/app-link target) instead of the web profile page. Context defaults are server-inferred
// when omitted, so we leave the third segment off for the 'unknown' context. For native `link`
// flows we append a URL-safe base64-encoded session token as a 4th segment because the
// SafariViewController cookie jar doesn't share with the app's localStorage-based auth, and crust
// needs to know which mobile user is requesting the link.
const MOBILE_STATE_CONTEXTS: ReadonlySet<OAuthFlowContext> = new Set(['login', 'signup', 'link']);

function encodeBase64Url(value: string): string {
	const base64 =
		typeof btoa === 'function'
			? btoa(value)
			: // SSR / Node fallback. Sky runs SPA-only, so this branch is mostly defensive.
				Buffer.from(value, 'utf-8').toString('base64');
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function applyMobileOAuthState(
	url: string,
	context: OAuthFlowContext,
	sessionToken?: string | null
): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}

	const currentState = parsed.searchParams.get('state');
	if (!currentState || currentState.includes(':mobile')) {
		return url;
	}

	const suffix = MOBILE_STATE_CONTEXTS.has(context) ? `:mobile:${context}` : ':mobile';
	let nextState = `${currentState}${suffix}`;

	if (context === 'link' && sessionToken && Capacitor.isNativePlatform()) {
		nextState += `:${encodeBase64Url(sessionToken)}`;
	}

	parsed.searchParams.set('state', nextState);
	return parsed.toString();
}

export function useMobileOAuth() {
	const isNative = Capacitor.isNativePlatform();
	const authStore = useAuthStore();

	const state = ref<OAuthFlowState>(readState());

	const beginFlow = async (
		url: string,
		context: OAuthFlowContext = 'unknown',
		provider: string = ''
	) => {
		const validation = validateOAuthUrl(url);
		if (!validation.ok) {
			const messages: Record<OAuthValidationResult['ok'] extends false ? string : never, string> = {
				'invalid-url': 'The sign-in URL is malformed. Please try another method.',
				'missing-client-id':
					'OAuth is not fully configured for this build. Please contact support.',
				'unsupported-provider': 'That sign-in provider is not supported on mobile.'
			} as Record<string, string>;

			const message =
				(messages as Record<string, string>)[validation.reason] || 'Unable to start sign-in.';
			throw new Error(message);
		}

		const targetUrl = applyMobileOAuthState(url, context, authStore.sessionToken);

		const previousState = state.value;
		const nextState: OAuthFlowState = {
			active: true,
			context,
			provider,
			startedAt: Date.now()
		};

		state.value = nextState;
		writeState(nextState);

		try {
			if (isNative) {
				await Browser.open({
					url: targetUrl,
					presentationStyle: 'fullscreen'
				});
				return;
			}

			await navigateTo(targetUrl, { external: true });
		} catch (error) {
			state.value = previousState;
			writeState(previousState);
			throw error;
		}
	};

	const closeBrowser = async () => {
		if (!isNative) return;

		try {
			await Browser.close();
		} catch {
			// Browser may already be closed.
		}
	};

	const clearFlow = () => {
		state.value = getDefaultState();
		writeState(state.value);
	};

	const refreshFlowState = () => {
		state.value = readState();
		return state.value;
	};

	return {
		isNative,
		state,
		beginFlow,
		closeBrowser,
		clearFlow,
		refreshFlowState
	};
}
