<template>
	<!-- tour start -->
	<Teleport :to="overlayTeleportTarget">
		<div
			v-if="isActive && boxStyle.display === 'block'"
			ref="highlightBox"
			:style="{
				position: 'fixed',
				top: boxStyle.top,
				left: boxStyle.left,
				width: boxStyle.width,
				height: boxStyle.height,
				border: '2px solid #3B82F6',
				borderRadius: '8px',
				boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
				transition: 'top 90ms linear, left 90ms linear, width 90ms linear, height 90ms linear',
				willChange: 'top, left, width, height',
				pointerEvents: 'none',
				zIndex: boxStyle.zIndex
			}"
		/>
		<div
			v-if="isActive && step"
			ref="tooltipCard"
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
				transition: 'top 100ms linear, left 100ms linear, transform 100ms linear',
				willChange: 'top, left, transform',
				zIndex: tooltipStyle.zIndex,
				pointerEvents: 'auto'
			}"
		>
			<IonCard
				class="shadow-lg min-w-70 w-[90vw] sm:w-[72vw] lg:w-[52vw] max-w-200 p-4 border-4 border-blue-600 rounded-lg"
			>
				<IonCardHeader class="pb-2">
					<div class="flex justify-between items-center gap-2">
						<h3 class="text-lg font-semibold m-0!">{{ step.title }}</h3>
						<IonButton
							fill="clear"
							size="small"
							color="medium"
							class="-mr-2"
							@click="close"
						>
							<UIcon
								name="i-heroicons-x-mark"
								class="size-4"
							/>
						</IonButton>
					</div>
				</IonCardHeader>

				<IonCardContent class="p-0!">
					<p class="text-sm! text-gray-600 dark:text-gray-400">
						{{ step.description }}
					</p>

					<div class="mt-1 flex flex-wrap items-center justify-between">
						<p
							v-if="step.footer"
							class="text-xs! text-gray-500 px-2"
						>
							{{ step.footer }}
						</p>
						<div class="flex flex-col gap-2 items-end w-full mt-2">
							<span class="text-xs! text-gray-500 text-center mx-2">
								Step {{ visibleStepIndex + 1 }} of {{ visibleSteps.length }}
							</span>
							<IonButton
								v-if="index > 1"
								fill="outline"
								color="primary"
								size="small"
								@click="gotoPreviousStep"
								class="w-30"
							>
								<UIcon
									name="i-heroicons-arrow-left"
									class="size-4 mr-1"
								/>
								<span>Previous</span>
							</IonButton>
							<IonButton
								fill="solid"
								color="primary"
								size="small"
								@click="gotoNextStep"
								class="w-30"
							>
								<span>{{ visibleStepIndex >= visibleSteps.length - 1 ? 'Finish' : 'Next' }}</span>
								<UIcon
									:name="
										visibleStepIndex >= visibleSteps.length - 1
											? 'i-heroicons-flag'
											: 'i-heroicons-arrow-right'
									"
									class="size-4 ml-1"
								/>
							</IonButton>
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
}>();

const emit = defineEmits<{
	(event: 'next-step', oldStep: number): void;
	(event: 'prev-step', oldStep: number): void;
	(event: 'close-tour'): void;
}>();

const { registerTour, unregisterTour, isActiveTour, stopTour } = useSiteTour();
const overlayTeleportTarget = ref<string | HTMLElement>('body');
const highlightBox = ref<HTMLElement | null>(null);
const tooltipCard = ref<HTMLElement | null>(null);
const router = useIonRouter();
const index = ref(0);
const step = computed(() => props.steps[index.value] || null);
const TOUR_ROUTE_DURATION_MS = 300;
const TARGET_LOOKUP_TIMEOUT_MS = 900;
const SHADOW_LOOKUP_INTERVAL_MS = 80;
const zBase = 20_000;
const boxStyle = ref({
	top: '0px',
	left: '0px',
	width: '0px',
	height: '0px',
	display: 'none',
	zIndex: `${zBase}`
});
const tooltipStyle = ref({
	top: '0px',
	left: 'auto',
	right: 'auto',
	maxWidth: 'none',
	transform: 'none',
	zIndex: `${zBase + 1}`
});

let currentElementId: string | null = null;

// observers for tracking position of the highlighted element and changes in the DOM
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let observedElement: HTMLElement | null = null;

// track active layer container (e.g. dialog or popover) to ensure the highlight is visible above it and to avoid
// closing modals or popovers when interacting with the tooltip
let activeLayerContainer: HTMLElement | null = null;
let hasScrolledToFallbackTooltip = false;
let missingElementWarningId: string | null = null;
let lastShadowLookupAt = 0;
const trackedScrollContainers = new Set<HTMLElement>();

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

// Filter steps based on user login status
const visibleSteps = computed(() => {
	return props.steps.filter((step) => {
		// If anonymous is undefined/blank, don't skip
		if (step.anonymous === undefined) return true;
		// If anonymous is true, skip if logged in
		if (step.anonymous === true) return !isLoggedIn.value;
		// If anonymous is false, skip if not logged in
		if (step.anonymous === false) return isLoggedIn.value;
		return true;
	});
});

// Get the current visible step index (0-based)
const visibleStepIndex = computed(() => {
	if (!isLoggedIn.value) {
		return index.value;
	}
	// Count how many non-anonymous steps come before the current index
	let count = 0;
	for (let i = 0; i < index.value && i < props.steps.length; i++) {
		const currentStep = props.steps[i];
		if (currentStep && !currentStep.anonymous) {
			count++;
		}
	}
	return count;
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

async function waitForStepTarget(targetId?: string) {
	await nextTick();

	if (!import.meta.client || !targetId) return;

	const deadline = Date.now() + TARGET_LOOKUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const directMatch = document.getElementById(targetId);
		if (directMatch) {
			return;
		}

		const now = Date.now();
		if (now - lastShadowLookupAt >= SHADOW_LOOKUP_INTERVAL_MS) {
			lastShadowLookupAt = now;
			if (findElementByIdIncludingShadow(targetId)) {
				return;
			}
		}

		await nextAnimationFrame();
	}
}

async function navigateToStepRoute(route: string, targetId?: string) {
	const targetRoute = normalizeRouteTarget(route);

	if (!import.meta.client) {
		router.push(targetRoute, tourSlide);
		return;
	}

	if (getCurrentRouteTarget() !== targetRoute) {
		router.push(targetRoute, tourSlide);
	}

	await waitForStepTarget(targetId);
}

async function display() {
	if (index.value < 0 || index.value >= props.steps.length) {
		// finished the tour
		close();
		return;
	}

	if (step.value === null) {
		// finished the tour
		close();
		return;
	}

	// Skip steps based on anonymous property and login status
	if (step.value?.anonymous !== undefined) {
		const shouldSkip =
			(step.value.anonymous === true && isLoggedIn.value) ||
			(step.value.anonymous === false && !isLoggedIn.value);
		if (shouldSkip) {
			index.value++;
			await display();
			return;
		}
	}

	// Clean up previous highlight
	destroyTourHighlight();
	if (step.value) {
		// Navigate to URL if provided
		if (step.value.url) {
			await navigateToStepRoute(step.value.url, step.value.id);
		} else {
			await waitForStepTarget(step.value.id);
		}

		// Create new highlight
		createTourHighlight(step.value.id);
	} else {
		console.warn(`No step found at index ${index.value}`);
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
	const oldStep = index.value;

	// Prepare next route only when runtime exposes route prerender support.
	const nextIndex = index.value + 1;
	if (nextIndex < props.steps.length) {
		const nextStep = props.steps[nextIndex];
		if (nextStep?.prerendered && nextStep?.url) {
			prerenderRouteIfSupported(nextStep.url);
		}
	}

	index.value++;
	await display();
	emit('next-step', oldStep);
}

async function gotoPreviousStep() {
	const oldStep = index.value;
	index.value--;

	// Skip steps based on anonymous property and login status (going backwards)
	while (index.value >= 0) {
		const currentStep = props.steps[index.value];
		if (currentStep?.anonymous !== undefined) {
			const shouldSkip =
				(currentStep.anonymous === true && isLoggedIn.value) ||
				(currentStep.anonymous === false && !isLoggedIn.value);
			if (shouldSkip) {
				index.value--;
			} else {
				break;
			}
		} else {
			break;
		}
	}

	await display();
	emit('prev-step', oldStep);
}

function close() {
	// Clean up highlight
	destroyTourHighlight();

	emit('close-tour');
	stopTour();
	index.value = 0;
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

function canTeleportToLayerContainer(layerContainer: HTMLElement): boolean {
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
	let layerZIndex = zBase;
	let current: HTMLElement | null = targetElement || null;

	while (current) {
		const zIndex = parseNumericZIndex(window.getComputedStyle(current).zIndex);
		if (zIndex !== null) {
			layerZIndex = Math.max(layerZIndex, zIndex + 2);
		}
		current = getElementParentAcrossShadow(current);
	}

	boxStyle.value.zIndex = `${layerZIndex}`;
	tooltipStyle.value.zIndex = `${layerZIndex + 1}`;
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

	observedElement = element;
	updateTrackedScrollContainers(element);
}

function ensureGlobalPositionObservers() {
	if (!mutationObserver) {
		mutationObserver = new MutationObserver(() => {
			updateBoxPosition();
		});
		mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class']
		});
	}

	window.addEventListener('scroll', updateBoxPosition, true);
	document.addEventListener('scroll', updateBoxPosition, true);
	window.addEventListener('resize', updateBoxPosition);
	for (const eventName of ionicOverlayEvents) {
		document.addEventListener(eventName, updateBoxPosition as EventListener);
	}
}

// Throttle update to prevent layout thrashing
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
			// Element not found - hide highlight box and center the tooltip
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
		missingElementWarningId = null;

		updateOverlayTeleportTarget(element);
		ensureObserversForTarget(element);
		applyLayerZIndex(element);

		// Batch all layout reads first
		const rect = element.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Calculate position with padding
		const padding = 8;
		let top = rect.top - padding;
		let left = rect.left - padding;
		let width = rect.width + padding * 2;
		let height = rect.height + padding * 2;

		// Ensure the box doesn't overflow off the viewport
		if (left < 0) {
			width += left;
			left = 0;
		}
		if (top < 0) {
			height += top;
			top = 0;
		}
		if (left + width > viewportWidth) {
			width = viewportWidth - left;
		}
		if (top + height > viewportHeight) {
			height = viewportHeight - top;
		}

		// Ensure minimum dimensions
		width = Math.max(width, 0);
		height = Math.max(height, 0);

		// Batch all DOM writes
		boxStyle.value = {
			...boxStyle.value,
			top: `${top}px`,
			left: `${left}px`,
			width: `${width}px`,
			height: `${height}px`,
			display: 'block'
		};

		// Calculate tooltip position (already computed values)
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

	tooltipStyle.value = {
		...tooltipStyle.value,
		top: `${padding}px`,
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

		if (rect.top >= padding && rect.bottom <= window.innerHeight - padding) {
			return;
		}

		const targetTop = Math.max(0, window.scrollY + rect.top - padding);
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
	const maxTooltipWidth = Math.max(280, Math.min(viewportWidth - padding * 2, 800));

	// Try to get actual tooltip dimensions, or use estimated values
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

	const belowTop = boxTop + boxHeight + tooltipOffset;
	const aboveTop = boxTop - tooltipHeight - tooltipOffset;
	const fitsBelow = belowTop + tooltipHeight <= viewportHeight - padding;
	const fitsAbove = aboveTop >= padding;

	let tooltipTop = belowTop;
	if (!fitsBelow && fitsAbove) {
		tooltipTop = aboveTop;
	} else if (!fitsBelow && !fitsAbove) {
		tooltipTop = Math.max(padding, viewportHeight - tooltipHeight - padding);
	}

	const boxCenter = boxLeft + boxWidth / 2;
	let tooltipLeft = boxCenter - tooltipWidth / 2;
	tooltipLeft = Math.max(padding, Math.min(tooltipLeft, viewportWidth - tooltipWidth - padding));

	tooltipTop = Math.max(padding, Math.min(tooltipTop, viewportHeight - tooltipHeight - padding));

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

	// Clean up observers and listeners
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	if (mutationObserver) {
		mutationObserver.disconnect();
		mutationObserver = null;
	}
	window.removeEventListener('scroll', updateBoxPosition, true);
	document.removeEventListener('scroll', updateBoxPosition, true);
	window.removeEventListener('resize', updateBoxPosition);
	for (const eventName of ionicOverlayEvents) {
		document.removeEventListener(eventName, updateBoxPosition as EventListener);
	}
}

// Register/unregister tour
onMounted(() => {
	registerTour({
		id: props.tourId,
		name: props.name,
		steps: props.steps
	});
});

onUnmounted(() => {
	unregisterTour(props.tourId);
	destroyTourHighlight();
});

// Watch for tour activation
if (import.meta.client) {
	watch(isActive, (active) => {
		if (active) {
			index.value = 0;
			if (props.steps.length > 0) {
				display();
			}
		} else {
			destroyTourHighlight();
			index.value = 0;
		}
	});
}
</script>
