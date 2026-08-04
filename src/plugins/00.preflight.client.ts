import { setRequestOutcomeListener } from 'backend';
import { useBackendStore } from 'stores/backend';

/**
 * Ask the backend whether it is up before the app does anything that assumes it is.
 *
 * The store and its classification logic come from the crust layer; only this wiring is sky's,
 * because crust publishes `src/stores` and `src/shared` but not its plugins.
 *
 * Numbered so it starts ahead of the other client plugins. It deliberately does NOT await -- the
 * check is kicked off here and awaited where it matters (index.vue, before it navigates into the
 * tab shell), so a slow backend delays that rather than the splash.
 */
export default defineNuxtPlugin(() => {
	const backend = useBackendStore();

	/* a 5xx from a live mantle-direct call asks the preflight to re-check; it never sets state on
	   its own, because one failed request is not an outage */
	setRequestOutcomeListener((status) => backend.reportFailure(status));

	void backend.preflight().then(() => {
		if (backend.isBlocked) backend.startRecoveryPolling();
	});

	// a device coming back online is the most likely moment for the answer to have changed
	if (typeof window !== 'undefined') {
		window.addEventListener('online', () => void backend.preflight(true));
	}
});
