<template>
	<IonApp>
		<IonRouterOutlet :animation="slide" />
	</IonApp>
</template>

<script setup lang="ts">
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import slide from './animations/slide';

defineCustomElements(window);
const config = useAppConfig();

useSeoMeta({
	charset: 'utf-8',
	title: config.name,
	themeColor: {
		content: config.themeColor,
		media: '(prefers-color-scheme: dark)'
	},
	mobileWebAppCapable: 'yes',
	appleMobileWebAppCapable: 'yes',
	appleMobileWebAppStatusBarStyle: 'black'
});
</script>
