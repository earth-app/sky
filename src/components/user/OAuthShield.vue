<template>
	<IonButton
		:style="`--background: ${bgColor};
		--background-hover: ${bgColor};
		--background-activated: ${bgColor};
		--background-focused: ${bgColor};
		--color: ${textColor}`"
		size="small"
		class="w-full active:brightness-110 hover:brightness-90 hover:scale-105 transition-all duration-250"
		@click="startOauth"
	>
		<div class="w-full flex items-center justify-evenly">
			<UIcon
				:name="icon"
				class="mr-2 size-5"
			/>
			{{ label }} {{ name }}
		</div>
	</IonButton>
</template>

<script setup lang="ts">
import type { OAuthProvider } from 'types/user';
import { capitalizeFully } from 'utils';
import {
	isAppleNativeAvailable,
	isAppleNativeUnavailableError,
	startAppleNativeAuth
} from '~/composables/useAppleNativeAuth';

type OAuthFlowContext = 'login' | 'signup' | 'link' | 'unlink' | 'unknown';

const props = withDefaults(
	defineProps<{
		provider: OAuthProvider;
		label?: string;
		context?: OAuthFlowContext;
	}>(),
	{
		label: 'Sign in with',
		context: 'login'
	}
);

const { beginFlow } = useMobileOAuth();
const { impactLight, notifyError, notifySuccess } = useAppHaptics();
const { fetchUser } = useAuth();

const name = capitalizeFully(props.provider);
const label = props.label;

let icon: string = '';
let bgColor: string = '';
let textColor: string = '#000000';
switch (props.provider) {
	case 'google':
		icon = 'logos:google-icon';
		bgColor = '#ffffff';
		break;
	case 'github':
		icon = 'logos:github-icon';
		bgColor = '#333333';
		textColor = '#ffffff';
		break;
	case 'microsoft':
		icon = 'logos:microsoft-icon';
		bgColor = '#f2f2f2';
		break;
	case 'discord':
		icon = 'logos:discord-icon';
		bgColor = '#4621d2';
		textColor = '#ffffff';
		break;
	case 'facebook':
		icon = 'logos:facebook';
		bgColor = '#1877f2';
		textColor = '#ffffff';
		break;
	case 'apple':
		icon = 'mdi:apple';
		bgColor = '#000000';
		textColor = '#ffffff';
		break;
	default:
		icon = '';
		bgColor = '#000000';
		textColor = '#ffffff';
		break;
}

async function startOauth() {
	try {
		await impactLight();

		// Narrow the broader OAuthFlowContext down to crust's OAuthContext
		// ('login' | 'signup' | 'link') so we can pass it to authLink and the
		// native Apple helper without TS complaints. 'unlink'/'unknown' don't
		// reach this component in practice, but we default safely.
		const oauthContext: 'login' | 'signup' | 'link' =
			props.context === 'signup' || props.context === 'link' ? props.context : 'login';

		// Native iOS Sign in with Apple — bypass the in-app browser and use the
		// system authentication sheet (Face ID / Touch ID, no browser bounce).
		if (props.provider === 'apple' && isAppleNativeAvailable()) {
			try {
				await startAppleNativeAuth(oauthContext);
				notifySuccess();
				// The session token is set inside the composable; pulling the user
				// triggers the parent page's auth watcher to navigate.
				await fetchUser(true);
				return;
			} catch (error: unknown) {
				// If the native plugin isn't linked into the iOS binary yet (the
				// JS shim exists but no native side), fall back to the browser
				// OAuth flow instead of failing outright.
				if (!isAppleNativeUnavailableError(error)) {
					throw error;
				}
				console.warn(
					'Native Apple Sign In is not available in this build; falling back to browser flow.'
				);
			}
		}

		// Crust's authLink defaults source to 'web', which produces a state like
		// `<provider>:web:<context>`. Sky is always the mobile client, so pass
		// 'mobile' explicitly — otherwise applyMobileOAuthState would append a
		// second `:mobile:<context>` and produce a malformed 5-segment state
		// that crust parses as source='web' with the trailing segments as a
		// (bogus) mobile session token.
		const authUrl = authLink(props.provider, oauthContext, 'mobile');
		await beginFlow(authUrl, props.context, props.provider);
	} catch (error: unknown) {
		notifyError();
		await showErrorToast(error, {
			fallback: `Failed to start sign-in with ${capitalizeFully(props.provider)}.`
		});
	}
}
</script>
