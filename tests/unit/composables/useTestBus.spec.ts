import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitTestEvent } from '../../../src/composables/useTestBus';

describe('emitTestEvent', () => {
	beforeEach(() => {
		const cfg = useRuntimeConfig();
		cfg.public.nativeTest = false;
		cfg.public.apiBaseUrl = 'http://127.0.0.1:8788';
		vi.restoreAllMocks();
	});

	// the guarantee that matters: a shipped build must never post instrumentation anywhere
	it('is inert outside a native test build', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		emitTestEvent('boot.resolved');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('posts the named breadcrumb when the native test flag is on', () => {
		const cfg = useRuntimeConfig();
		cfg.public.nativeTest = true;
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

		emitTestEvent('deeplink.resolved', { target: '/tabs/articles/a1' });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toBe('http://127.0.0.1:8788/__test__/event');
		expect(JSON.parse(String((init as RequestInit).body))).toEqual({
			name: 'deeplink.resolved',
			data: { target: '/tabs/articles/a1' }
		});
	});

	it('nulls absent data rather than sending undefined', () => {
		const cfg = useRuntimeConfig();
		cfg.public.nativeTest = true;
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

		emitTestEvent('boot.resolved');

		expect(JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body)).data).toBeNull();
	});

	// instrumentation must never be able to break a real boot
	it('swallows a rejected post', () => {
		const cfg = useRuntimeConfig();
		cfg.public.nativeTest = true;
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no bus listening'));
		expect(() => emitTestEvent('boot.resolved')).not.toThrow();
	});

	it('does nothing when no api base url is configured', () => {
		const cfg = useRuntimeConfig();
		cfg.public.nativeTest = true;
		cfg.public.apiBaseUrl = '';
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		emitTestEvent('boot.resolved');
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
