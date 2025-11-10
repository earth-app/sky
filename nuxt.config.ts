import tailwindcss from '@tailwindcss/vite';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
	ssr: false,
	vite: {
		plugins: [tailwindcss()]
	},
	modules: ['@nuxtjs/ionic', '@nuxt/ui']
});
