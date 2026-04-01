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
