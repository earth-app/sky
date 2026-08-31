import { createPinia, setActivePinia } from 'pinia';
import { useAvatarStore } from 'stores/avatar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sky reads the avatar store's failure state as product signal, not just as an error:
 * MWelcomeChecklist gates the "Generate Avatar" step on `has(url)` and MProfileEditor
 * draws the regenerate ring on `hasFailed(url)`. On a phone the profile_photo GET is the
 * request most likely to lose a cold-launch race, so a transient failure that landed in
 * that state told the user they had no photo and pinned the header to the placeholder for
 * the rest of the session. These pin the contract sky's components depend on.
 */

const PHOTO_URL = 'https://api.test/v2/users/u1/profile_photo';
const FALLBACK_128 = '/favicon.png';

const png = () =>
	({ ok: true, status: 200, blob: async () => ({ size: 68 }) }) as unknown as Response;
const status = (code: number) => ({ ok: false, status: code }) as Response;

describe('avatar store resilience (sky consumers)', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;
	let origCreateObjectURL: typeof URL.createObjectURL;

	beforeEach(() => {
		setActivePinia(createPinia());
		vi.useFakeTimers();
		fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(png());
		origCreateObjectURL = URL.createObjectURL;
		URL.createObjectURL = vi.fn(() => 'blob:sky-avatar') as any;
	});

	afterEach(() => {
		vi.useRealTimers();
		fetchSpy.mockRestore();
		URL.createObjectURL = origCreateObjectURL;
	});

	// the retry sleeps between attempts; drain timers and the microtasks the parallel sizes wait on
	const settle = async (promise: Promise<unknown>) => {
		await vi.advanceTimersByTimeAsync(2_000);
		return promise;
	};

	it.each([500, 502, 503, 408, 429])(
		'a %i does not tell the checklist the user has no photo',
		async (code) => {
			const store = useAvatarStore();
			fetchSpy.mockResolvedValue(status(code));

			await settle(store.fetchAvatarBlobs(PHOTO_URL));

			// MProfileEditor's regenerate ring
			expect(store.hasFailed(PHOTO_URL)).toBe(false);
			// the header keeps pointing at the real endpoint, so the <img> can still load it
			expect(store.safeUrl(PHOTO_URL, 'avatar128')).toBe(`${PHOTO_URL}?size=128`);
		}
	);

	it('an offline blip does not pin the header to the placeholder', async () => {
		const store = useAvatarStore();
		fetchSpy.mockRejectedValue(new Error('Load failed'));

		await settle(store.fetchAvatarBlobs(PHOTO_URL));

		expect(store.safeUrl(PHOTO_URL, 'avatar128')).not.toBe(FALLBACK_128);
		expect(store.canRetry(PHOTO_URL)).toBe(false);

		// once the window elapses the next render retries and the photo lands
		fetchSpy.mockResolvedValue(png());
		vi.advanceTimersByTime(15_000);
		expect(store.canRetry(PHOTO_URL)).toBe(true);

		await settle(store.fetchAvatarBlobs(PHOTO_URL));
		expect(store.safeUrl(PHOTO_URL, 'avatar128')).toBe('blob:sky-avatar');
		expect(store.has(PHOTO_URL)).toBe(true);
	});

	// mantle2 answers 404 for a user who never generated one; that has to keep working
	it('a 404 still means "no custom avatar" for the onboarding checklist', async () => {
		const store = useAvatarStore();
		fetchSpy.mockResolvedValue(status(404));

		await settle(store.fetchAvatarBlobs(PHOTO_URL));

		expect(store.hasFailed(PHOTO_URL)).toBe(true);
		expect(store.has(PHOTO_URL)).toBe(false);
		expect(store.safeUrl(PHOTO_URL, 'avatar128')).toBe(FALLBACK_128);
	});

	it('one bad size does not blank the sizes that loaded', async () => {
		const store = useAvatarStore();
		fetchSpy.mockImplementation(async (input: any) =>
			String(input).includes('size=128') ? status(500) : png()
		);

		await settle(store.fetchAvatarBlobs(PHOTO_URL));

		expect(store.safeUrl(PHOTO_URL, 'avatar32')).toBe('blob:sky-avatar');
		expect(store.safeUrl(PHOTO_URL, 'avatar128')).toBe(`${PHOTO_URL}?size=128`);
		expect(store.hasFailed(PHOTO_URL)).toBe(false);
	});

	it('a feed rendering the same avatar many times issues one round of requests', async () => {
		const store = useAvatarStore();

		for (let i = 0; i < 20; i++) {
			store.safeUrl(PHOTO_URL, 'avatar128');
			store.preloadAvatar(PHOTO_URL);
		}
		await settle(Promise.resolve());

		// one request per size, no matter how many cards asked
		expect(fetchSpy).toHaveBeenCalledTimes(3);
	});
});
