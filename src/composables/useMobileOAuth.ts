import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

type OAuthFlowContext = 'login' | 'signup' | 'link' | 'unlink' | 'unknown';

type OAuthFlowState = {
	active: boolean;
	context: OAuthFlowContext;
	startedAt: number;
};

const OAUTH_FLOW_STORAGE_KEY = 'mobile_oauth_flow_state';
const OAUTH_FLOW_MAX_AGE_MS = 15 * 60 * 1000;

function getDefaultState(): OAuthFlowState {
	return {
		active: false,
		context: 'unknown',
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

export function useMobileOAuth() {
	const isNative = Capacitor.isNativePlatform();

	const state = ref<OAuthFlowState>(readState());

	const beginFlow = async (url: string, context: OAuthFlowContext = 'unknown') => {
		const previousState = state.value;
		const nextState: OAuthFlowState = {
			active: true,
			context,
			startedAt: Date.now()
		};

		state.value = nextState;
		writeState(nextState);

		try {
			if (isNative) {
				await Browser.open({
					url,
					presentationStyle: 'fullscreen'
				});
				return;
			}

			await navigateTo(url, { external: true });
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
