import { defineNuxtPlugin, useRouter } from '#imports';
import { attachAppLifecycle, logError, logInfo } from '~/composables/useLogger';

// client-only so we never log SSR work twice or pull capacitor in on the server
export default defineNuxtPlugin(() => {
	if (!import.meta.client) return;

	logInfo('app.start', 'logger ready', { ts: Date.now() });

	const router = useRouter();
	router.afterEach((to, from) => {
		logInfo('nav', 'route change', {
			to: to.fullPath,
			from: from.fullPath,
			name: typeof to.name === 'string' ? to.name : undefined
		});
	});

	// uncaught errors and rejections — keep meta minimal to avoid leaking payloads
	window.addEventListener('error', (event) => {
		logError('window.error', event.message || 'unknown error', {
			filename: event.filename,
			lineno: event.lineno,
			colno: event.colno
		});
	});

	window.addEventListener('unhandledrejection', (event) => {
		const reason = event.reason;
		const message =
			reason instanceof Error
				? reason.message
				: typeof reason === 'string'
					? reason
					: 'unhandled rejection';
		logError('window.unhandledrejection', message, {
			name: reason instanceof Error ? reason.name : undefined
		});
	});

	void attachAppLifecycle();
});
