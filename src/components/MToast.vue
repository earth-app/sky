<template>
	<ClientOnly>
		<Teleport to="body">
			<div
				class="m-toast-host"
				:style="hostStyle"
				:role="assertive ? 'alert' : 'status'"
				:aria-live="assertive ? 'assertive' : 'polite'"
				aria-atomic="false"
			>
				<TransitionGroup :name="reducedMotion ? '' : 'm-toast'">
					<div
						v-for="toast in visible"
						:key="toast.id"
						class="m-toast"
						:data-severity="toast.severity"
						:style="toast.id === drag?.id ? dragStyle : undefined"
						@pointerdown="onPointerDown($event, toast.id)"
						@pointermove="onPointerMove"
						@pointerup="onPointerEnd"
						@pointercancel="onPointerEnd"
					>
						<span class="m-toast-glyph">
							<UIcon
								:name="TONES[toast.severity].icon"
								class="size-5"
							/>
						</span>

						<div class="m-toast-copy">
							<span class="m-toast-eyebrow">{{ toast.title || TONES[toast.severity].label }}</span>
							<span class="m-toast-text">{{ toast.text }}</span>
						</div>

						<IonButton
							v-if="toast.action"
							size="small"
							fill="solid"
							class="m-toast-control m-toast-action"
							:aria-label="toast.action.label"
							@click="runAction(toast)"
						>
							{{ toast.action.label }}
						</IonButton>

						<IonButton
							size="small"
							fill="clear"
							class="m-toast-control m-toast-dismiss"
							aria-label="Dismiss"
							@click="dismissMToast(toast.id)"
						>
							<UIcon
								name="i-heroicons-x-mark"
								class="size-5"
							/>
						</IonButton>
					</div>
				</TransitionGroup>
			</div>
		</Teleport>
	</ClientOnly>
</template>

<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import {
	dismissMToast,
	MAX_VISIBLE_TOASTS,
	mToasts,
	registerMToastHost,
	type MToastItem,
	type ToastSeverity
} from '~/composables/useNotify';

const TONES: Record<ToastSeverity, { icon: string; label: string }> = {
	info: { icon: 'mdi:information-outline', label: 'Info' },
	success: { icon: 'mdi:check-circle-outline', label: 'Done' },
	warning: { icon: 'mdi:alert-outline', label: 'Heads Up' },
	error: { icon: 'mdi:alert-circle-outline', label: 'Error' }
};

// ionic overlays are siblings of ion-app carrying an inline z-index of their own, well
// above the app scale; the toast reads the top one and steps over it rather than guessing
const OVERLAY_SELECTOR = [
	'ion-modal',
	'ion-action-sheet',
	'ion-alert',
	'ion-popover',
	'ion-loading',
	'ion-picker'
]
	.map((tag) => `${tag}:not(.overlay-hidden)`)
	.join(', ');

const GAP_MS = 400;
const SWIPE_DISMISS_PX = 72;

const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const appSettings = useAppSettingsState();
const { notifyError, notifyWarning, notifySuccess, selection } = useAppHaptics();

// os preference OR the in-app toggle; either one means no slide
const reducedMotion = computed(() => prefersReducedMotion.value || !appSettings.value.animations);

const visible = computed(() => mToasts.value.slice(0, MAX_VISIBLE_TOASTS));
const assertive = computed(() => visible.value.some((toast) => toast.severity === 'error'));

const overlayZ = ref(0);
const drag = ref<{ id: number; startX: number; dx: number } | null>(null);

// var(--m-z-toast) is the resting stack; an open ionic overlay is the one thing above it
const hostStyle = computed(() =>
	overlayZ.value > 0 ? { zIndex: String(overlayZ.value + 1) } : undefined
);

const dragStyle = computed(() => {
	const active = drag.value;
	if (!active) return undefined;
	const progress = Math.min(1, Math.abs(active.dx) / (SWIPE_DISMISS_PX * 2));
	return {
		transform: `translateX(${active.dx}px)`,
		opacity: String(1 - progress * 0.6),
		transition: 'none'
	};
});

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const buzzed = new Set<number>();
let releaseHost: (() => void) | null = null;
let overlayTicker: ReturnType<typeof setInterval> | null = null;

function clearTimer(id: number) {
	const handle = timers.get(id);
	if (handle) clearTimeout(handle);
	timers.delete(id);
}

function clearTimers() {
	for (const handle of timers.values()) clearTimeout(handle);
	timers.clear();
}

function arm(toast: MToastItem, index: number) {
	clearTimer(toast.id);
	// stagger the exits so two toasts that arrived together do not vanish as one block
	const handle = setTimeout(
		() => {
			timers.delete(toast.id);
			dismissMToast(toast.id);
		},
		toast.dwellMs + index * GAP_MS
	);
	timers.set(toast.id, handle);
}

function buzz(toast: MToastItem) {
	if (buzzed.has(toast.id)) return;
	buzzed.add(toast.id);
	// info is the common case; buzzing on every one of those is what wears a pattern out
	if (toast.severity === 'error') void notifyError();
	else if (toast.severity === 'warning') void notifyWarning();
	else if (toast.severity === 'success') void notifySuccess();
}

function syncOverlayLift() {
	if (!import.meta.client) return;

	let top = 0;
	for (const el of document.querySelectorAll(OVERLAY_SELECTOR)) {
		const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
		if (Number.isFinite(z)) top = Math.max(top, z);
	}
	overlayZ.value = top;
}

// a modal can open while a toast is already up, and there is no single event for that;
// poll only for as long as something is on screen
function trackOverlays(active: boolean) {
	if (active) {
		syncOverlayLift();
		overlayTicker ??= setInterval(syncOverlayLift, 500);
		return;
	}

	if (overlayTicker) clearInterval(overlayTicker);
	overlayTicker = null;
	overlayZ.value = 0;
}

async function runAction(toast: MToastItem) {
	void selection();
	dismissMToast(toast.id);
	try {
		await toast.action?.handler();
	} catch {
		// an action handler must never take the host down with it
	}
}

function onPointerDown(event: PointerEvent, id: number) {
	if (event.pointerType === 'mouse' && event.button !== 0) return;
	// let the inline controls take their own taps
	if ((event.target as HTMLElement | null)?.closest('ion-button')) return;

	const el = event.currentTarget as HTMLElement;
	el.setPointerCapture?.(event.pointerId);
	drag.value = { id, startX: event.clientX, dx: 0 };
	clearTimer(id);
}

function onPointerMove(event: PointerEvent) {
	if (!drag.value) return;
	drag.value = { ...drag.value, dx: event.clientX - drag.value.startX };
}

function onPointerEnd() {
	const active = drag.value;
	drag.value = null;
	if (!active) return;

	if (Math.abs(active.dx) >= SWIPE_DISMISS_PX) {
		dismissMToast(active.id);
		return;
	}

	// held but not thrown; give the full dwell back so it stays readable
	const toast = visible.value.find((item) => item.id === active.id);
	if (toast) arm(toast, 0);
}

watch(
	visible,
	(toasts) => {
		const live = new Set(toasts.map((toast) => toast.id));

		for (const id of [...timers.keys()]) if (!live.has(id)) clearTimer(id);
		for (const id of [...buzzed]) if (!live.has(id)) buzzed.delete(id);
		if (drag.value && !live.has(drag.value.id)) drag.value = null;

		trackOverlays(toasts.length > 0);

		toasts.forEach((toast, index) => {
			// a held toast owns its timer; re-arming would yank it out mid-swipe
			if (drag.value?.id === toast.id || timers.has(toast.id)) return;
			buzz(toast);
			arm(toast, index);
		});
	},
	{ immediate: true }
);

onMounted(() => {
	releaseHost = registerMToastHost();
});

onBeforeUnmount(() => {
	clearTimers();
	trackOverlays(false);
	releaseHost?.();
	releaseHost = null;
});
</script>

<style scoped>
.m-toast-host {
	position: fixed;
	right: 0;
	/* clears the tab bar and the create fab that overhangs it */
	bottom: calc(env(safe-area-inset-bottom, 0px) + 5.25rem);
	left: 0;
	z-index: var(--m-z-toast);
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin: 0 auto;
	max-width: 28rem;
	padding: 0 0.75rem;
	pointer-events: none;
}

.m-toast {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.5rem 0.375rem 0.5rem 0.75rem;
	border: 1px solid var(--m-hairline);
	border-inline-start: 3px solid var(--m-toast-accent);
	border-radius: calc(var(--ui-radius) * 3);
	/* --ui-bg, not the elevated step: in light mode elevated sits BELOW the page colour
	   and a floating surface that reads recessed is the wrong signal */
	background-color: var(--ui-bg);
	color: var(--ion-text-color);
	box-shadow: var(--shadow-lg);
	/* eases the snap-back of a swipe that did not clear the threshold; the drag itself
	   sets transition:none so it tracks the finger */
	transition: transform 180ms var(--ease-emphasized);
	pointer-events: auto;
	/* vertical gestures still belong to the page; horizontal ones dismiss */
	touch-action: pan-y;
	user-select: none;
}

.m-toast[data-severity='info'] {
	--m-toast-accent: var(--ion-color-secondary);
	--m-toast-accent-contrast: var(--ion-color-secondary-contrast);
}

.m-toast[data-severity='success'] {
	--m-toast-accent: var(--ion-color-success);
	--m-toast-accent-contrast: var(--ion-color-success-contrast);
}

.m-toast[data-severity='warning'] {
	--m-toast-accent: var(--ion-color-warning);
	--m-toast-accent-contrast: var(--ion-color-warning-contrast);
}

.m-toast[data-severity='error'] {
	--m-toast-accent: var(--ion-color-danger);
	--m-toast-accent-contrast: var(--ion-color-danger-contrast);
}

.m-toast-glyph {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	border-radius: calc(var(--ui-radius) * 2);
	/* solid tone tile, so the glyph rides the role's computed contrast pair */
	background-color: var(--m-toast-accent);
	color: var(--m-toast-accent-contrast);
}

.m-toast-copy {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 0.0625rem;
}

.m-toast-eyebrow {
	overflow: hidden;
	font-size: var(--text-2xs);
	font-weight: 600;
	line-height: 1.2;
	letter-spacing: 0.06em;
	text-overflow: ellipsis;
	text-transform: uppercase;
	white-space: nowrap;
	color: var(--ion-text-color-step-150);
}

.m-toast-text {
	display: -webkit-box;
	overflow: hidden;
	font-size: var(--text-sm);
	line-height: 1.35;
	overflow-wrap: break-word;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
}

.m-toast-control {
	flex-shrink: 0;
	margin: 0;
	--padding-start: 0.5rem;
	--padding-end: 0.5rem;
}

/* the role colours are theme-invariant, so a tinted LABEL cannot clear 4.5:1 in both
   modes; the solid pill borrows the role's computed contrast pair instead */
.m-toast-action {
	--background: var(--m-toast-accent);
	--background-activated: var(--m-toast-accent);
	--color: var(--m-toast-accent-contrast);
	--border-radius: 999px;
	font-size: var(--text-xs);
	font-weight: 600;
}

.m-toast-dismiss {
	--color: var(--ion-text-color-step-150);
}

.m-toast-enter-active {
	transition:
		transform 240ms var(--ease-emphasized),
		opacity 200ms var(--ease-emphasized);
}

.m-toast-leave-active {
	transition:
		transform 180ms var(--ease-exit),
		opacity 160ms var(--ease-exit);
}

.m-toast-move {
	transition: transform 220ms var(--ease-emphasized);
}

.m-toast-enter-from,
.m-toast-leave-to {
	transform: translateY(0.75rem);
	opacity: 0;
}
</style>
