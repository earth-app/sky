<template>
	<IonApp>
		<IonRouterOutlet :animation="slide" />
	</IonApp>
</template>

<script setup lang="ts">
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import slide from './animations/slide';

defineCustomElements(window);

useSeoMeta({
	charset: 'utf-8',
	title: SITE_NAME,
	themeColor: {
		content: THEME_COLOR,
		media: '(prefers-color-scheme: dark)'
	},
	mobileWebAppCapable: 'yes',
	appleMobileWebAppCapable: 'yes',
	appleMobileWebAppStatusBarStyle: 'black'
});
</script>
