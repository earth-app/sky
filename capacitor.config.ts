/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/background-runner" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.earthapp.sky',
	appName: 'The Earth App',
	webDir: '.output/public',
	loggingBehavior: 'debug',
	appendUserAgent: 'The Earth App/Sky',
	backgroundColor: '#174f96',
	server: {
		androidScheme: 'https',
		iosScheme: 'https'
	},
	plugins: {
		CapacitorCookies: {
			enabled: true
		},
		CapacitorHttp: {
			enabled: true
		},
		PushNotifications: {
			presentationOptions: ['badge', 'sound', 'alert']
		},
		BackgroundRunner: {
			label: 'com.earthapp.sky.distance',
			src: 'runners/distance-tracker.js',
			event: 'distanceTick',
			repeat: true,
			interval: 15,
			autoStart: true
		},
		SplashScreen: {
			launchShowDuration: 3000,
			launchAutoHide: true,
			launchFadeOutDuration: 3000,
			backgroundColor: '#174f96ee',
			androidSplashResourceName: 'splash',
			androidScaleType: 'FIT_CENTER',
			showSpinner: true,
			splashImmersive: true,
			iosSpinnerStyle: 'small',
			androidSpinnerStyle: 'large'
		}
	}
};

export default config;
