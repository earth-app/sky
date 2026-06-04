<template>
	<IonCard
		v-if="hasContent"
		class="info-card-group mt-6 shadow-xl rounded-lg w-full max-w-full min-w-0 overflow-hidden p-4"
	>
		<div class="flex space-x-1 items-start mb-4">
			<div
				v-if="icon"
				class="flex"
			>
				<IonButton
					v-if="iconButton"
					color="light"
					fill="outline"
					class="mr-2"
					@click="emit('icon-click')"
				>
					<UIcon
						:name="icon"
						class="size-8 mr-2 mt-0.5"
					/>
				</IonButton>
				<UIcon
					v-else
					:name="icon"
					class="size-8 mr-2 mt-0.5"
				/>
			</div>
			<div class="flex flex-col items-start text-white light:text-gray-800 min-w-1/4">
				<h1 class="text-2xl! m-0!">{{ title }}</h1>
				<p
					v-if="description"
					class="text-gray-400 light:text-gray-700 text-sm mt-1 font-sans"
				>
					{{ description }}
				</p>
			</div>
		</div>
		<div
			ref="carouselViewport"
			class="relative overflow-hidden touch-pan-y w-full max-w-full min-w-0"
		>
			<div
				ref="carouselContainer"
				class="flex flex-row items-stretch flex-nowrap transition-transform duration-300 ease-out cursor-grab active:cursor-grabbing *:shrink-0 *:h-full *:px-2 *:w-(--slide-width) w-full"
				:style="{
					transform: `translateX(-${currentSlide * slideWidth}px)`,
					'--slide-width': slideWidth ? `${slideWidth}px` : '100%'
				}"
				@mousedown="startDrag"
				@mousemove="onDrag"
				@mouseup="endDrag"
				@mouseleave="endDrag"
				@touchstart="startTouch"
				@touchmove="onTouchMove"
				@touchend="endTouch"
			>
				<slot />
			</div>
		</div>

		<div class="flex flex-col items-center mt-4 gap-2">
			<div class="flex justify-center">
				<IonButton
					v-if="totalSlides > 1"
					fill="clear"
					aria-label="Previous slide"
					:disabled="currentSlide === 0 && !loop"
					@click="goToSlide(currentSlide - 1)"
				>
					<UIcon
						name="mdi:arrow-left-bold"
						class="size-6"
					/>
				</IonButton>

				<div
					v-if="!showProgress && showDots && totalSlides > 1 && !indicatorOverflow"
					class="flex items-center justify-center gap-2"
				>
					<button
						v-for="index in totalSlides"
						:key="index"
						type="button"
						class="size-2 rounded-full! transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						:class="currentSlide === index - 1 ? 'bg-primary w-4' : 'bg-gray-400 hover:bg-gray-300'"
						:aria-label="`Go to slide ${index}`"
						@click="goToSlide(index - 1)"
					/>
				</div>

				<div
					v-if="indicatorOverflow && totalSlides > 1"
					class="flex items-center justify-center px-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums"
					:aria-label="`Slide ${currentSlide + 1} of ${totalSlides}`"
				>
					{{ currentSlide + 1 }} / {{ totalSlides }}
				</div>

				<IonButton
					v-if="totalSlides > 1"
					fill="clear"
					aria-label="Next slide"
					:disabled="currentSlide === totalSlides - 1 && !loop"
					@click="goToSlide(currentSlide + 1)"
				>
					<UIcon
						name="mdi:arrow-right-bold"
						class="size-6"
					/>
				</IonButton>
			</div>

			<div
				v-if="showProgress && !indicatorOverflow"
				class="w-full px-8"
			>
				<IonProgressBar
					:value="progress"
					class="w-full"
					color="primary"
					height="4px"
				/>
			</div>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { Comment, Fragment, Text } from 'vue';

const props = defineProps<{
	title: string;
	description?: string;
	icon?: string;
	iconButton?: boolean;
	showProgress?: boolean;
	showDots?: boolean;
	loop?: boolean;
}>();

const emit = defineEmits<{
	(event: 'icon-click'): void;
}>();

// guard against empty-slot renders (header/footer would otherwise show as a hollow card)
const slots = useSlots();
const hasContent = computed(() => {
	const nodes = slots.default?.() ?? [];
	const flatten = (list: typeof nodes): boolean => {
		for (const node of list) {
			// comments + empty fragments are inert, real children imply renderable content
			if (node.type === Comment) continue;
			if (node.type === Fragment) {
				const children = Array.isArray(node.children) ? (node.children as typeof nodes) : [];
				if (flatten(children)) return true;
				continue;
			}
			if (node.type === Text && typeof node.children === 'string' && !node.children.trim())
				continue;
			return true;
		}
		return false;
	};
	return flatten(nodes);
});

const carouselViewport = ref<HTMLElement>();
const carouselContainer = ref<HTMLElement>();
const currentSlide = ref(0);
const totalSlides = ref(0);
const slideWidth = ref(0);
const isDragging = ref(false);
const isTransitioning = ref(false);
const startX = ref(0);
const startTouchX = ref(0);
const currentTranslate = ref(0);
const prevTranslate = ref(0);

const progress = computed(() => {
	if (totalSlides.value <= 1) return 0;
	return currentSlide.value / (totalSlides.value - 1);
});

// dots become unmanageable and progress is noisy past ~10 items — fall back to a compact counter
const MAX_INDICATOR_SLIDES = 10;
const indicatorOverflow = computed(() => totalSlides.value > MAX_INDICATOR_SLIDES);

function calculateSlides() {
	if (!carouselContainer.value || !carouselViewport.value) return;

	const children = Array.from(carouselContainer.value.children);
	if (children.length === 0) return;

	const viewportWidth = carouselViewport.value.clientWidth;
	if (viewportWidth <= 0) return;

	// only write when the value actually changed; otherwise ResizeObserver + reactive width writes
	// each other into a churn loop (each child width update re-fires ResizeObserver on the viewport)
	if (Math.abs(slideWidth.value - viewportWidth) >= 1) {
		slideWidth.value = viewportWidth;
	}
	if (totalSlides.value !== children.length) {
		totalSlides.value = children.length;
	}
}

function goToSlide(index: number) {
	if (totalSlides.value === 0) return;

	if (isTransitioning.value) return;
	if (carouselViewport.value) {
		const currentWidth = carouselViewport.value.clientWidth;
		if (currentWidth > 0) {
			slideWidth.value = currentWidth;
		}
	}

	let newSlide: number;
	if (props.loop) {
		if (index < 0) {
			newSlide = totalSlides.value - 1;
		} else if (index >= totalSlides.value) {
			newSlide = 0;
		} else {
			newSlide = index;
		}
	} else {
		newSlide = Math.max(0, Math.min(index, totalSlides.value - 1));
	}

	if (newSlide === currentSlide.value) return;

	isTransitioning.value = true;
	currentSlide.value = newSlide;

	setTimeout(() => {
		isTransitioning.value = false;
	}, 300);
}

const startDrag = (e: MouseEvent) => {
	if (!carouselContainer.value) return;
	isDragging.value = true;
	startX.value = e.clientX;
	prevTranslate.value = -currentSlide.value * slideWidth.value;
	carouselContainer.value.style.transition = 'none';
};

const onDrag = (e: MouseEvent) => {
	if (!isDragging.value) return;

	const currentX = e.clientX;
	const diff = currentX - startX.value;
	currentTranslate.value = prevTranslate.value + diff;

	if (carouselContainer.value) {
		carouselContainer.value.style.transform = `translateX(${currentTranslate.value}px)`;
	}
};

const endDrag = () => {
	if (!isDragging.value) return;

	isDragging.value = false;

	const movedBy = currentTranslate.value - prevTranslate.value;

	let targetSlide = currentSlide.value;
	if (movedBy < -slideWidth.value / 4) {
		targetSlide = currentSlide.value + 1;
	} else if (movedBy > slideWidth.value / 4) {
		targetSlide = currentSlide.value - 1;
	}

	if (props.loop) {
		if (targetSlide < 0) {
			targetSlide = totalSlides.value - 1;
		} else if (targetSlide >= totalSlides.value) {
			targetSlide = 0;
		}
	} else {
		targetSlide = Math.max(0, Math.min(targetSlide, totalSlides.value - 1));
	}

	if (carouselContainer.value) {
		carouselContainer.value.style.transition = '';
		carouselContainer.value.style.transform = '';
	}

	if (targetSlide !== currentSlide.value) {
		isTransitioning.value = true;
		currentSlide.value = targetSlide;
		setTimeout(() => {
			isTransitioning.value = false;
		}, 300);
	}
};

const startTouch = (e: TouchEvent) => {
	if (!carouselContainer.value || !e.touches[0]) return;
	startTouchX.value = e.touches[0].clientX;
	prevTranslate.value = -currentSlide.value * slideWidth.value;
	carouselContainer.value.style.transition = 'none';
};

const onTouchMove = (e: TouchEvent) => {
	if (!e.touches[0]) return;
	const currentX = e.touches[0].clientX;
	const diff = currentX - startTouchX.value;
	currentTranslate.value = prevTranslate.value + diff;

	if (carouselContainer.value) {
		carouselContainer.value.style.transform = `translateX(${currentTranslate.value}px)`;
	}
};

const endTouch = () => {
	const movedBy = currentTranslate.value - prevTranslate.value;

	let targetSlide = currentSlide.value;
	if (movedBy < -slideWidth.value / 4) {
		targetSlide = currentSlide.value + 1;
	} else if (movedBy > slideWidth.value / 4) {
		targetSlide = currentSlide.value - 1;
	}

	if (props.loop) {
		if (targetSlide < 0) {
			targetSlide = totalSlides.value - 1;
		} else if (targetSlide >= totalSlides.value) {
			targetSlide = 0;
		}
	} else {
		targetSlide = Math.max(0, Math.min(targetSlide, totalSlides.value - 1));
	}

	if (carouselContainer.value) {
		carouselContainer.value.style.transition = '';
		carouselContainer.value.style.transform = '';
	}

	if (targetSlide !== currentSlide.value) {
		isTransitioning.value = true;
		currentSlide.value = targetSlide;
		setTimeout(() => {
			isTransitioning.value = false;
		}, 300);
	}
};

// rAF-coalesce resize callbacks so a width tick doesn't fire a synchronous re-measure inside the
// same frame (which is what triggered the flicker loop on the events-calendar layout)
let pendingResize: number | null = null;
function scheduleCalculate() {
	if (pendingResize !== null) return;
	pendingResize = requestAnimationFrame(() => {
		pendingResize = null;
		calculateSlides();
	});
}

onMounted(() => {
	calculateSlides();
	const resizeObserver = new ResizeObserver(() => {
		scheduleCalculate();
	});

	if (carouselViewport.value) {
		resizeObserver.observe(carouselViewport.value);
	}

	onUnmounted(() => {
		resizeObserver.disconnect();
		if (pendingResize !== null) {
			cancelAnimationFrame(pendingResize);
			pendingResize = null;
		}
	});
});
</script>

<style>
/* use ionic's card token so theme transitions stay consistent with the rest of the app */
.info-card-group {
	background-color: var(--ion-card-background, var(--ion-background-color, #ffffff));
}
</style>
