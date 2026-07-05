import { defineNuxtPlugin, useRouter } from '#imports';
import { attachAppLifecycle, logError, logInfo } from '~/composables/useLogger';

// pull message/name/stack out of anything thrown (errors serialize to {} otherwise)
function describeError(err: unknown): Record<string, unknown> {
	const e = err as any;
	if (e instanceof Error || (e && typeof e === 'object')) {
		return {
			name: e?.name,
			message: e?.message ?? (typeof e === 'object' ? undefined : String(e)),
			stack: typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 6).join(' | ') : undefined,
			keys: e && typeof e === 'object' ? Object.keys(e).slice(0, 12) : undefined
		};
	}
	return { message: String(err) };
}

// client-only so we never log SSR work twice or pull capacitor in on the server
export default defineNuxtPlugin((nuxtApp) => {
	if (!import.meta.client) return;

	logInfo('app.start', 'logger ready', { ts: Date.now() });

	// vue render/setup errors are swallowed by vue and only console.error'd as {}; capture the real one
	nuxtApp.vueApp.config.errorHandler = (err, _instance, info) => {
		logError('vue.error', (err as any)?.message || 'vue error', { info, ...describeError(err) });
	};
	nuxtApp.hook('vue:error', (err, _instance, info) => {
		logError('vue.error.hook', (err as any)?.message || 'vue error', {
			info,
			...describeError(err)
		});
	});

	const router = useRouter();
	router.afterEach((to, from) => {
		logInfo('nav', 'route change', {
			to: to.fullPath,
			from: from.fullPath,
			name: typeof to.name === 'string' ? to.name : undefined
		});
	});

	// uncaught errors and rejections; keep meta minimal to avoid leaking payloads
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
