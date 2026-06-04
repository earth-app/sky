<template>
	<ClientOnly>
		<Transition
			enter-active-class="transition duration-300 ease-out"
			leave-active-class="transition duration-200 ease-in"
			enter-from-class="opacity-0 translate-y-2"
			enter-to-class="opacity-100 translate-y-0"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 translate-y-2"
		>
			<button
				v-if="visible"
				type="button"
				class="m-scroll-cue"
				aria-label="Scroll to Discover Quests"
				@click="onClick"
			>
				<span>Scroll to Discover Quests</span>
				<UIcon
					name="mdi:chevron-down"
					:class="reduced ? 'size-4' : 'size-4 m-scroll-cue-bounce'"
				/>
			</button>
		</Transition>
	</ClientOnly>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';
import { useIonRouter } from '@ionic/vue';
import slide from '~/animations/slide';

// first-session scroll cue. quest-funneled. only renders for logged-in users on first 2 dashboard visits
const STORAGE_DISMISSED = 'home_scroll_cue_dismissed_v1';
const STORAGE_VISITS = 'home_visits';
const VISIT_CAP = 2;
const SCROLL_THRESHOLD = 200;

const props = withDefaults(
	defineProps<{
		// dashboard's IonContent is the scroll container; pass it in so we listen to the right element
		scrollContainer?: HTMLElement | null;
	}>(),
	{ scrollContainer: null }
);

const { user } = useAuth();
const router = useIonRouter();
const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');

const visible = ref(false);
let scrollHandler: ((e: Event) => void) | null = null;
let attachedEl: HTMLElement | Window | null = null;

async function dismiss(persist = true) {
	if (!visible.value) return;
	visible.value = false;
	if (persist) {
		try {
			await Preferences.set({ key: STORAGE_DISMISSED, value: '1' });
		} catch {
			// noop on storage failure
		}
	}
	teardown();
}

function teardown() {
	if (scrollHandler && attachedEl) {
		attachedEl.removeEventListener('scroll', scrollHandler as EventListener);
		scrollHandler = null;
		attachedEl = null;
	}
}

function onClick() {
	void dismiss(true);
	router.push('/tabs/quests', slide);
}

async function getNumber(key: string): Promise<number> {
	try {
		const { value } = await Preferences.get({ key });
		return Number(value || '0');
	} catch {
		return 0;
	}
}

onMounted(async () => {
	if (!user.value) return;

	try {
		const dismissed = await Preferences.get({ key: STORAGE_DISMISSED });
		if (dismissed.value) return;

		const visits = await getNumber(STORAGE_VISITS);
		if (visits >= VISIT_CAP) return;
		await Preferences.set({ key: STORAGE_VISITS, value: String(visits + 1) });
	} catch {
		return;
	}

	visible.value = true;

	scrollHandler = (e: Event) => {
		const target = e.target as HTMLElement | Document | null;
		// IonContent dispatches scroll events from a shadow-root child; fall back to scrollTop on event target
		const top =
			(target as HTMLElement)?.scrollTop ??
			(target as Document)?.documentElement?.scrollTop ??
			window.scrollY;
		if (top > SCROLL_THRESHOLD) void dismiss(true);
	};

	// prefer the explicit scroll container (IonContent's inner div), fall back to window for web
	attachedEl = props.scrollContainer || window;
	attachedEl.addEventListener('scroll', scrollHandler as EventListener, { passive: true });
});

onBeforeUnmount(() => {
	teardown();
});
</script>

<style scoped>
.m-scroll-cue {
	position: fixed;
	left: 50%;
	transform: translateX(-50%);
	bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
	z-index: 40;
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	border-radius: 9999px;
	border: 1px solid var(--ion-color-step-200, rgba(0, 0, 0, 0.12));
	background: var(--ion-card-background, rgba(255, 255, 255, 0.95));
	color: var(--ion-text-color, inherit);
	backdrop-filter: blur(8px);
	box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
	font-size: 0.875rem;
	font-weight: 500;
	transition: transform 120ms ease-out;
}
.m-scroll-cue:active {
	transform: translateX(-50%) scale(0.97);
}
.m-scroll-cue-bounce {
	animation: m-scroll-cue-bounce 1s ease-in-out infinite;
}
@keyframes m-scroll-cue-bounce {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(4px);
	}
}
@media (prefers-reduced-motion: reduce) {
	.m-scroll-cue-bounce {
		animation: none;
	}
}
</style>
