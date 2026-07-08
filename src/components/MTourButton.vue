<template>
	<IonButton
		:fill="fill"
		:size="size"
		color="secondary"
		:aria-label="ariaLabel"
		:title="ariaLabel"
		:class="['m-tour-button', { 'm-tour-button--attn': showRing }]"
		@click="handleClick"
	>
		<UIcon
			name="mdi:progress-question"
			class="min-h-5 min-w-5"
		/>
	</IonButton>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';

const props = withDefaults(
	defineProps<{
		tourId: string;
		size?: 'small' | 'default' | 'large';
		fill?: 'clear' | 'outline' | 'solid';
		label?: string;
	}>(),
	{
		size: 'small',
		fill: 'outline'
	}
);

const { startTour, hasCompleted } = useSiteTour();

// seen defaults to true so the ring never flashes-then-hides before Preferences resolves
// (it only ever appears later, once we confirm the tour is genuinely unseen)
const seen = ref(true);
const prefersReducedMotion = ref(false);

const seenKey = computed(() => `sky:tour-seen:${props.tourId}`);
const ariaLabel = computed(() => props.label || 'Show Guided Tour');

// pulse only while the tour was never seen AND never completed, honoring reduced-motion
const showRing = computed(() => {
	if (prefersReducedMotion.value) return false;
	if (hasCompleted(props.tourId)) return false;
	return !seen.value;
});

onMounted(async () => {
	if (import.meta.client) {
		prefersReducedMotion.value =
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
	}
	if (hasCompleted(props.tourId)) return; // already completed -> counts as seen
	try {
		const { value } = await Preferences.get({ key: seenKey.value });
		seen.value = value === '1';
	} catch {
		// storage unavailable; surface the ring so the affordance stays discoverable
		seen.value = false;
	}
});

async function markSeen() {
	seen.value = true;
	try {
		await Preferences.set({ key: seenKey.value, value: '1' });
	} catch {
		// best-effort; the in-memory flag already hid the ring for this session
	}
}

function handleClick() {
	void markSeen();
	startTour(props.tourId);
}
</script>

<style scoped>
/* pulsing attention ring while the tour has never been seen (earth secondary blue) */
.m-tour-button.m-tour-button--attn {
	border-radius: 9999px;
	animation: m-tour-button-ring 1.8s ease-out infinite;
}

@keyframes m-tour-button-ring {
	0% {
		box-shadow: 0 0 0 0 rgba(var(--ion-color-secondary-rgb, 23, 79, 150), 0.5);
	}
	70% {
		box-shadow: 0 0 0 10px rgba(var(--ion-color-secondary-rgb, 23, 79, 150), 0);
	}
	100% {
		box-shadow: 0 0 0 0 rgba(var(--ion-color-secondary-rgb, 23, 79, 150), 0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.m-tour-button.m-tour-button--attn {
		animation: none;
	}
}
</style>
