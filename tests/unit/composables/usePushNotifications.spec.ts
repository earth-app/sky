import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
	isNative: vi.fn(() => true),
	platform: vi.fn(() => 'ios')
}));

const pn = vi.hoisted(() => ({
	checkPermissions: vi.fn(),
	requestPermissions: vi.fn(),
	register: vi.fn(),
	addListener: vi.fn()
}));

const appPlugin = vi.hoisted(() => ({ addListener: vi.fn() }));
const browser = vi.hoisted(() => ({ open: vi.fn() }));
const prefs = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
const fetchMock = vi.hoisted(() => vi.fn());
const navigateToMock = vi.hoisted(() => vi.fn());
const addLiveNotification = vi.hoisted(() => vi.fn());
const forwardToWatch = vi.hoisted(() => vi.fn());
const authRef = vi.hoisted(() => ({
	store: null as null | { sessionToken: string | null; currentUser: { id: string } | null }
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: cap.isNative, getPlatform: cap.platform }
}));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: pn }));
vi.mock('@capacitor/app', () => ({ App: appPlugin }));
vi.mock('@capacitor/browser', () => ({ Browser: browser }));
vi.mock('@capacitor/preferences', () => ({ Preferences: prefs }));
vi.mock('#build/fetch.mjs', () => ({ $fetch: fetchMock }));
vi.mock('#app/composables/router', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	navigateTo: navigateToMock
}));
vi.mock('~/composables/useWatchNotifications', () => ({
	useWatchNotifications: () => ({ forward: forwardToWatch }),
	initWatchNotificationBridge: () => () => {}
}));
vi.mock('@earth-app/crust/src/composables/useUser', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useNotifications: () => ({ addLiveNotification })
}));

// a plain reactive stand-in keeps `watch(() => store.sessionToken)` real without booting pinia
// inside a module registry that gets reset between cases
vi.mock('@earth-app/crust/src/stores/auth', async () => {
	const { reactive } = await import('vue');
	const store = reactive({
		sessionToken: null as string | null,
		currentUser: null as { id: string } | null
	});
	authRef.store = store;
	return { useAuthStore: () => store };
});

const PUSH_PATH = '/v2/users/current/notifications/push';
const TOKEN_CACHE_KEY = 'push:token-v1';

type Handle = { remove: () => Promise<void> };

const teardowns: Array<() => Promise<void>> = [];

/** Reloads the composable so its module-level token/dedupe state starts clean each case. */
async function load() {
	vi.resetModules();
	const vue = await import('vue');
	const mod = await import('~/composables/usePushNotifications');
	// every init leaves live watchers on the shared auth stand-in; record them so one case
	// cannot keep uploading during the next
	const initPushNotifications = async () => {
		const teardown = await mod.initPushNotifications();
		teardowns.push(teardown);
		return teardown;
	};
	return { initPushNotifications, nextTick: vue.nextTick };
}

function handlerFor(event: string): (payload: never) => unknown {
	const call = pn.addListener.mock.calls.find((c) => c[0] === event);
	if (!call) throw new Error(`no listener registered for ${event}`);
	return call[1] as (payload: never) => unknown;
}

function appStateHandler(): (payload: { isActive: boolean }) => unknown {
	const call = appPlugin.addListener.mock.calls.find((c) => c[0] === 'appStateChange');
	if (!call) throw new Error('no appStateChange listener registered');
	return call[1] as (payload: { isActive: boolean }) => unknown;
}

function uploadCalls() {
	return fetchMock.mock.calls.filter((c) => String(c[0]).endsWith(PUSH_PATH));
}

beforeEach(() => {
	vi.clearAllMocks();
	if (authRef.store) {
		authRef.store.sessionToken = null;
		authRef.store.currentUser = null;
	}
	cap.isNative.mockReturnValue(true);
	cap.platform.mockReturnValue('ios');
	pn.checkPermissions.mockResolvedValue({ receive: 'granted' });
	pn.requestPermissions.mockResolvedValue({ receive: 'granted' });
	pn.register.mockResolvedValue(undefined);
	pn.addListener.mockImplementation(async () => ({ remove: vi.fn(async () => {}) }) as Handle);
	appPlugin.addListener.mockImplementation(
		async () => ({ remove: vi.fn(async () => {}) }) as Handle
	);
	browser.open.mockResolvedValue(undefined);
	prefs.get.mockResolvedValue({ value: null });
	prefs.set.mockResolvedValue(undefined);
	fetchMock.mockResolvedValue({});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
	while (teardowns.length) await teardowns.pop()!();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('platform gating', () => {
	it('registers nothing off-native and still hands back a teardown', async () => {
		cap.isNative.mockReturnValue(false);
		const { initPushNotifications } = await load();
		const teardown = await initPushNotifications();
		expect(pn.addListener).not.toHaveBeenCalled();
		expect(pn.register).not.toHaveBeenCalled();
		await expect(teardown()).resolves.toBeUndefined();
	});

	it('registers nothing on an unsupported native platform', async () => {
		cap.platform.mockReturnValue('electron');
		const { initPushNotifications } = await load();
		await initPushNotifications();
		expect(pn.addListener).not.toHaveBeenCalled();
		expect(pn.register).not.toHaveBeenCalled();
	});
});

describe('listener-before-register ordering', () => {
	it('attaches every push listener before calling register()', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();

		const events = pn.addListener.mock.calls.map((c) => c[0]);
		expect(events).toEqual([
			'registration',
			'registrationError',
			'pushNotificationReceived',
			'pushNotificationActionPerformed'
		]);

		// register() fires `registration` as soon as the OS has a token; a listener attached
		// afterwards silently misses it and the device never gets a push token row
		const lastListenerAt = Math.max(...pn.addListener.mock.invocationCallOrder);
		expect(lastListenerAt).toBeLessThan(pn.register.mock.invocationCallOrder[0]!);
	});
});

describe('registration permission flow', () => {
	it('registers straight away when receive is already granted', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		expect(pn.requestPermissions).not.toHaveBeenCalled();
		expect(pn.register).toHaveBeenCalledOnce();
	});

	it('never re-prompts a refusal and never registers', async () => {
		pn.checkPermissions.mockResolvedValue({ receive: 'denied' });
		const { initPushNotifications } = await load();
		await initPushNotifications();
		expect(pn.requestPermissions).not.toHaveBeenCalled();
		expect(pn.register).not.toHaveBeenCalled();
	});

	it('requests when undecided and only registers on a grant', async () => {
		pn.checkPermissions.mockResolvedValue({ receive: 'prompt' });
		pn.requestPermissions.mockResolvedValue({ receive: 'denied' });
		const denied = await load();
		await denied.initPushNotifications();
		expect(pn.requestPermissions).toHaveBeenCalledOnce();
		expect(pn.register).not.toHaveBeenCalled();

		vi.clearAllMocks();
		pn.checkPermissions.mockResolvedValue({ receive: 'prompt' });
		pn.requestPermissions.mockResolvedValue({ receive: 'granted' });
		pn.addListener.mockImplementation(async () => ({ remove: vi.fn(async () => {}) }) as Handle);
		appPlugin.addListener.mockImplementation(
			async () => ({ remove: vi.fn(async () => {}) }) as Handle
		);
		prefs.get.mockResolvedValue({ value: null });
		const granted = await load();
		await granted.initPushNotifications();
		expect(pn.register).toHaveBeenCalledOnce();
	});
});

describe('token upload', () => {
	it('persists the token and posts it to mantle2 with the bearer session', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';
		authRef.store!.currentUser = { id: 'u1' };

		await handlerFor('registration')({ value: 'dev-token' } as never);

		expect(prefs.set).toHaveBeenCalledWith({
			key: TOKEN_CACHE_KEY,
			value: JSON.stringify({ token: 'dev-token', platform: 'ios' })
		});

		const calls = uploadCalls();
		expect(calls).toHaveLength(1);
		const [url, options] = calls[0]!;
		expect(new URL(String(url)).pathname).toBe(PUSH_PATH);
		expect(options).toMatchObject({
			method: 'POST',
			body: { token: 'dev-token', platform: 'ios' },
			headers: { Authorization: 'Bearer sess-1' }
		});
	});

	it('does not post while logged out', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();

		await handlerFor('registration')({ value: 'dev-token' } as never);
		expect(uploadCalls()).toHaveLength(0);
		// the token is still cached so the next login can push it up
		expect(prefs.set).toHaveBeenCalled();
	});

	it('uploads a previously cached token as soon as a session appears', async () => {
		prefs.get.mockResolvedValue({
			value: JSON.stringify({ token: 'cached-token', platform: 'ios' })
		});
		const { initPushNotifications, nextTick } = await load();
		await initPushNotifications();
		expect(uploadCalls()).toHaveLength(0);

		authRef.store!.sessionToken = 'sess-1';
		await nextTick();
		await vi.waitFor(() => expect(uploadCalls()).toHaveLength(1));
		expect(uploadCalls()[0]![1]).toMatchObject({ body: { token: 'cached-token' } });
	});

	it('ignores a corrupt cache entry rather than uploading garbage', async () => {
		prefs.get.mockResolvedValue({ value: '{not json' });
		const { initPushNotifications, nextTick } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';
		await nextTick();
		await nextTick();
		expect(uploadCalls()).toHaveLength(0);
		// no cached token means the session watch kicks the OS instead
		expect(pn.register.mock.calls.length).toBeGreaterThanOrEqual(1);
	});

	it('dedupes an identical upload inside the 60s window', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';
		authRef.store!.currentUser = { id: 'u1' };

		await handlerFor('registration')({ value: 'dev-token' } as never);
		await handlerFor('registration')({ value: 'dev-token' } as never);
		expect(uploadCalls()).toHaveLength(1);
	});

	it('re-uploads once the real user id replaces the pending placeholder', async () => {
		const { initPushNotifications, nextTick } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';
		await nextTick();

		await handlerFor('registration')({ value: 'dev-token' } as never);
		expect(uploadCalls()).toHaveLength(1);

		authRef.store!.currentUser = { id: 'u1' };
		await nextTick();
		await vi.waitFor(() => expect(uploadCalls()).toHaveLength(2));
	});

	it('re-uploads after a logout -> re-login even for the same token', async () => {
		const { initPushNotifications, nextTick } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';
		authRef.store!.currentUser = { id: 'u1' };
		await handlerFor('registration')({ value: 'dev-token' } as never);
		expect(uploadCalls()).toHaveLength(1);

		// mantle2 drops the push_tokens row on logout, so the dedupe key must not survive it
		authRef.store!.sessionToken = null;
		await nextTick();
		authRef.store!.sessionToken = 'sess-2';
		await nextTick();
		await vi.waitFor(() => expect(uploadCalls()).toHaveLength(2));
		expect(uploadCalls()[1]![1]).toMatchObject({ headers: { Authorization: 'Bearer sess-2' } });
	});
});

describe('upload retries', () => {
	it('retries a 5xx on the documented backoff and succeeds', async () => {
		vi.useFakeTimers();
		const { initPushNotifications } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';

		fetchMock.mockRejectedValueOnce({ status: 503 }).mockResolvedValue({});
		const pending = handlerFor('registration')({ value: 'dev-token' } as never) as Promise<void>;

		await vi.advanceTimersByTimeAsync(2_000);
		await pending;
		expect(uploadCalls()).toHaveLength(2);
	});

	it('gives up immediately on a non-transient 4xx', async () => {
		vi.useFakeTimers();
		const { initPushNotifications } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';

		fetchMock.mockRejectedValue({ status: 400 });
		const pending = handlerFor('registration')({ value: 'dev-token' } as never) as Promise<void>;

		await vi.advanceTimersByTimeAsync(60_000);
		await pending;
		expect(uploadCalls()).toHaveLength(1);
	});

	it('treats a status-less network error as transient and exhausts the backoff', async () => {
		vi.useFakeTimers();
		const { initPushNotifications } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';

		fetchMock.mockRejectedValue(new Error('Network request failed'));
		const pending = handlerFor('registration')({ value: 'dev-token' } as never) as Promise<void>;

		await vi.advanceTimersByTimeAsync(2_000 + 8_000 + 30_000);
		await pending;
		expect(uploadCalls()).toHaveLength(4);
	});

	it('stops retrying the moment the session is gone', async () => {
		vi.useFakeTimers();
		const { initPushNotifications } = await load();
		await initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';

		fetchMock.mockRejectedValue({ status: 500 });
		const pending = handlerFor('registration')({ value: 'dev-token' } as never) as Promise<void>;

		// let the first attempt run and fail, then log out before the backoff wakes up
		await vi.advanceTimersByTimeAsync(0);
		expect(uploadCalls()).toHaveLength(1);
		authRef.store!.sessionToken = null;

		await vi.advanceTimersByTimeAsync(60_000);
		await pending;
		expect(uploadCalls()).toHaveLength(1);
	});
});

describe('incoming notifications', () => {
	async function setup() {
		const loaded = await load();
		await loaded.initPushNotifications();
		authRef.store!.sessionToken = 'sess-1';
		authRef.store!.currentUser = { id: 'u1' };
		return loaded;
	}

	it('mirrors a received push into the in-app list and forwards it to the watch', async () => {
		await setup();
		handlerFor('pushNotificationReceived')({
			title: 'Quest Ready',
			body: 'Step unlocked',
			data: { id: 'n1', type: 'success', link: '/tabs/quests/q1', source: 'quests' }
		} as never);

		expect(addLiveNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'n1',
				user_id: 'u1',
				title: 'Quest Ready',
				message: 'Step unlocked',
				link: '/tabs/quests/q1',
				type: 'success',
				source: 'quests',
				read: false
			})
		);
		expect(forwardToWatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
	});

	it('falls back to type "info" and source "system" for unknown values', async () => {
		await setup();
		handlerFor('pushNotificationReceived')({ data: { id: 'n2', type: 'catastrophe' } } as never);
		expect(addLiveNotification).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'info', source: 'system', title: '', message: '' })
		);
	});

	it('drops a push with no id, or one that arrives before the user is known', async () => {
		await setup();
		handlerFor('pushNotificationReceived')({ data: {} } as never);
		expect(addLiveNotification).not.toHaveBeenCalled();

		authRef.store!.currentUser = null;
		handlerFor('pushNotificationReceived')({ data: { id: 'n3' } } as never);
		expect(addLiveNotification).not.toHaveBeenCalled();
	});
});

describe('notification taps', () => {
	it('routes an earth-app:// deep link into the tab shell', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		handlerFor('pushNotificationActionPerformed')({
			notification: { data: { link: 'earth-app://quests/q1' } }
		} as never);
		expect(navigateToMock).toHaveBeenCalledWith('/tabs/quests/q1');
		expect(browser.open).not.toHaveBeenCalled();
	});

	it('opens an external link in the system browser instead of the webview', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		handlerFor('pushNotificationActionPerformed')({
			notification: { data: { link: 'https://earth-app.com/blog' } }
		} as never);
		expect(browser.open).toHaveBeenCalledWith({ url: 'https://earth-app.com/blog' });
		expect(navigateToMock).not.toHaveBeenCalled();
	});

	it('falls back to the notification detail route when only an id is present', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		handlerFor('pushNotificationActionPerformed')({
			notification: { data: { id: 'n9' } }
		} as never);
		expect(navigateToMock).toHaveBeenCalledWith('/tabs/profile/notifications/n9');
	});

	it('does nothing for a payload with neither link nor id', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		handlerFor('pushNotificationActionPerformed')({ notification: { data: {} } } as never);
		expect(navigateToMock).not.toHaveBeenCalled();
		expect(browser.open).not.toHaveBeenCalled();
	});
});

describe('resume behaviour', () => {
	async function bootWithCachedToken() {
		prefs.get.mockResolvedValue({
			value: JSON.stringify({ token: 'cached-token', platform: 'ios' })
		});
		vi.useFakeTimers();
		const loaded = await load();
		authRef.store!.sessionToken = 'sess-1';
		await loaded.initPushNotifications();
		// the init-time fallback sync already ran
		expect(uploadCalls()).toHaveLength(1);
		return loaded;
	}

	it('re-syncs the cached token on foreground but throttles a rapid second resume', async () => {
		await bootWithCachedToken();
		const onState = appStateHandler();

		// past both the upload dedupe and the resume throttle
		await vi.advanceTimersByTimeAsync(61_000);
		await onState({ isActive: true });
		expect(uploadCalls()).toHaveLength(2);

		await onState({ isActive: true });
		expect(uploadCalls()).toHaveLength(2);
	});

	it('re-registers on resume only after the 4h TTL', async () => {
		await bootWithCachedToken();
		const onState = appStateHandler();
		pn.register.mockClear();

		await onState({ isActive: true });
		expect(pn.register).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(60_000);
		await onState({ isActive: true });
		expect(pn.register).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
		await onState({ isActive: true });
		expect(pn.register).toHaveBeenCalledTimes(2);
	});

	it('ignores a background transition', async () => {
		await bootWithCachedToken();
		pn.register.mockClear();
		await vi.advanceTimersByTimeAsync(61_000);

		await appStateHandler()({ isActive: false });
		expect(uploadCalls()).toHaveLength(1);
		expect(pn.register).not.toHaveBeenCalled();
	});
});

describe('teardown', () => {
	it('removes every plugin listener it attached', async () => {
		const removes: Array<() => Promise<void>> = [];
		const makeHandle = () => {
			const remove = vi.fn(async () => {});
			removes.push(remove);
			return { remove } as Handle;
		};
		pn.addListener.mockImplementation(async () => makeHandle());
		appPlugin.addListener.mockImplementation(async () => makeHandle());

		const { initPushNotifications } = await load();
		const teardown = await initPushNotifications();
		expect(removes).toHaveLength(5);

		await teardown();
		for (const remove of removes) expect(remove).toHaveBeenCalledOnce();
	});

	it('tears the previous registration down when init runs twice', async () => {
		const { initPushNotifications } = await load();
		await initPushNotifications();
		const firstListenerCount = pn.addListener.mock.calls.length;

		await initPushNotifications();
		// the second init replaces rather than stacks listeners
		expect(pn.addListener.mock.calls.length).toBe(firstListenerCount * 2);
	});

	it('stops the session watch so a later login does not re-upload', async () => {
		const { initPushNotifications, nextTick } = await load();
		const teardown = await initPushNotifications();
		await teardown();

		authRef.store!.sessionToken = 'sess-1';
		await nextTick();
		await nextTick();
		expect(uploadCalls()).toHaveLength(0);
	});
});
