import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const AUTH_DIR = 'auth';
const AUTH_FILE = 'auth/current_user.json';
let onlineValidationInFlight: Promise<any | null> | null = null;

function sessionCookieExists() {
	if (typeof document === 'undefined') return false;
	return /(?:^|; )session_token=/.test(document.cookie);
}

function hasSessionIndicator() {
	const token = useCurrentSessionToken();
	return Boolean(token && token.trim().length > 0) || sessionCookieExists();
}

async function ensureAuthDir() {
	try {
		await Filesystem.readdir({ path: AUTH_DIR, directory: Directory.Data });
	} catch (e) {
		try {
			await Filesystem.mkdir({ path: AUTH_DIR, directory: Directory.Data });
		} catch (e2) {
			// ignore
		}
	}
}

export async function saveCachedUser(user: any) {
	try {
		await ensureAuthDir();
		const payload = JSON.stringify({ user, cached_at: Date.now() });
		await Filesystem.writeFile({
			path: AUTH_FILE,
			data: payload,
			directory: Directory.Data,
			encoding: Encoding.UTF8
		});
	} catch (err) {
		try {
			// fallback to localStorage
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('offline_user', JSON.stringify({ user, cached_at: Date.now() }));
			}
		} catch (e) {
			// ignore
		}
	}
}

export async function getCachedUser(): Promise<any | null> {
	try {
		const file = await Filesystem.readFile({
			path: AUTH_FILE,
			directory: Directory.Data,
			encoding: Encoding.UTF8
		});
		if (!file || !file.data) return null;
		try {
			return JSON.parse(file.data as string);
		} catch (e) {
			return null;
		}
	} catch (err) {
		try {
			if (typeof localStorage !== 'undefined') {
				const raw = localStorage.getItem('offline_user');
				if (!raw) return null;
				return JSON.parse(raw);
			}
		} catch (e) {
			// ignore
		}
		return null;
	}
}

async function getValidCachedUser(): Promise<any | null> {
	if (!hasSessionIndicator()) return null;

	try {
		const cached = await getCachedUser();
		if (!cached) return null;

		const { user, cached_at } = cached;
		const ageMs = Date.now() - (cached_at || 0);
		const maxAgeMs = 1000 * 60 * 60 * 24 * 30; // 30 days
		if (ageMs > maxAgeMs) return null;

		return user || cached;
	} catch {
		return null;
	}
}

async function validateSessionOnline(): Promise<any | null> {
	if (useAppSettingsState().value.offlineMode) {
		throw new Error('Offline mode enabled');
	}

	// Calls the backend to validate the session cookie/bearer.
	// Returns the user object on success, null on invalid session.
	const sessionToken = useCurrentSessionToken();
	const config = useRuntimeConfig();
	const headers: Record<string, string> = { Accept: 'application/json' };

	if (sessionToken) {
		headers.Authorization = `Bearer ${sessionToken}`;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);

	let resp: Response;
	try {
		resp = await fetch(`${config.public.apiBaseUrl}/v2/users/current`, {
			method: 'GET',
			credentials: 'include',
			headers,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeout);
	}

	if (!resp.ok) return null;
	const data = await resp.json();
	// persist cache for offline fallback
	try {
		await saveCachedUser(data);
	} catch (e) {
		// ignore
	}
	return data;
}

function validateSessionOnlineShared(): Promise<any | null> {
	if (!onlineValidationInFlight) {
		onlineValidationInFlight = validateSessionOnline().finally(() => {
			onlineValidationInFlight = null;
		});
	}

	return onlineValidationInFlight;
}

export async function validateSessionAllowOffline(): Promise<any | null> {
	if (useAppSettingsState().value.offlineMode) {
		return await getValidCachedUser();
	}

	try {
		const online = await validateSessionOnlineShared();
		if (online) return online;
		// online validation returned null -> invalid/expired session
		return null;
	} catch (err) {
		// likely offline or network failure. Allow cached user if cookie exists and cache is present.
		return await getValidCachedUser();
	}
}

export default {
	saveCachedUser,
	getCachedUser,
	validateSessionAllowOffline
};
