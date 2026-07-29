<template>
	<section class="w-full">
		<div
			v-if="count > 1"
			class="m-section-head px-4"
		>
			<p class="m-eyebrow">{{ eyebrow }}</p>
			<div class="flex shrink-0 items-center gap-1">
				<span
					class="text-2xs text-muted tabular-nums"
					aria-hidden="true"
					>{{ activeIndex + 1 }}/{{ count }}</span
				>
				<IonButton
					fill="clear"
					size="small"
					aria-label="Previous Module"
					:disabled="activeIndex <= 0"
					@click="page(-1)"
				>
					<UIcon
						name="mdi:chevron-left"
						class="size-5"
					/>
				</IonButton>
				<IonButton
					fill="clear"
					size="small"
					aria-label="Next Module"
					:disabled="activeIndex >= count - 1"
					@click="page(1)"
				>
					<UIcon
						name="mdi:chevron-right"
						class="size-5"
					/>
				</IonButton>
			</div>
		</div>
		<div
			ref="railEl"
			class="m-rail"
			role="region"
			:aria-label="label"
			tabindex="0"
			@scroll.passive="onScroll"
		>
			<slot />
		</div>
	</section>
</template>

<script setup lang="ts">
defineProps<{
	eyebrow: string;
	/** names the scroll region; a scrollable region is focusable, so it needs one */
	label: string;
}>();

const railEl = ref<HTMLElement | null>(null);
const count = ref(0);
const activeIndex = ref(0);

const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const settings = useAppSettingsState();
const motionOk = computed(() => !prefersReducedMotion.value && settings.value.animations);

// measured, not assumed: the step is a panel plus the gap that parks the next one off-screen
function stepWidth(): number {
	const el = railEl.value;
	if (!el) return 0;
	const panels = Array.from(el.children) as HTMLElement[];
	if (panels.length >= 2) return panels[1]!.offsetLeft - panels[0]!.offsetLeft;
	return el.clientWidth;
}

function syncCount() {
	const el = railEl.value;
	count.value = el ? el.children.length : 0;
	if (activeIndex.value > count.value - 1) activeIndex.value = Math.max(0, count.value - 1);
}

function onScroll() {
	const el = railEl.value;
	const step = stepWidth();
	if (!el || step <= 0) return;
	const index = Math.round(el.scrollLeft / step);
	activeIndex.value = Math.min(Math.max(index, 0), Math.max(0, count.value - 1));
}

function page(delta: number) {
	const el = railEl.value;
	const step = stepWidth();
	if (!el || step <= 0) return;
	el.scrollTo({
		left: (activeIndex.value + delta) * step,
		behavior: motionOk.value ? 'smooth' : 'auto'
	});
}

onMounted(() => {
	syncCount();
	const el = railEl.value;
	if (!el) return;

	// a module with nothing to show renders no panel at all, so the count is observed
	// rather than passed in; childList covers both the mount and the unmount
	const observer = new MutationObserver(() => syncCount());
	observer.observe(el, { childList: true });
	onUnmounted(() => observer.disconnect());
});
</script>

<style scoped>
.m-rail {
	display: flex;
	overflow-x: auto;
	overflow-y: hidden;
	scroll-snap-type: x mandatory;
	overscroll-behavior-x: contain;
	/* load-bearing: the gap is what parks an inactive panel fully off-screen. without it the
	   next panel starts one pixel inside the viewport and reads as an element bleeding out */
	gap: 1rem;
	scrollbar-width: none;
	-webkit-overflow-scrolling: touch;
}

.m-rail::-webkit-scrollbar {
	display: none;
}

.m-rail > :deep(*) {
	display: flex;
	flex: 0 0 100%;
	min-width: 0;
	flex-direction: column;
	padding-inline: 1rem;
	scroll-snap-align: start;
}

/* the panel is stretched to the tallest module, so its card fills it instead of floating short */
.m-rail > :deep(*) > * {
	flex: 1 1 auto;
}
</style>
