<template>
	<IonCard class="info-card-group mt-6 shadow-xl rounded-lg w-full p-4">
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
			class="relative overflow-hidden touch-pan-y"
		>
			<div
				ref="carouselContainer"
				class="flex flex-row items-stretch flex-nowrap transition-transform duration-300 ease-out cursor-grab active:cursor-grabbing *:shrink-0 *:w-full *:px-2"
				:style="{ transform: `translateX(-${currentSlide * slideWidth}px)` }"
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
					:disabled="currentSlide === 0 && !loop"
					@click="goToSlide(currentSlide - 1)"
				>
					<UIcon
						name="mdi:arrow-left-bold"
						class="size-6"
					/>
				</IonButton>

				<div
					v-if="!showProgress && showDots && totalSlides > 1"
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

				<IonButton
					v-if="totalSlides > 1"
					fill="clear"
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
				v-if="showProgress"
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

function calculateSlides() {
	if (!carouselContainer.value || !carouselViewport.value) return;

	const children = Array.from(carouselContainer.value.children);
	if (children.length === 0) return;

	const viewportWidth = carouselViewport.value.clientWidth;

	slideWidth.value = viewportWidth;
	totalSlides.value = children.length;
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

	goToSlide(targetSlide);
	nextTick(() => {
		if (carouselContainer.value) {
			carouselContainer.value.style.transition = '';
			carouselContainer.value.style.transform = '';
		}
	});
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

	goToSlide(targetSlide);
	nextTick(() => {
		if (carouselContainer.value) {
			carouselContainer.value.style.transition = '';
			carouselContainer.value.style.transform = '';
		}
	});
};

onMounted(() => {
	calculateSlides();
	const resizeObserver = new ResizeObserver(() => {
		calculateSlides();
	});

	if (carouselViewport.value) {
		resizeObserver.observe(carouselViewport.value);
	}

	onUnmounted(() => {
		resizeObserver.disconnect();
	});
});

watchEffect(() => {
	if (carouselContainer.value) {
		calculateSlides();
	}
});
</script>

<style>
.light .info-card-group {
	background-color: #ffffff;
}

.dark .info-card-group {
	background-color: #212027;
}
</style>
