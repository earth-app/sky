import { describe, expect, it, vi } from 'vitest';
import { navigateUntilLanded } from '~/utils/navigation';

const noSleep = () => Promise.resolve();

describe('navigateUntilLanded', () => {
	it('does not navigate when the caller is already there', async () => {
		const navigate = vi.fn(async () => undefined);

		const landed = await navigateUntilLanded({ navigate, landed: () => true, sleep: noSleep });

		expect(landed).toBe(true);
		expect(navigate).not.toHaveBeenCalled();
	});

	it('lands on the first attempt when the push commits', async () => {
		let path = '/';
		const navigate = vi.fn(async () => {
			path = '/tabs/dashboard';
		});

		const landed = await navigateUntilLanded({
			navigate,
			landed: () => path.startsWith('/tabs'),
			sleep: noSleep
		});

		expect(landed).toBe(true);
		expect(navigate).toHaveBeenCalledTimes(1);
	});

	// the regression this exists for: vue-router RESOLVES with a NavigationFailure, so the first
	// attempt looks successful to `await` while the app never left the route
	it('retries when a push resolves without navigating', async () => {
		let path = '/';
		const navigate = vi.fn(async () => {
			// first attempt is silently dropped, exactly like an aborted/cancelled navigation
			if (navigate.mock.calls.length > 1) path = '/tabs/dashboard';
			return { type: 8, from: {}, to: {} };
		});

		const landed = await navigateUntilLanded({
			navigate,
			landed: () => path.startsWith('/tabs'),
			sleep: noSleep
		});

		expect(landed).toBe(true);
		expect(navigate).toHaveBeenCalledTimes(2);
		expect(path).toBe('/tabs/dashboard');
	});

	it('reports not-landed after exhausting attempts so the caller can release its guard', async () => {
		const navigate = vi.fn(async () => ({ type: 4 }));

		const landed = await navigateUntilLanded({
			navigate,
			landed: () => false,
			attempts: 3,
			sleep: noSleep
		});

		expect(landed).toBe(false);
		expect(navigate).toHaveBeenCalledTimes(3);
	});

	it('keeps retrying after a thrown error and surfaces it', async () => {
		let path = '/';
		const onError = vi.fn();
		const navigate = vi.fn(async () => {
			if (navigate.mock.calls.length === 1) throw new Error('chunk load failed');
			path = '/tabs/dashboard';
		});

		const landed = await navigateUntilLanded({
			navigate,
			landed: () => path.startsWith('/tabs'),
			sleep: noSleep,
			onError
		});

		expect(landed).toBe(true);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0]?.[1]).toBe(1);
	});

	it('waits between attempts rather than spinning', async () => {
		const sleep = vi.fn(() => Promise.resolve());
		const navigate = vi.fn(async () => undefined);

		await navigateUntilLanded({
			navigate,
			landed: () => false,
			attempts: 3,
			retryMs: 150,
			sleep
		});

		// one gap between each pair of attempts, never a trailing wait after the last
		expect(sleep).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(150);
	});

	it('always attempts at least once even if asked for none', async () => {
		const navigate = vi.fn(async () => undefined);

		await navigateUntilLanded({ navigate, landed: () => false, attempts: 0, sleep: noSleep });

		expect(navigate).toHaveBeenCalledTimes(1);
	});
});
