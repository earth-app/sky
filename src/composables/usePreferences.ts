import { Dialog } from '@capacitor/dialog';
import { Preferences } from '@capacitor/preferences';

export function usePreferences() {
	const settings = reactive(new Map<string, string>());

	const get = async (key: string) => {
		if (settings.has(key)) {
			return settings.get(key) || '';
		}

		const value = await Preferences.get({ key }).then((result) => result.value || '');
		settings.set(key, value);
		return value;
	};

	const set = async (key: string, value: string) => {
		await Preferences.set({ key, value });
		settings.set(key, value);
	};

	const remove = async (key: string) => {
		await Preferences.remove({ key });
		settings.delete(key);
	};

	return {
		settings,
		get,
		set,
		remove
	};
}

const DEBOUNCE_MS = 600;
const PREF_PREFIX = 'mformdraft';

export interface UseMFormDraftOptions {
	kind: 'article' | 'prompt' | 'event';
	userId?: MaybeRefOrGetter<string | null | undefined>;
	scope?: string;
}

export function useMFormDraft<T extends object>(state: T, opts: UseMFormDraftOptions) {
	const prefKey = computed(() => {
		const uid = opts.userId !== undefined ? toValue(opts.userId) : null;
		const userSegment = uid ? `:user:${uid}` : '';
		const scopeSegment = opts.scope ? `:${opts.scope}` : '';
		return `${PREF_PREFIX}:${opts.kind}${userSegment}${scopeSegment}`;
	});

	const draft = useFormDraft(state, opts);

	if (import.meta.client) {
		onMounted(async () => {
			try {
				const lsKey = `earth-app:draft:${opts.kind}${
					opts.userId !== undefined && toValue(opts.userId) ? `:user:${toValue(opts.userId)}` : ''
				}${opts.scope ? `:${opts.scope}` : ''}`;
				if (window.localStorage.getItem(lsKey)) return;
				const { value } = await Preferences.get({ key: prefKey.value });
				if (value) window.localStorage.setItem(lsKey, value);
			} catch {
				// best-effort
			}
		});

		let debounce: ReturnType<typeof setTimeout> | null = null;
		const stop = watch(
			() => JSON.stringify(state),
			(serialized) => {
				if (debounce) clearTimeout(debounce);
				debounce = setTimeout(() => {
					void Preferences.set({ key: prefKey.value, value: serialized }).catch(() => {});
				}, DEBOUNCE_MS);
			}
		);

		onBeforeUnmount(() => {
			if (debounce) clearTimeout(debounce);
			stop();
		});
	}

	return {
		...draft,
		clear: async () => {
			draft.clear();
			try {
				await Preferences.remove({ key: prefKey.value });
			} catch {
				// best-effort
			}
		}
	};
}

// permissions priming

type PermKind = 'camera' | 'location' | 'record' | 'motion' | 'mic';

const COPY: Record<PermKind, { title: string; message: string }> = {
	camera: {
		title: 'Camera Access',
		message:
			'This quest step needs your camera to capture proof of your activity. Tap Continue, then Allow when iOS/Android asks.'
	},
	location: {
		title: 'Location Access',
		message:
			"We use your location to verify quest progress and tag where you completed each step. Tap Continue, then choose 'Allow While Using App'."
	},
	record: {
		title: 'Microphone Access',
		message:
			'This step records a short voice clip. Tap Continue, then Allow when prompted. We never listen in the background.'
	},
	mic: {
		title: 'Microphone Access',
		message:
			'Dictation needs the microphone to hear what you say. Tap Continue, then Allow when iOS asks.'
	},
	motion: {
		title: 'Motion & Fitness',
		message:
			'This quest tracks your steps and distance to validate completion. Tap Continue, then Allow when prompted.'
	}
};

export async function primePermission(kind: PermKind): Promise<boolean> {
	const copy = COPY[kind];
	try {
		const { value } = await Dialog.confirm({
			title: copy.title,
			message: copy.message,
			okButtonTitle: 'Continue',
			cancelButtonTitle: 'Not Now'
		});
		return Boolean(value);
	} catch {
		// dialog plugin unavailable (web dev) — proceed straight to the real prompt
		return true;
	}
}

// offline storage queue

const STORAGE_KEY = 'sky:offline-mutation-queue-v1';
const MAX_ATTEMPTS = 5;

export type MMutationKind =
	| 'mark-read'
	| 'mark-all-read'
	| 'dismiss-onboarding'
	| 'mark-notification-delete';

export interface QueuedMMutation {
	id: string;
	kind: MMutationKind;
	payload?: Record<string, unknown>;
	attempts: number;
	enqueuedAt: number;
}

type Dispatcher = (m: QueuedMMutation) => Promise<boolean>;

const dispatchers = new Map<MMutationKind, Dispatcher>();
export const pendingMMutations = ref<QueuedMMutation[]>([]);
let initialized = false;
let replaying = false;

async function persistQueue() {
	try {
		await Preferences.set({
			key: STORAGE_KEY,
			value: JSON.stringify(pendingMMutations.value)
		});
	} catch {
		// best-effort — the in-memory queue still replays this session
	}
}

async function loadQueue(): Promise<QueuedMMutation[]> {
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (!value) return [];
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function enqueue(kind: MMutationKind, payload?: Record<string, unknown>) {
	const entry: QueuedMMutation = {
		id: `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
		kind,
		payload,
		attempts: 0,
		enqueuedAt: Date.now()
	};
	pendingMMutations.value = [...pendingMMutations.value, entry];
	void persistQueue();
}

function remove(id: string) {
	pendingMMutations.value = pendingMMutations.value.filter((m) => m.id !== id);
	void persistQueue();
}

export function registerMMutationDispatcher(kind: MMutationKind, fn: Dispatcher) {
	dispatchers.set(kind, fn);
}

export async function replayPendingMMutations() {
	if (replaying) return;
	// caller (network watcher) gates on isOffline; we just guard double-entry
	if (pendingMMutations.value.length === 0) return;
	replaying = true;
	try {
		const snapshot = [...pendingMMutations.value];
		for (const entry of snapshot) {
			const dispatcher = dispatchers.get(entry.kind);
			if (!dispatcher) continue;
			try {
				const ok = await dispatcher(entry);
				if (ok) {
					remove(entry.id);
				} else {
					entry.attempts += 1;
					if (entry.attempts >= MAX_ATTEMPTS) remove(entry.id);
					else void persistQueue();
				}
			} catch {
				entry.attempts += 1;
				if (entry.attempts >= MAX_ATTEMPTS) remove(entry.id);
				else void persistQueue();
			}
		}
	} finally {
		replaying = false;
	}
}

export async function runOrQueueM<T>(
	kind: MMutationKind,
	payload: Record<string, unknown> | undefined,
	executor: () => Promise<T>
): Promise<{ executed: boolean; queued: boolean; result?: T }> {
	if (isOffline.value) {
		enqueue(kind, payload);
		return { executed: false, queued: true };
	}
	try {
		const result = await executor();
		return { executed: true, queued: false, result };
	} catch (e: unknown) {
		const err = e as { message?: string; name?: string; code?: string; statusCode?: number };
		const msg = String(err?.message || err?.name || '').toLowerCase();
		const looksLikeNetwork =
			msg.includes('network') ||
			msg.includes('fetch') ||
			msg.includes('failed to fetch') ||
			err?.code === 'ECONNREFUSED' ||
			err?.statusCode === 0;
		if (looksLikeNetwork) {
			enqueue(kind, payload);
			return { executed: false, queued: true };
		}
		throw e;
	}
}

export async function initMOfflineQueue(): Promise<() => void> {
	if (initialized) return () => {};
	initialized = true;
	pendingMMutations.value = await loadQueue();

	const stop = watch(
		() => isOffline.value,
		(offline, wasOffline) => {
			if (wasOffline && !offline) void replayPendingMMutations();
		}
	);

	// also replay on init if we happen to be online with leftover items
	if (!isOffline.value) void replayPendingMMutations();

	return () => {
		stop();
		initialized = false;
	};
}
