import { Preferences } from '@capacitor/preferences';

const PROTECTED_PREFIXES = ['/tabs', '/profile'];

export default defineNuxtRouteMiddleware(async (to) => {
	if (import.meta.server) return;

	const requiresAuth = PROTECTED_PREFIXES.some(
		(prefix) => to.path === prefix || to.path.startsWith(`${prefix}/`)
	);
	if (!requiresAuth) return;

	const authStore = useAuthStore();
	if (authStore.sessionToken) return;

	try {
		const persistedToken = window.localStorage.getItem('session_token');
		if (persistedToken) {
			authStore.setSessionToken(persistedToken);
			return;
		}
	} catch {
		// localStorage unavailable; fall through to the durable store
	}

	try {
		const { value } = await Preferences.get({ key: 'session_token' });
		if (value) {
			authStore.setSessionToken(value);
			return;
		}
	} catch {
		// Preferences unavailable; treat as unauthenticated
	}

	return navigateTo(
		{
			path: '/login',
			query: { redirect: to.fullPath }
		},
		{ replace: true }
	);
});
