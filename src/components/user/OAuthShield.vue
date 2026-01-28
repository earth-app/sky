<template>
	<IonButton
		:style="`--background: ${bgColor};
		--background-hover: ${bgColor};
		--background-activated: ${bgColor};
		--background-focused: ${bgColor};
		--color: ${textColor}`"
		size="small"
		class="w-full active:brightness-110 hover:brightness-90 hover:scale-105 transition-all duration-250"
	>
		<div class="w-full flex items-center justify-evenly">
			<UIcon
				:name="icon"
				class="mr-2 size-5"
			/>
			Sign in with {{ name }}
		</div>
	</IonButton>
</template>

<script setup lang="ts">
import type { OAuthProvider } from '@earth-app/crust/src/shared/types/user';
import { capitalizeFully } from '@earth-app/crust/src/shared/util';

const props = defineProps<{
	provider: OAuthProvider;
}>();

const name = capitalizeFully(props.provider);

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
</script>
