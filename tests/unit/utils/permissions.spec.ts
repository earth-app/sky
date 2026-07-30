import { describe, expect, it } from 'vitest';
import {
	anyGranted,
	canPrompt,
	isPermanentlyDenied,
	shouldRequest
} from '../../../src/utils/permissions';

describe('permission state helpers', () => {
	it('treats only the undecided states as promptable', () => {
		expect(canPrompt('prompt')).toBe(true);
		expect(canPrompt('prompt-with-rationale')).toBe(true);
		expect(canPrompt('granted')).toBe(false);
		expect(canPrompt('denied')).toBe(false);
	});

	it('survives the states a plugin can return outside the documented union', () => {
		for (const state of [undefined, null, '', 'limited', 'restricted', 'unknown']) {
			expect(canPrompt(state)).toBe(false);
			expect(isPermanentlyDenied(state)).toBe(false);
			expect(anyGranted(state)).toBe(false);
			// unknown is not promptable, so asking would do nothing; do not ask
			expect(shouldRequest(state)).toBe(false);
		}
	});

	it('identifies the refusal that only Settings can undo', () => {
		expect(isPermanentlyDenied('denied')).toBe(true);
		expect(isPermanentlyDenied('prompt')).toBe(false);
		expect(isPermanentlyDenied('granted')).toBe(false);
	});

	it('counts a grant on any key, since coarse location is enough', () => {
		expect(anyGranted('denied', 'granted')).toBe(true);
		expect(anyGranted('prompt', 'denied')).toBe(false);
		expect(anyGranted()).toBe(false);
	});

	describe('shouldRequest', () => {
		it('does not ask when something is already granted', () => {
			expect(shouldRequest('granted')).toBe(false);
			expect(shouldRequest('granted', 'prompt')).toBe(false);
			expect(shouldRequest('denied', 'granted')).toBe(false);
		});

		// the regression this file exists for: re-requesting a denial re-shows the OS dialog, so a
		// user who said no got asked again the moment the app resumed
		it('does not ask when every key is denied', () => {
			expect(shouldRequest('denied')).toBe(false);
			expect(shouldRequest('denied', 'denied')).toBe(false);
		});

		it('asks when any key is still undecided', () => {
			expect(shouldRequest('prompt')).toBe(true);
			expect(shouldRequest('denied', 'prompt')).toBe(true);
			expect(shouldRequest('prompt-with-rationale')).toBe(true);
		});

		it('does not ask when there is nothing to go on', () => {
			expect(shouldRequest()).toBe(false);
		});
	});
});
