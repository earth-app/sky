import tailwindcss from '@tailwindcss/vite';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
	extends: ['@earth-app/crust'],
	runtimeConfig: {
		public: {
			apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'https://api.earth-app.com',
			crustBaseUrl: process.env.NUXT_PUBLIC_CRUST_BASE_URL || 'https://app.earth-app.com'
		}
	},
	ssr: false,
	// Disable devtools in production to reduce client bundle size and overhead
	devtools: { enabled: process.env.NODE_ENV !== 'production' },
	srcDir: 'src',
	serverDir: 'src/server',
	css: ['~/assets/css/main.css'],
	// Add global head optimizations (preconnect + dns-prefetch) for critical external domains
	app: {
		head: {
			link: [
				{ rel: 'preconnect', href: 'https://cdn.earth-app.com' },
				{ rel: 'dns-prefetch', href: 'https://cdn.earth-app.com' },
				{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
				{ rel: 'dns-prefetch', href: 'https://fonts.googleapis.com' },
				{ rel: 'preconnect', href: 'https://app.earth-app.com' },
				{ rel: 'dns-prefetch', href: 'https://app.earth-app.com', crossorigin: 'use-credentials' },
				{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
				{ rel: 'dns-prefetch', href: 'https://fonts.gstatic.com' },
				{ rel: 'preconnect', href: 'https://www.youtube.com' },
				{ rel: 'dns-prefetch', href: 'https://www.youtube.com' },
				{ rel: 'preconnect', href: 'https://api.earth-app.com' },
				{ rel: 'dns-prefetch', href: 'https://api.earth-app.com', crossorigin: 'use-credentials' }
			]
		}
	},
	compatibilityDate: '2025-12-09',
	nitro: {
		preset: 'static',
		routeRules: {
			'/**': {
				cors: true,
				headers: { 'Access-Control-Allow-Origin': '*', 'Referrer-Policy': 'no-referrer' }
			}
		}
	},
	vite: {
		plugins: [tailwindcss()]
	},
	i18n: {
		locales: [{ code: 'en', language: 'en-US' }],
		defaultLocale: 'en'
	},
	ionic: {
		config: {
			statusTap: true
		}
	},
	modules: [
		'@nuxtjs/ionic',
		'@nuxt/ui',
		'@nuxt/image',
		'@nuxtjs/i18n',
		'nuxt-viewport',
		[
			'@nuxtjs/google-fonts',
			{
				families: {
					'Noto+Sans': true
				}
			}
		],
		[
			'@nuxt/icon',
			{
				icon: {
					mode: 'css',
					cssLayer: 'base',
					size: '48px'
				}
			}
		]
	],
	experimental: {
		renderJsonPayloads: true
	}
});
