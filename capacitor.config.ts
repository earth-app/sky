/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.earthapp.sky',
	appName: 'The Earth App',
	webDir: 'dist',
	loggingBehavior: 'debug',
	overrideUserAgent: 'The Earth App/Sky',
	backgroundColor: '#174f96',
	plugins: {
		SplashScreen: {
			launchShowDuration: 3000,
			launchAutoHide: true,
			launchFadeOutDuration: 3000,
			backgroundColor: '#174f96ee',
			androidSplashResourceName: 'splash',
			androidScaleType: 'CENTER_CROP',
			showSpinner: true,
			iosSpinnerStyle: 'small',
			androidSpinnerStyle: 'large'
		}
	}
};

export default config;
