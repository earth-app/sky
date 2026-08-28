// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reactive, toRaw } from 'vue';
import { reserveScrollClearance, SCROLL_CUE_CLEARANCE } from '~/utils/scrollCue';

function element(paddingBottom = '') {
	return { style: { paddingBottom } };
}

describe('reserveScrollClearance', () => {
	it('adds clearance so the fixed cue cannot sit on card text', () => {
		const el = element();
		reserveScrollClearance(el);
		expect(el.style.paddingBottom).toBe(`calc(0px + ${SCROLL_CUE_CLEARANCE})`);
	});

	it('composes with padding the container already had', () => {
		const el = element('12px');
		reserveScrollClearance(el, '2rem');
		expect(el.style.paddingBottom).toBe('calc(12px + 2rem)');
	});

	it('restores the original padding once, idempotently', () => {
		const el = element('12px');
		const release = reserveScrollClearance(el);

		release();
		expect(el.style.paddingBottom).toBe('12px');

		el.style.paddingBottom = '30px';
		release();
		expect(el.style.paddingBottom).toBe('30px');
	});

	it('writes through the raw element, never a reactive proxy', () => {
		// a ref-held IonContent scroll element arrives proxied; writing style through the proxy
		// thrashed ionic's layout badly enough to leave the dashboard blank
		const raw = element('4px');
		const proxy = reactive(raw);

		const release = reserveScrollClearance(proxy);
		expect(toRaw(proxy)).toBe(raw);
		expect(raw.style.paddingBottom).toBe(`calc(4px + ${SCROLL_CUE_CLEARANCE})`);

		release();
		expect(raw.style.paddingBottom).toBe('4px');
	});

	it('is a no-op when the scroll container has not resolved yet', () => {
		expect(() => reserveScrollClearance(null)()).not.toThrow();
		expect(() => reserveScrollClearance(undefined)()).not.toThrow();
	});
});
