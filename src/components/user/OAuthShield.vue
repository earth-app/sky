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
import { Toast } from '@capacitor/toast';
import type { OAuthProvider } from 'types/user';
import { capitalizeFully } from 'utils';

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
const { impactLight, notifyError } = useAppHaptics();

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
	default:
		icon = '';
		bgColor = '#000000';
		textColor = '#ffffff';
		break;
}

async function startOauth() {
	try {
		await impactLight();
		const authUrl = authLink(props.provider);
		await beginFlow(authUrl, props.context);
	} catch (error: any) {
		await notifyError();
		await Toast.show({
			text: error?.message || 'Failed to start OAuth sign-in.',
			duration: 'long'
		});
	}
}
</script>
