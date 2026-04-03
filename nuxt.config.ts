import tailwindcss from '@tailwindcss/vite';
import { defineNuxtConfig } from 'nuxt/config';
import { dependencies, devDependencies, version } from './package.json';

export default defineNuxtConfig({
	extends: ['@earth-app/crust'],
	runtimeConfig: {
		public: {
			baseUrl:
				process.env.NUXT_PUBLIC_SITE_URL ||
				process.env.NUXT_BASE_URL ||
				process.env.NUXT_PUBLIC_CRUST_BASE_URL ||
				'https://app.earth-app.com',
			apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'https://api.earth-app.com',
			crustBaseUrl: process.env.NUXT_PUBLIC_CRUST_BASE_URL || 'https://app.earth-app.com',
			// oauth client ids
			googleClientId: process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID || '',
			microsoftClientId: process.env.NUXT_PUBLIC_MICROSOFT_CLIENT_ID || '',
			githubClientId: process.env.NUXT_PUBLIC_GITHUB_CLIENT_ID || '',
			discordClientId: process.env.NUXT_PUBLIC_DISCORD_CLIENT_ID || '',
			facebookClientId: process.env.NUXT_PUBLIC_FACEBOOK_CLIENT_ID || '',
			// public keys
			mapsApiKey: process.env.NUXT_PUBLIC_MAPS_API_KEY || ''
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		plugins: [tailwindcss() as any],
		resolve: {
			dedupe: ['@ionic/core', '@ionic/vue', '@ionic/vue-router']
		},
		build: {
			cssCodeSplit: false
		},
		server: {
			hmr: {
				host: '127.0.0.1',
				clientPort: 3001,
				protocol: 'ws'
			}
		},
		optimizeDeps: {
			exclude: ['@earth-app/crust', 'stores', 'types', 'utils', 'schemas'],
			include: [
				'@vue/devtools-core',
				'@vue/devtools-kit',
				'@ionic/vue',
				'@ionic/pwa-elements/loader',
				'@capacitor/splash-screen'
			]
		},
		define: {
			__APP_VERSION__: JSON.stringify(version),
			__DEPS__: JSON.stringify(dependencies),
			__DEV_DEPS__: JSON.stringify(devDependencies)
		}
	},
	build: {
		transpile: ['@earth-app/crust']
	},
	i18n: {
		locales: [{ code: 'en', language: 'en-US' }],
		defaultLocale: 'en'
	},
	ionic: {
		css: {
			utilities: true
		},
		config: {
			statusTap: true,
			mode: (process.env.NUXT_MODE as 'md' | 'ios') || 'md'
		}
	},
	image: {
		provider: 'none'
	},
	pinia: {
		storesDirs: ['stores', '../node_modules/@earth-app/crust/src/stores']
	},
	modules: [
		'@nuxtjs/ionic',
		'@nuxt/ui',
		'@nuxt/image',
		'@nuxtjs/i18n',
		'nuxt-viewport',
		'@pinia/nuxt',
		[
			'@nuxtjs/google-fonts',
			{
				families: {
					'Noto Sans': [400, 500, 600, 700],
					Inter: [400, 500, 600, 700],
					Roboto: [400, 500, 700],
					'Open Sans': [400, 500, 600, 700]
				},
				display: 'swap'
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
	icon: {
		serverBundle: 'local'
	},
	experimental: {
		renderJsonPayloads: true,
		payloadExtraction: true
	}
});
