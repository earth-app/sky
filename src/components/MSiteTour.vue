<template>
	<!-- tour start -->
	<Teleport :to="overlayTeleportTarget">
		<!-- dim backdrop with cutout -->
		<div
			v-if="isActive && showDim"
			:style="{
				position: 'fixed',
				top: dimStyle.top,
				left: dimStyle.left,
				width: dimStyle.width,
				height: dimStyle.height,
				borderRadius: `${effectiveRadius}px`,
				boxShadow: `0 0 0 9999px ${dimColor}`,
				pointerEvents: allowInteraction ? 'none' : 'auto',
				transition:
					'top 260ms cubic-bezier(0.22, 1, 0.36, 1), left 260ms cubic-bezier(0.22, 1, 0.36, 1), width 260ms cubic-bezier(0.22, 1, 0.36, 1), height 260ms cubic-bezier(0.22, 1, 0.36, 1)',
				zIndex: dimZIndex
			}"
			@click="onBackdropClick"
		/>

		<!-- highlight box -->
		<div
			v-if="isActive && boxStyle.display === 'block'"
			ref="highlightBox"
			:class="['site-tour-highlight', { 'site-tour-highlight--pulse': showPulse }]"
			:style="{
				position: 'fixed',
				top: boxStyle.top,
				left: boxStyle.left,
				width: boxStyle.width,
				height: boxStyle.height,
				borderRadius: `${effectiveRadius}px`,
				pointerEvents: 'none',
				zIndex: boxStyle.zIndex
			}"
		/>

		<!-- tooltip card -->
		<div
			v-if="isActive && step"
			ref="tooltipCard"
			class="site-tour-card-wrap motion-preset-fade-md"
			role="dialog"
			aria-modal="true"
			aria-labelledby="site-tour-title"
			tabindex="-1"
			@keydown="onCardKeydown"
			@click.stop
			@mousedown.stop
			@pointerdown.stop
			@touchstart.stop
			:style="{
				position: 'fixed',
				top: tooltipStyle.top,
				left: tooltipStyle.left,
				right: tooltipStyle.right,
				maxWidth: tooltipStyle.maxWidth,
				transform: tooltipStyle.transform,
				transition:
					'top 260ms cubic-bezier(0.22, 1, 0.36, 1), left 260ms cubic-bezier(0.22, 1, 0.36, 1), right 260ms cubic-bezier(0.22, 1, 0.36, 1), transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
				zIndex: tooltipStyle.zIndex,
				pointerEvents: 'auto'
			}"
		>
			<IonCard
				:key="stepAnimKey"
				class="shadow-lg w-[min(92vw,26rem)] max-w-[92vw] sm:w-[72vw] sm:max-w-136 lg:w-[52vw] p-4 border-4 rounded-lg site-tour-card site-tour-card--enter"
			>
				<IonCardHeader class="pb-2">
					<div class="flex justify-between items-center gap-2">
						<div class="flex items-center gap-2 min-w-0">
							<UIcon
								v-if="step.icon"
								:name="step.icon"
								class="size-5 text-(--ion-color-primary) shrink-0"
							/>
							<h3
								id="site-tour-title"
								class="text-lg font-semibold m-0! truncate"
							>
								{{ step.title }}
							</h3>
						</div>
						<IonButton
							fill="clear"
							size="small"
							color="medium"
							class="-mr-2"
							@click="close({ completed: false })"
							aria-label="Close tour"
						>
							<UIcon
								name="i-heroicons-x-mark"
								class="size-4"
							/>
						</IonButton>
					</div>
				</IonCardHeader>

				<IonCardContent class="p-0!">
					<p class="text-sm! text-gray-600 dark:text-gray-400 whitespace-pre-line">
						{{ step.description }}
					</p>

					<IonImg
						v-if="step.image"
						:src="step.image"
						class="mt-3 rounded-md w-full max-h-48 object-cover border border-gray-200 dark:border-gray-800"
					/>

					<div class="mt-1 flex flex-wrap items-center justify-between">
						<p
							v-if="step.footer"
							class="text-xs! text-gray-500 px-2 flex-1"
						>
							{{ step.footer }}
						</p>
						<div class="flex flex-col gap-2 items-end w-full mt-2">
							<span class="text-xs! text-gray-500 text-center mx-2">
								Step {{ visibleStepIndex + 1 }} of {{ visibleSteps.length }}
							</span>
							<div
								class="flex flex-col gap-2 items-stretch w-full sm:flex-row sm:flex-wrap sm:justify-end"
							>
								<IonButton
									v-if="index > 0"
									fill="outline"
									color="primary"
									size="small"
									:disabled="busy"
									@click="gotoPreviousStep"
									class="w-full sm:w-auto sm:flex-1 sm:min-w-24"
								>
									<IonSpinner
										v-if="regressing"
										name="crescent"
										class="size-4 mr-1"
									/>
									<UIcon
										v-else
										name="i-heroicons-arrow-left"
										class="size-4 mr-1"
									/>
									<span>Back</span>
								</IonButton>
								<IonButton
									v-if="step.cta"
									:color="step.cta.color || 'success'"
									fill="solid"
									size="small"
									:disabled="busy || ctaLoading"
									@click="runCTA"
									class="w-full sm:w-auto sm:flex-1 sm:min-w-24"
								>
									<IonSpinner
										v-if="ctaLoading"
										name="crescent"
										class="size-4 mr-1"
									/>
									<UIcon
										v-else
										:name="step.cta.icon || 'mdi:flash'"
										class="size-4 mr-1"
									/>
									<span>{{ step.cta.label }}</span>
								</IonButton>
								<IonButton
									fill="solid"
									color="primary"
									size="small"
									:disabled="busy"
									data-tour-next
									@click="gotoNextStep"
									class="w-full sm:w-auto sm:flex-1 sm:min-w-24"
								>
									<IonSpinner
										v-if="advancing"
										name="crescent"
										class="size-4 mr-1"
									/>
									<span>{{ isLastVisibleStep ? 'Finish' : 'Next' }}</span>
									<UIcon
										v-if="!advancing"
										:name="isLastVisibleStep ? 'i-heroicons-flag' : 'i-heroicons-arrow-right'"
										class="size-4 ml-1"
									/>
								</IonButton>
							</div>
						</div>
					</div>
				</IonCardContent>
			</IonCard>
		</div>
	</Teleport>
	<!-- tour end -->
</template>

<script setup lang="ts">
import slide from '~/animations/slide';

const props = defineProps<{
	tourId: string;
	name: string;
	steps: SiteTourStep[];
	dim?: boolean;
	pulse?: boolean;
	allowSkip?: boolean;
	persist?: boolean;
}>();

const emit = defineEmits<{
	(event: 'next-step', oldStep: number): void;
	(event: 'prev-step', oldStep: number): void;
	(event: 'close-tour'): void;
	(event: 'complete-tour'): void;
}>();

const {
	registerTour,
	unregisterTour,
	isActiveTour,
	stopTour,
	activeStepIndex,
	goToStep,
	markCompleted
} = useSiteTour();
const overlayTeleportTarget = ref<string | HTMLElement>('body');
const highlightBox = ref<HTMLElement | null>(null);
const tooltipCard = ref<HTMLElement | null>(null);
const router = useIonRouter();
const index = ref(0);
const step = computed(() => props.steps[index.value] || null);

const TOUR_ROUTE_DURATION_MS = 300;
const TARGET_LOOKUP_TIMEOUT_MS = 2000;
const SHADOW_LOOKUP_INTERVAL_MS = 60;
const BASE_LAYER_Z_INDEX = 20_000;

const boxStyle = ref({
	top: '0px',
	left: '0px',
	width: '0px',
	height: '0px',
	display: 'none',
	zIndex: `${BASE_LAYER_Z_INDEX + 1}`
});
const dimStyle = ref({
	top: '-50vh',
	left: '-50vw',
	width: '0px',
	height: '0px'
});
const tooltipStyle = ref({
	top: '0px',
	left: 'auto',
	right: 'auto',
	maxWidth: 'none',
	transform: 'none',
	zIndex: `${BASE_LAYER_Z_INDEX + 2}`
});
const dimZIndex = ref(`${BASE_LAYER_Z_INDEX}`);
// theme-aware dim so contrast holds on bright light-mode content
const dimColor = ref('rgba(0, 0, 0, 0.55)');

function prefersDarkTheme(): boolean {
	if (!import.meta.client) return false;
	const root = document.documentElement;
	if (root.classList.contains('dark') || document.body.classList.contains('dark')) return true;
	if (root.classList.contains('light') || document.body.classList.contains('light')) return false;
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function refreshDimColor() {
	dimColor.value = prefersDarkTheme() ? 'rgba(0, 0, 0, 0.62)' : 'rgba(15, 23, 42, 0.48)';
}

// element focused before the tour took over, restored on close for a11y
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'ion-button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(', ');

function getCardFocusables(): HTMLElement[] {
	if (!tooltipCard.value) return [];
	return Array.from(tooltipCard.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(el) => el.offsetParent !== null || el === document.activeElement
	);
}

// move focus into the card (primary/next button, else the card itself)
function focusCard() {
	if (!import.meta.client || !isActive.value || !tooltipCard.value) return;
	const focusables = getCardFocusables();
	// prefer the enabled next button, else the last enabled control, else the card container
	const primary = focusables.find((el) => el.hasAttribute('data-tour-next'));
	const target = primary || focusables[focusables.length - 1] || tooltipCard.value;
	target?.focus?.();
}

// keep Tab inside the card while the dialog is open
function onCardKeydown(event: KeyboardEvent) {
	if (event.key !== 'Tab') return;
	const focusables = getCardFocusables();
	if (focusables.length === 0) return;

	const first = focusables[0]!;
	const last = focusables[focusables.length - 1]!;
	const active = (document.activeElement as HTMLElement | null) ?? null;
	const outside = !tooltipCard.value?.contains(active);
	const atFirst = !!active && (active === first || first.contains(active));
	const atLast = !!active && (active === last || last.contains(active));

	if (event.shiftKey && (atFirst || outside)) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && (atLast || outside)) {
		event.preventDefault();
		first.focus();
	}
}

const busy = ref(false);
const advancing = ref(false);
const regressing = ref(false);
const ctaLoading = ref(false);

let currentElementId: string | null = null;

// observers for tracking position of the highlighted element and changes in the DOM
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let observedElement: HTMLElement | null = null;

// active layer container (modal/popover) so highlight stays above and modal does not close
let activeLayerContainer: HTMLElement | null = null;
let hasScrolledToFallbackTooltip = false;
let missingElementWarningId: string | null = null;
let lastShadowLookupAt = 0;
let displayToken = 0;
const trackedScrollContainers = new Set<HTMLElement>();
const stepAnimKey = ref(0);
let safeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function refreshSafeAreaInsets() {
	if (!import.meta.client) return;

	const probe = document.createElement('div');
	probe.style.cssText =
		'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
		'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
	document.body.appendChild(probe);
	const cs = window.getComputedStyle(probe);
	safeAreaInsets = {
		top: Number.parseFloat(cs.paddingTop) || 0,
		right: Number.parseFloat(cs.paddingRight) || 0,
		bottom: Number.parseFloat(cs.paddingBottom) || 0,
		left: Number.parseFloat(cs.paddingLeft) || 0
	};
	probe.remove();
}

const ionicOverlaySelector = [
	'ion-modal',
	'ion-popover',
	'ion-action-sheet',
	'ion-alert',
	'ion-loading',
	'ion-picker'
].join(', ');

const ionicTeleportSafeOverlays = ['ion-modal', 'ion-popover', 'ion-alert', 'ion-action-sheet'];

const ionicOverlayEvents = [
	'ionModalDidPresent',
	'ionModalDidDismiss',
	'ionPopoverDidPresent',
	'ionPopoverDidDismiss',
	'ionActionSheetDidPresent',
	'ionActionSheetDidDismiss',
	'ionAlertDidPresent',
	'ionAlertDidDismiss'
];

const isActive = computed(() => isActiveTour(props.tourId));
const isLoggedIn = computed(() => !!useCurrentSessionToken());

defineExpose({
	isActive,
	currentStep: step,
	highlightBox
});

const visibleSteps = computed(() => props.steps.filter((s) => !shouldSkipStep(s)));

const visibleStepIndex = computed(() => {
	let count = 0;
	for (let i = 0; i < index.value && i < props.steps.length; i++) {
		const s = props.steps[i];
		if (s && !shouldSkipStep(s)) count++;
	}
	return count;
});

const isLastVisibleStep = computed(() => visibleStepIndex.value >= visibleSteps.value.length - 1);

const showPulse = computed(() => {
	if (step.value?.pulse === false) return false;
	if (props.pulse === false) return false;
	if (step.value?.pulse === true) return true;
	if (props.pulse === true) return true;
	return true; // default-on for new visual feedback
});

const showDim = computed(() => {
	if (!isActive.value) return false;
	if (step.value?.dim === false) return false;
	if (step.value?.dim === true) return true;
	return !!props.dim;
});

const allowInteraction = computed(() => step.value?.interactive === true);

const effectiveRadius = computed(() => {
	if (typeof step.value?.radius === 'number') return step.value.radius;
	return 10;
});

const tourSlide = (baseEl: HTMLElement, opts?: Record<string, unknown>) => {
	return slide(baseEl, {
		...opts,
		duration: TOUR_ROUTE_DURATION_MS
	});
};

function nextAnimationFrame(): Promise<void> {
	return new Promise((resolve) => {
		if (!import.meta.client) {
			setTimeout(resolve, 0);
			return;
		}

		requestAnimationFrame(() => resolve());
	});
}

function normalizeRouteTarget(route: string): string {
	if (!import.meta.client) return route;

	const normalized = new URL(route, window.location.origin);
	return `${normalized.pathname}${normalized.search}${normalized.hash}`;
}

function getCurrentRouteTarget(): string {
	if (!import.meta.client) return '';
	return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function shouldSkipStep(s: SiteTourStep): boolean {
	if (s.anonymous === true && isLoggedIn.value) return true;
	if (s.anonymous === false && !isLoggedIn.value) return true;
	if (s.condition && !s.condition()) return true;
	return false;
}

async function waitForElement(id: string, timeout: number): Promise<HTMLElement | null> {
	const existing = document.getElementById(id) || findElementByIdIncludingShadow(id);
	if (existing) return existing;
	if (timeout <= 0) return null;

	return new Promise((resolve) => {
		const start = Date.now();
		const interval = SHADOW_LOOKUP_INTERVAL_MS;

		const tick = () => {
			const el = document.getElementById(id) || findElementByIdIncludingShadow(id);
			if (el) {
				resolve(el);
				return;
			}
			if (Date.now() - start >= timeout) {
				resolve(null);
				return;
			}
			setTimeout(tick, interval);
		};

		setTimeout(tick, interval);
	});
}

async function waitForCondition(check: () => boolean, timeout: number): Promise<boolean> {
	if (check()) return true;
	const start = Date.now();
	return new Promise((resolve) => {
		const interval = 80;
		const tick = () => {
			if (check()) {
				resolve(true);
				return;
			}
			if (Date.now() - start >= timeout) {
				resolve(false);
				return;
			}
			setTimeout(tick, interval);
		};
		setTimeout(tick, interval);
	});
}

async function executeActions(actions: SiteTourStepAction[] | undefined) {
	if (!actions || actions.length === 0) return;

	for (const action of actions) {
		if (action.delay && action.delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, action.delay));
		}

		const target = action.target
			? document.getElementById(action.target) || findElementByIdIncludingShadow(action.target)
			: null;

		switch (action.type) {
			case 'click':
				if (target instanceof HTMLElement) {
					target.click();
				}
				break;
			case 'focus':
				if (target instanceof HTMLElement) {
					target.focus({ preventScroll: false });
				}
				break;
			case 'scroll':
				if (target instanceof HTMLElement) {
					target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
				}
				break;
			case 'set-value':
				if (
					(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
					typeof action.value === 'string'
				) {
					target.value = action.value;
					target.dispatchEvent(new Event('input', { bubbles: true }));
					target.dispatchEvent(new Event('change', { bubbles: true }));
				}
				break;
			case 'dispatch-event':
				if (target instanceof HTMLElement && action.event) {
					target.dispatchEvent(new CustomEvent(action.event, { bubbles: true }));
				}
				break;
			case 'wait':
				// already handled above via delay
				break;
		}
	}
}

async function navigateToStepRoute(route: string) {
	const targetRoute = normalizeRouteTarget(route);

	if (!import.meta.client) {
		router.push(targetRoute, tourSlide);
		return;
	}

	if (getCurrentRouteTarget() !== targetRoute) {
		router.push(targetRoute, tourSlide);
	}
}

async function display() {
	const token = ++displayToken;
	busy.value = true;

	try {
		if (index.value < 0 || index.value >= props.steps.length) {
			close({ completed: true });
			return;
		}

		if (step.value === null) {
			close({ completed: true });
			return;
		}

		const currentStep = step.value;

		if (shouldSkipStep(currentStep)) {
			index.value++;
			if (token !== displayToken) return;
			await display();
			return;
		}

		destroyTourHighlight();

		dimStyle.value = { top: '50%', left: '50%', width: '0px', height: '0px' };

		if (currentStep.url) {
			await navigateToStepRoute(currentStep.url);
			if (token !== displayToken) return;
			await nextTick();
		}

		if (currentStep.delay && currentStep.delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, currentStep.delay));
			if (token !== displayToken) return;
		}

		if (currentStep.waitFor) {
			const waited = await waitForCondition(() => {
				const id = currentStep.waitFor!;
				const el = document.getElementById(id) || findElementByIdIncludingShadow(id);
				return !!el;
			}, currentStep.waitTimeout ?? 2500);
			if (!waited) {
				console.warn(
					`Tour "${props.tourId}" timed out waiting for waitFor element "${currentStep.waitFor}".`
				);
			}
			if (token !== displayToken) return;
		}

		if (currentStep.id) {
			// hydration-tolerant target lookup avoids highlighting a stale element
			// while the next page or shadow root mounts
			await waitForElement(currentStep.id, currentStep.waitTimeout ?? TARGET_LOOKUP_TIMEOUT_MS);
			if (token !== displayToken) return;
		}

		await executeActions(currentStep.actions);
		if (token !== displayToken) return;

		createTourHighlight(currentStep.id);

		try {
			await currentStep.onEnter?.();
		} catch (err) {
			console.warn(`Tour step onEnter failed:`, err);
		}
	} finally {
		if (token === displayToken) {
			busy.value = false;
			advancing.value = false;
			regressing.value = false;
		}
	}
}

function prerenderRouteIfSupported(route: string) {
	if (typeof window === 'undefined') return;

	const dynamicGlobal = globalThis as {
		prerenderRoutes?: (routes: string | string[]) => void;
	};

	if (typeof dynamicGlobal.prerenderRoutes === 'function') {
		dynamicGlobal.prerenderRoutes(route);
	}
}

async function gotoNextStep() {
	if (busy.value) return;
	advancing.value = true;
	const oldStep = index.value;

	const currentStep = props.steps[oldStep];
	try {
		await currentStep?.onExit?.();
	} catch (err) {
		console.warn('Tour step onExit failed:', err);
	}

	const nextIndex = oldStep + 1;
	if (nextIndex < props.steps.length) {
		const nextStep = props.steps[nextIndex];
		if (nextStep?.prerendered && nextStep?.url) {
			prerenderRouteIfSupported(nextStep.url);
		}
	}

	if (nextIndex >= props.steps.length) {
		emit('next-step', oldStep);
		close({ completed: true });
		return;
	}

	index.value = nextIndex;
	// keep shared tour state in sync so app.vue can persist a resume step on close
	if (activeStepIndex.value !== nextIndex) goToStep(nextIndex);
	await display();
	emit('next-step', oldStep);
}

async function gotoPreviousStep() {
	if (busy.value) return;
	regressing.value = true;
	const oldStep = index.value;

	const currentStep = props.steps[oldStep];
	try {
		await currentStep?.onExit?.();
	} catch (err) {
		console.warn('Tour step onExit failed:', err);
	}

	let newIndex = oldStep - 1;
	while (newIndex >= 0) {
		const s = props.steps[newIndex];
		if (s && shouldSkipStep(s)) {
			newIndex--;
		} else {
			break;
		}
	}
	if (newIndex < 0) newIndex = 0;

	index.value = newIndex;
	// keep shared tour state in sync so app.vue can persist a resume step on close
	if (activeStepIndex.value !== newIndex) goToStep(newIndex);
	await display();
	emit('prev-step', oldStep);
}

async function runCTA() {
	const cta = step.value?.cta;
	if (!cta) return;
	if (ctaLoading.value) return;

	ctaLoading.value = true;
	try {
		await cta.handler();
		if (cta.closeOnSuccess) {
			close({ completed: false });
			return;
		}
		if (cta.advance !== false) {
			await gotoNextStep();
		}
	} catch (err) {
		console.error('Tour CTA handler failed:', err);
	} finally {
		ctaLoading.value = false;
	}
}

function close(options: { completed?: boolean } = {}) {
	const wasActive = isActive.value;
	destroyTourHighlight();

	if (wasActive) {
		if (options.completed) {
			emit('complete-tour');
			if (props.persist !== false) {
				markCompleted(props.tourId);
			}
		}
		emit('close-tour');
		stopTour({ completed: options.completed });
	}

	index.value = 0;
}

function onBackdropClick() {
	if (props.allowSkip === false) return;
	close({ completed: false });
}

function parseNumericZIndex(value: string): number | null {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed)) return null;
	return parsed;
}

const LAYER_CONTAINER_SELECTOR = [
	'[role="dialog"]',
	'[aria-modal="true"]',
	'[data-radix-dialog-content]',
	'[data-reka-dialog-content]',
	'[data-radix-popper-content-wrapper]',
	'[data-reka-popper-content-wrapper]',
	'ion-modal',
	'ion-popover',
	'ion-action-sheet',
	'ion-alert',
	'ion-loading',
	'ion-picker'
].join(', ');

function getElementParentAcrossShadow(element: HTMLElement): HTMLElement | null {
	if (element.parentElement) {
		return element.parentElement;
	}

	const root = element.getRootNode();
	if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
		return root.host;
	}

	return null;
}

function escapeCssId(id: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(id);
	}

	return id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function findElementByIdIncludingShadow(
	id: string,
	root: ParentNode = document
): HTMLElement | null {
	const escapedId = escapeCssId(id);
	const element = root.querySelector<HTMLElement>(`#${escapedId}`);
	if (element) {
		return element;
	}

	const allElements = root.querySelectorAll<HTMLElement>('*');
	for (const candidate of allElements) {
		if (!candidate.shadowRoot) continue;
		const nestedMatch = findElementByIdIncludingShadow(id, candidate.shadowRoot);
		if (nestedMatch) {
			return nestedMatch;
		}
	}

	return null;
}

function resolveCurrentElement(): HTMLElement | null {
	if (!currentElementId) {
		return null;
	}

	if (observedElement?.isConnected && observedElement.id === currentElementId) {
		return observedElement;
	}

	const directMatch = document.getElementById(currentElementId);
	if (directMatch) {
		return directMatch;
	}

	const now = Date.now();
	if (now - lastShadowLookupAt < SHADOW_LOOKUP_INTERVAL_MS) {
		return null;
	}
	lastShadowLookupAt = now;

	return findElementByIdIncludingShadow(currentElementId);
}

function findTopVisibleIonicOverlay(): HTMLElement | null {
	const overlays = Array.from(document.querySelectorAll<HTMLElement>(ionicOverlaySelector));
	for (let i = overlays.length - 1; i >= 0; i--) {
		const overlay = overlays[i];
		if (!overlay) continue;
		if (overlay.classList.contains('overlay-hidden')) continue;
		if (overlay.getAttribute('aria-hidden') === 'true') continue;
		if (window.getComputedStyle(overlay).display === 'none') continue;
		return overlay;
	}

	return null;
}

function isClippingContainer(element: HTMLElement): boolean {
	if (!import.meta.client) return false;
	const style = window.getComputedStyle(element);
	const clips = (v: string) => v === 'hidden' || v === 'clip';
	return clips(style.overflow) || clips(style.overflowX) || clips(style.overflowY);
}

function canTeleportToLayerContainer(layerContainer: HTMLElement): boolean {
	if (isClippingContainer(layerContainer)) return false;
	if (!layerContainer.matches(ionicOverlaySelector)) {
		return true;
	}

	return ionicTeleportSafeOverlays.includes(layerContainer.tagName.toLowerCase());
}

function findLayerContainer(element?: HTMLElement | null): HTMLElement | null {
	if (!element) return null;

	let current: HTMLElement | null = element;
	while (current) {
		if (current.matches(LAYER_CONTAINER_SELECTOR)) {
			return current;
		}

		const closest = current.closest<HTMLElement>(LAYER_CONTAINER_SELECTOR);
		if (closest) {
			return closest;
		}

		current = getElementParentAcrossShadow(current);
	}

	return null;
}

function updateOverlayTeleportTarget(targetElement?: HTMLElement | null) {
	if (!import.meta.client) return;

	const layerContainer = findLayerContainer(targetElement);
	if (layerContainer) {
		activeLayerContainer = layerContainer;
		overlayTeleportTarget.value = canTeleportToLayerContainer(layerContainer)
			? layerContainer
			: 'body';
		return;
	}

	const openIonicOverlay = findTopVisibleIonicOverlay();
	if (openIonicOverlay) {
		activeLayerContainer = openIonicOverlay;
		overlayTeleportTarget.value = canTeleportToLayerContainer(openIonicOverlay)
			? openIonicOverlay
			: 'body';
		return;
	}

	if (activeLayerContainer?.isConnected) {
		overlayTeleportTarget.value = activeLayerContainer;
		return;
	}

	activeLayerContainer = null;
	overlayTeleportTarget.value = 'body';
}

function applyLayerZIndex(targetElement?: HTMLElement | null) {
	let layerZIndex = BASE_LAYER_Z_INDEX;
	let current: HTMLElement | null = targetElement || null;

	while (current) {
		const zIndex = parseNumericZIndex(window.getComputedStyle(current).zIndex);
		if (zIndex !== null) {
			layerZIndex = Math.max(layerZIndex, zIndex + 2);
		}
		current = getElementParentAcrossShadow(current);
	}

	dimZIndex.value = `${layerZIndex}`;
	boxStyle.value.zIndex = `${layerZIndex + 1}`;
	tooltipStyle.value.zIndex = `${layerZIndex + 2}`;
}

function isScrollableContainer(element: HTMLElement): boolean {
	const style = window.getComputedStyle(element);
	const hasVerticalScroll =
		/(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
	const hasHorizontalScroll =
		/(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
	return hasVerticalScroll || hasHorizontalScroll;
}

function trackScrollContainer(element: HTMLElement) {
	if (trackedScrollContainers.has(element)) return;

	element.addEventListener('scroll', updateBoxPosition, { passive: true });
	trackedScrollContainers.add(element);
}

function clearTrackedScrollContainers() {
	for (const container of trackedScrollContainers) {
		container.removeEventListener('scroll', updateBoxPosition);
	}

	trackedScrollContainers.clear();
}

function updateTrackedScrollContainers(element: HTMLElement) {
	clearTrackedScrollContainers();

	let current: HTMLElement | null = element;
	while (current) {
		if (isScrollableContainer(current)) {
			trackScrollContainer(current);
		}

		if (current.tagName.toLowerCase() === 'ion-content' && current.shadowRoot) {
			const ionContentScroller = current.shadowRoot.querySelector<HTMLElement>(
				'.inner-scroll, .scroll-y, main'
			);
			if (ionContentScroller) {
				trackScrollContainer(ionContentScroller);
			}
		}

		current = getElementParentAcrossShadow(current);
	}
}

function scrollTargetIntoView(element: HTMLElement) {
	element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

	const scrollableAncestors: HTMLElement[] = [];
	let current: HTMLElement | null = getElementParentAcrossShadow(element);
	while (current) {
		if (isScrollableContainer(current)) {
			scrollableAncestors.push(current);
		}
		current = getElementParentAcrossShadow(current);
	}

	const padding = 16;
	for (const ancestor of scrollableAncestors) {
		const elementRect = element.getBoundingClientRect();
		const ancestorRect = ancestor.getBoundingClientRect();

		if (
			elementRect.top < ancestorRect.top + padding ||
			elementRect.bottom > ancestorRect.bottom - padding
		) {
			const centeredTop =
				ancestor.scrollTop +
				elementRect.top -
				ancestorRect.top -
				ancestor.clientHeight / 2 +
				elementRect.height / 2;
			ancestor.scrollTo({ top: Math.max(0, centeredTop), behavior: 'smooth' });
		}
	}
}

function ensureObserversForTarget(element: HTMLElement) {
	if (observedElement === element) return;

	if (resizeObserver) {
		resizeObserver.disconnect();
	}

	resizeObserver = new ResizeObserver(() => {
		updateBoxPosition();
	});
	resizeObserver.observe(element);

	// scope mutations to the target's overlay/layer container (or offsetParent) so we
	// do not re-run positioning on every unrelated dashboard-feed mutation
	if (mutationObserver) {
		mutationObserver.disconnect();
	}
	const mutationRoot =
		findLayerContainer(element) ||
		(element.offsetParent as HTMLElement | null) ||
		element.parentElement ||
		document.body;
	mutationObserver = new MutationObserver(() => {
		updateBoxPosition();
	});
	mutationObserver.observe(mutationRoot, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['style', 'class']
	});

	observedElement = element;
	updateTrackedScrollContainers(element);
}

function ensureGlobalPositionObservers() {
	window.addEventListener('scroll', updateBoxPosition, true);
	document.addEventListener('scroll', updateBoxPosition, true);
	window.addEventListener('resize', updateBoxPosition);
	window.addEventListener('resize', refreshSafeAreaInsets);
	for (const eventName of ionicOverlayEvents) {
		document.addEventListener(eventName, updateBoxPosition as EventListener);
	}
}

let updateTicking = false;
function updateBoxPosition() {
	if (!currentElementId) return;
	if (updateTicking) return;

	updateTicking = true;
	requestAnimationFrame(() => {
		if (!currentElementId) {
			updateTicking = false;
			return;
		}

		const element = resolveCurrentElement();

		if (!element) {
			if (missingElementWarningId !== currentElementId) {
				console.warn(`Element with id "${currentElementId}" not found for tour highlight.`);
				missingElementWarningId = currentElementId;
			}
			updateOverlayTeleportTarget();
			applyLayerZIndex();
			positionFallbackTooltip();
			scrollToFallbackTooltip();
			updateTicking = false;
			return;
		}

		const rect = element.getBoundingClientRect();
		const hasVisibleBounds = rect.width > 0 || rect.height > 0;
		if (!hasVisibleBounds) {
			if (missingElementWarningId !== currentElementId) {
				console.warn(
					`Element with id "${currentElementId}" has no visible bounds, falling back to centered tour tooltip.`
				);
				missingElementWarningId = currentElementId;
			}
			updateOverlayTeleportTarget();
			applyLayerZIndex();
			positionFallbackTooltip();
			scrollToFallbackTooltip();
			updateTicking = false;
			return;
		}
		missingElementWarningId = null;

		updateOverlayTeleportTarget(element);
		ensureObserversForTarget(element);
		applyLayerZIndex(element);

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		const padding =
			typeof step.value?.highlightPadding === 'number' ? step.value.highlightPadding : 8;
		let top = rect.top - padding;
		let left = rect.left - padding;
		let width = rect.width + padding * 2;
		let height = rect.height + padding * 2;

		// clamp highlight + cutout inside the safe-area viewport so a target near the
		// notch / dynamic island / home indicator never sits under the system bars
		const minX = safeAreaInsets.left;
		const minY = safeAreaInsets.top;
		const maxX = viewportWidth - safeAreaInsets.right;
		const maxY = viewportHeight - safeAreaInsets.bottom;

		if (left < minX) {
			width -= minX - left;
			left = minX;
		}
		if (top < minY) {
			height -= minY - top;
			top = minY;
		}
		if (left + width > maxX) {
			width = maxX - left;
		}
		if (top + height > maxY) {
			height = maxY - top;
		}

		width = Math.max(width, 0);
		height = Math.max(height, 0);

		boxStyle.value = {
			...boxStyle.value,
			top: `${top}px`,
			left: `${left}px`,
			width: `${width}px`,
			height: `${height}px`,
			display: 'block'
		};

		dimStyle.value = {
			top: `${top}px`,
			left: `${left}px`,
			width: `${width}px`,
			height: `${height}px`
		};

		updateTooltipPosition(top, left, width, height, viewportWidth, viewportHeight);
		hasScrolledToFallbackTooltip = false;
		updateTicking = false;
	});
}

function positionFallbackTooltip() {
	const padding = 16;
	boxStyle.value = {
		...boxStyle.value,
		display: 'none'
	};

	dimStyle.value = {
		top: '50%',
		left: '50%',
		width: '0px',
		height: '0px'
	};

	tooltipStyle.value = {
		...tooltipStyle.value,
		top: `${padding + safeAreaInsets.top}px`,
		left: '50%',
		right: 'auto',
		maxWidth: '90vw',
		transform: 'translateX(-50%)'
	};
}

function scrollToFallbackTooltip() {
	if (hasScrolledToFallbackTooltip) return;
	hasScrolledToFallbackTooltip = true;

	nextTick(() => {
		if (!tooltipCard.value) return;

		const rect = tooltipCard.value.getBoundingClientRect();
		const padding = 16;
		const topPadding = padding + safeAreaInsets.top;

		if (rect.top >= topPadding && rect.bottom <= window.innerHeight - padding) {
			return;
		}

		const targetTop = Math.max(0, window.scrollY + rect.top - topPadding);
		window.scrollTo({ top: targetTop, behavior: 'smooth' });
	});
}

function updateTooltipPosition(
	boxTop: number,
	boxLeft: number,
	boxWidth: number,
	boxHeight: number,
	viewportWidth: number,
	viewportHeight: number
) {
	const tooltipOffset = 12;
	const padding = 16;
	// keep the card clear of the notch / dynamic island and the home indicator
	const topPadding = padding + safeAreaInsets.top;
	const bottomPadding = padding + safeAreaInsets.bottom;
	const maxTooltipWidth = Math.max(280, Math.min(viewportWidth - padding * 2, 800));

	let tooltipWidth = 0;
	let tooltipHeight = 0;
	if (tooltipCard.value) {
		tooltipWidth = tooltipCard.value.offsetWidth || maxTooltipWidth;
		tooltipHeight = tooltipCard.value.offsetHeight || 220;
	} else {
		tooltipWidth = maxTooltipWidth;
		tooltipHeight = 220;
	}
	tooltipWidth = Math.min(tooltipWidth, maxTooltipWidth);

	const placement: SiteTourStepPlacement = step.value?.placement || 'auto';

	const belowTop = boxTop + boxHeight + tooltipOffset;
	const aboveTop = boxTop - tooltipHeight - tooltipOffset;
	const fitsBelow = belowTop + tooltipHeight <= viewportHeight - bottomPadding;
	const fitsAbove = aboveTop >= topPadding;

	let tooltipTop = belowTop;
	let tooltipLeft = boxLeft + boxWidth / 2 - tooltipWidth / 2;

	if (placement === 'center') {
		tooltipTop = Math.max(topPadding, viewportHeight / 2 - tooltipHeight / 2);
		tooltipLeft = Math.max(padding, viewportWidth / 2 - tooltipWidth / 2);
	} else if (placement === 'top' && fitsAbove) {
		tooltipTop = aboveTop;
	} else if (placement === 'bottom' && fitsBelow) {
		tooltipTop = belowTop;
	} else if (placement === 'left') {
		tooltipTop = boxTop + boxHeight / 2 - tooltipHeight / 2;
		tooltipLeft = boxLeft - tooltipWidth - tooltipOffset;
	} else if (placement === 'right') {
		tooltipTop = boxTop + boxHeight / 2 - tooltipHeight / 2;
		tooltipLeft = boxLeft + boxWidth + tooltipOffset;
	} else {
		// auto
		if (!fitsBelow && fitsAbove) {
			tooltipTop = aboveTop;
		} else if (!fitsBelow && !fitsAbove) {
			tooltipTop = Math.max(topPadding, viewportHeight - tooltipHeight - bottomPadding);
		}
	}

	tooltipLeft = Math.max(padding, Math.min(tooltipLeft, viewportWidth - tooltipWidth - padding));
	tooltipTop = Math.max(
		topPadding,
		Math.min(tooltipTop, viewportHeight - tooltipHeight - bottomPadding)
	);

	tooltipStyle.value = {
		...tooltipStyle.value,
		top: `${tooltipTop}px`,
		left: `${tooltipLeft}px`,
		right: 'auto',
		maxWidth: `${maxTooltipWidth}px`,
		transform: 'none'
	};
}

function createTourHighlight(id?: string) {
	currentElementId = id ?? null;
	hasScrolledToFallbackTooltip = false;
	lastShadowLookupAt = 0;
	refreshSafeAreaInsets();
	refreshDimColor();
	stepAnimKey.value++;

	const activeElement = document.activeElement;
	const currentActiveElement = activeElement instanceof HTMLElement ? activeElement : null;
	updateOverlayTeleportTarget(currentActiveElement);
	applyLayerZIndex(currentActiveElement);

	if (!id) {
		positionFallbackTooltip();
		scrollToFallbackTooltip();
		return;
	}

	ensureGlobalPositionObservers();

	const element = resolveCurrentElement();

	if (element) {
		updateOverlayTeleportTarget(element);
		scrollTargetIntoView(element);
		ensureObserversForTarget(element);
	}

	updateBoxPosition();
}

function destroyTourHighlight() {
	boxStyle.value = {
		...boxStyle.value,
		display: 'none'
	};
	currentElementId = null;
	observedElement = null;
	activeLayerContainer = null;
	hasScrolledToFallbackTooltip = false;
	missingElementWarningId = null;
	lastShadowLookupAt = 0;
	overlayTeleportTarget.value = 'body';
	clearTrackedScrollContainers();

	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	if (mutationObserver) {
		mutationObserver.disconnect();
		mutationObserver = null;
	}
	if (import.meta.client) {
		window.removeEventListener('scroll', updateBoxPosition, true);
		document.removeEventListener('scroll', updateBoxPosition, true);
		window.removeEventListener('resize', updateBoxPosition);
		window.removeEventListener('resize', refreshSafeAreaInsets);
		for (const eventName of ionicOverlayEvents) {
			document.removeEventListener(eventName, updateBoxPosition as EventListener);
		}
	}
}

onMounted(() => {
	registerTour({
		id: props.tourId,
		name: props.name,
		steps: props.steps,
		dim: props.dim,
		pulse: props.pulse,
		allowSkip: props.allowSkip,
		persist: props.persist
	});
});

// stored so we can tear it down on unmount (was a leaked anonymous listener)
let onKeydown: ((event: KeyboardEvent) => void) | null = null;

onUnmounted(() => {
	unregisterTour(props.tourId);
	destroyTourHighlight();
	if (import.meta.client && onKeydown) {
		window.removeEventListener('keydown', onKeydown);
		onKeydown = null;
	}
});

if (import.meta.client) {
	watch(isActive, (active) => {
		if (active) {
			// capture focus before the dialog takes over, restore it on close
			previouslyFocused =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
			index.value = Math.max(0, Math.min(activeStepIndex.value || 0, props.steps.length - 1));
			if (props.steps.length > 0) {
				display();
			}
		} else {
			destroyTourHighlight();
			index.value = 0;
			const toRestore = previouslyFocused;
			previouslyFocused = null;
			if (toRestore?.isConnected) nextTick(() => toRestore.focus?.());
		}
	});

	watch(activeStepIndex, (newIdx) => {
		if (!isActive.value) return;
		if (newIdx === index.value) return;
		const clamped = Math.max(0, Math.min(newIdx, props.steps.length - 1));
		if (clamped !== index.value) {
			index.value = clamped;
			display();
		}
	});

	// move focus into the card on each step render for a11y
	watch(stepAnimKey, () => {
		if (!isActive.value) return;
		nextTick(() => focusCard());
	});

	// keyboard navigation - mostly useful on iPad / web, harmless on phones
	onKeydown = (event: KeyboardEvent) => {
		if (!isActive.value) return;
		if (event.key === 'Escape' && props.allowSkip !== false) {
			event.preventDefault();
			close({ completed: false });
		} else if (event.key === 'ArrowRight' && !busy.value) {
			event.preventDefault();
			gotoNextStep();
		} else if (event.key === 'ArrowLeft' && !busy.value && index.value > 0) {
			event.preventDefault();
			gotoPreviousStep();
		}
	};
	window.addEventListener('keydown', onKeydown);
}

// hardware-back support: when a tour is active, intercept back to close the tour first.
// priority 100 wins over the global router-back handler (10).
useBackButton(100, (processNextHandler) => {
	if (isActive.value) {
		if (props.allowSkip !== false) {
			close({ completed: false });
		}
		return;
	}
	processNextHandler();
});
</script>

<style scoped>
.site-tour-highlight {
	/* earth primary green (30, 187, 72) to match the app palette */
	border: 2px solid rgb(30, 187, 72);
	box-shadow:
		0 0 0 4px rgba(30, 187, 72, 0.2),
		0 0 14px rgba(30, 187, 72, 0.55);
	background: transparent;
	transition:
		top 260ms cubic-bezier(0.22, 1, 0.36, 1),
		left 260ms cubic-bezier(0.22, 1, 0.36, 1),
		width 260ms cubic-bezier(0.22, 1, 0.36, 1),
		height 260ms cubic-bezier(0.22, 1, 0.36, 1),
		box-shadow 250ms ease;
	will-change: top, left, width, height;
}

.site-tour-card--enter {
	animation: site-tour-card-in 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes site-tour-card-in {
	from {
		opacity: 0;
		transform: translateY(8px) scale(0.98);
	}
	to {
		opacity: 1;
		transform: none;
	}
}

.site-tour-highlight--pulse {
	animation: site-tour-pulse 1.6s ease-in-out infinite;
}

@keyframes site-tour-pulse {
	0%,
	100% {
		box-shadow:
			0 0 0 4px rgba(30, 187, 72, 0.2),
			0 0 12px rgba(30, 187, 72, 0.45);
	}
	50% {
		box-shadow:
			0 0 0 10px rgba(30, 187, 72, 0.06),
			0 0 22px rgba(30, 187, 72, 0.7);
	}
}

.site-tour-card {
	/* theme-aware earth-palette wash over the ionic card surface */
	--background:
		linear-gradient(
			155deg,
			rgba(30, 187, 72, 0.12) 0%,
			rgba(23, 79, 150, 0.08) 55%,
			rgba(30, 187, 72, 0) 100%
		),
		var(--ion-card-background, var(--ion-background-color, #ffffff));
	border-color: rgba(30, 187, 72, 0.85) !important;
}

:global(html.dark) .site-tour-card,
:global(body.dark) .site-tour-card {
	--background:
		linear-gradient(
			155deg,
			rgba(30, 187, 72, 0.22) 0%,
			rgba(23, 79, 150, 0.16) 55%,
			rgba(30, 187, 72, 0) 100%
		),
		var(--ion-card-background, var(--ion-background-color, #1a1b1e));
	border-color: rgba(53, 194, 90, 0.7) !important;
}

@media (prefers-color-scheme: dark) {
	:global(html:not(.light)) .site-tour-card,
	:global(body:not(.light)) .site-tour-card {
		--background:
			linear-gradient(
				155deg,
				rgba(30, 187, 72, 0.22) 0%,
				rgba(23, 79, 150, 0.16) 55%,
				rgba(30, 187, 72, 0) 100%
			),
			var(--ion-card-background, var(--ion-background-color, #1a1b1e));
		border-color: rgba(53, 194, 90, 0.7) !important;
	}
}

@media (prefers-reduced-motion: reduce) {
	.site-tour-highlight--pulse {
		animation: none;
	}
	.site-tour-card--enter {
		animation: none;
	}
	.site-tour-card-wrap {
		transition: none !important;
	}
}
</style>
