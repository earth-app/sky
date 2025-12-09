import tailwindcss from '@tailwindcss/vite';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
	ssr: false,
	devtools: { enabled: process.env.NODE_ENV !== 'production' },
	srcDir: 'src',
	serverDir: 'src/server',
	css: ['~/assets/css/main.css'],
	compatibilityDate: '2025-12-09',
	nitro: {
		preset: 'static'
	},
	vite: {
		plugins: [tailwindcss()]
	},
	i18n: {
		locales: [{ code: 'en', language: 'en-US' }],
		defaultLocale: 'en'
	},
	modules: ['@nuxtjs/ionic', '@nuxt/ui', '@nuxt/image', '@nuxtjs/i18n', 'nuxt-viewport']
});
