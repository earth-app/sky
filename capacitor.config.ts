import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.earth-app.sky',
	appName: 'The Earth App',
	webDir: 'dist',
	loggingBehavior: 'debug',
	plugins: {
		LiveUpdate: {
			appId: '00000000-0000-0000-0000-000000000000'
		}
	}
};

export default config;
