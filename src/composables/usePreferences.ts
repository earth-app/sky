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
