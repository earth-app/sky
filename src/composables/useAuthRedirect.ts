import {
	onIonViewDidEnter,
	onIonViewWillEnter,
	onIonViewWillLeave,
	useIonRouter
} from '@ionic/vue';

const RETRY_INTERVAL_MS = 400;
const MAX_RETRIES = 12; // ~5s of self-healing before giving up

export function useAuthRedirect(getTarget: () => string, onFirstAuth?: () => void) {
	const { user } = useAuth();
	const ionRouter = useIonRouter();

	const viewActive = ref(false);
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let suppressed = false;
	let announced = false;

	const clearRetry = () => {
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
	};

	const redirectNow = (attempt = 0) => {
		clearRetry();
		// Nothing to do if a form flow took over, the user signed out, or the view already left
		// (which means a previous navigate succeeded — we're done).
		if (suppressed || !user.value || !viewActive.value) return;
		ionRouter.navigate(getTarget(), 'root', 'replace');
		if (attempt < MAX_RETRIES) {
			retryTimer = setTimeout(() => redirectNow(attempt + 1), RETRY_INTERVAL_MS);
		}
	};

	// Stop the auto-redirect because a caller is sending the user somewhere specific instead
	// (e.g. the signup form routing to email verification).
	const suppress = () => {
		suppressed = true;
		clearRetry();
	};

	onIonViewWillEnter(() => {
		viewActive.value = true;
	});
	onIonViewDidEnter(() => {
		viewActive.value = true;
		if (user.value) redirectNow(0);
	});
	onIonViewWillLeave(() => {
		viewActive.value = false;
		clearRetry();
	});
	onUnmounted(clearRetry);

	watch(
		() => user.value,
		(currentUser) => {
			if (!currentUser) return;
			if (!announced) {
				announced = true;
				onFirstAuth?.();
			}
			redirectNow(0);
		},
		{ immediate: true }
	);

	return { redirectNow: () => redirectNow(0), suppress };
}
