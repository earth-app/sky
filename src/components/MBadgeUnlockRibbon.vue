<template>
	<ClientOnly>
		<Teleport to="body">
			<Transition
				:name="reducedMotion ? '' : 'm-badge-ribbon'"
				appear
			>
				<div
					v-if="current"
					role="status"
					aria-live="polite"
					class="m-badge-ribbon-wrap"
				>
					<IonCard class="m-badge-ribbon-card">
						<div class="flex items-center gap-3 p-3">
							<div class="m-badge-ribbon-icon">
								<UIcon
									:name="current.badgeIcon || 'mdi:medal-outline'"
									class="size-6"
								/>
							</div>

							<div class="flex flex-col min-w-0 flex-1">
								<span class="text-[11px] uppercase font-semibold tracking-wider opacity-80">
									New Badge Unlocked
								</span>
								<span class="font-semibold text-sm truncate">{{ current.badgeName }}</span>
								<span class="text-xs opacity-80 mt-0.5 line-clamp-2">{{ footerCopy }}</span>
							</div>

							<IonButton
								v-if="ctaHref"
								size="small"
								fill="solid"
								color="light"
								class="shrink-0"
								@click="onView"
							>
								View
							</IonButton>

							<IonButton
								size="small"
								fill="clear"
								color="dark"
								aria-label="Dismiss"
								class="shrink-0"
								@click="dismissCurrent"
							>
								<UIcon
									name="i-heroicons-x-mark"
									class="size-5"
								/>
							</IonButton>
						</div>
					</IonCard>
				</div>
			</Transition>
		</Teleport>
	</ClientOnly>
</template>

<script setup lang="ts">
import { IonButton, IonCard, useIonRouter } from '@ionic/vue';
import slide from '~/animations/slide';

const { queue, dismiss } = useBadgeUnlockListener();
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const { user } = useAuth();
const { notifySuccess } = useAppHaptics();
const router = useIonRouter();

const current = computed(() => queue.value[0] || null);

let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let gapTimer: ReturnType<typeof setTimeout> | null = null;
const DWELL_MS = 5000;
const GAP_MS = 1000;

const clearTimers = () => {
	if (dismissTimer) clearTimeout(dismissTimer);
	if (gapTimer) clearTimeout(gapTimer);
	dismissTimer = null;
	gapTimer = null;
};

const dismissCurrent = () => {
	clearTimers();
	dismiss();
};

const ctaHref = computed(() => {
	const uid = user.value?.id;
	if (!uid || !current.value?.badgeId) return null;
	return `/tabs/profile/@${user.value?.username || uid}/badges`;
});

const onView = () => {
	const href = ctaHref.value;
	if (href) router.push(href, slide);
	dismissCurrent();
};

const footerCopy = computed(() => {
	if (!current.value) return '';
	return current.value.trackerId
		? 'Keep going; more badges are waiting in your quests.'
		: 'Earned through your quest progress. Keep going.';
});

watch(
	current,
	(next, prev) => {
		clearTimers();
		if (!next) return;
		// success haptic on appear; capacitor swallows on web
		void notifySuccess();
		if (prev) {
			gapTimer = setTimeout(() => {
				dismissTimer = setTimeout(() => dismiss(), DWELL_MS);
			}, GAP_MS);
		} else {
			dismissTimer = setTimeout(() => dismiss(), DWELL_MS);
		}
	},
	{ immediate: true }
);

onBeforeUnmount(() => clearTimers());
</script>

<style scoped>
.m-badge-ribbon-wrap {
	position: fixed;
	top: calc(env(safe-area-inset-top, 0px) + 8px);
	left: 0;
	right: 0;
	margin: 0 auto;
	max-width: 28rem;
	padding: 0 12px;
	z-index: 9999;
	pointer-events: none;
}

.m-badge-ribbon-card {
	pointer-events: auto;
	margin: 0;
	border-radius: 18px;
	background: linear-gradient(
		90deg,
		rgba(245, 158, 11, 0.95),
		rgba(251, 191, 36, 0.95),
		rgba(245, 158, 11, 0.95)
	);
	color: #422006;
	border: 1px solid rgba(251, 191, 36, 0.6);
	box-shadow: 0 10px 25px rgba(217, 119, 6, 0.35);
}

.m-badge-ribbon-icon {
	width: 2.5rem;
	height: 2.5rem;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 12px;
	background: rgba(255, 255, 255, 0.4);
	border: 1px solid rgba(255, 255, 255, 0.6);
	color: #78350f;
	flex-shrink: 0;
}

.m-badge-ribbon-enter-active,
.m-badge-ribbon-leave-active {
	transition:
		transform 400ms cubic-bezier(0.16, 1, 0.3, 1),
		opacity 300ms ease-out;
}
.m-badge-ribbon-enter-from,
.m-badge-ribbon-leave-to {
	transform: translateY(-120%);
	opacity: 0;
}
.m-badge-ribbon-enter-to,
.m-badge-ribbon-leave-from {
	transform: translateY(0);
	opacity: 1;
}
</style>
