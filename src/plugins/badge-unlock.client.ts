// mobile bootstrap for the shared badge-unlock listener; crust's websocket
// plugin already extends into sky via the nuxt layer, so live events flow
// without extra wiring. this plugin just arms the polling fallback on launch.
export default defineNuxtPlugin((nuxtApp) => {
	nuxtApp.hook('app:mounted', () => {
		if (!import.meta.client) return;
		const { start } = useBadgeUnlockListener();
		start();
	});
});
