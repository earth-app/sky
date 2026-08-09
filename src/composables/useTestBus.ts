import { isNativeTestBuild } from '~/composables/useSettings';

export function emitTestEvent(name: string, data?: unknown): void {
	if (!isNativeTestBuild()) return;
	try {
		const base = useRuntimeConfig().public.apiBaseUrl;
		if (!base) return;
		// keepalive so a breadcrumb emitted during teardown still lands
		void fetch(`${base}/__test__/event`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, data: data ?? null }),
			keepalive: true
		}).catch(() => {});
	} catch {
		// never let instrumentation break a real boot
	}
}
