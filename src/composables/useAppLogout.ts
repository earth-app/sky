import { clearCachedUser } from '~/composables/useOfflineAuth';

export function useAppLogout() {
	const logout = useLogout();
	const authStore = useAuthStore();

	return async function appLogout(platform = 'web'): Promise<void> {
		try {
			await logout(platform);
		} catch {
			// a server-side failure must not keep the user signed in on the device
		} finally {
			authStore.logout();
			await clearCachedUser();
		}
	};
}
