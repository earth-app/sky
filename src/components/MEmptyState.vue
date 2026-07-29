<template>
	<div
		class="flex flex-col items-center justify-center text-center px-8 gap-3 max-w-md mx-auto w-full"
		:class="dense ? 'py-6' : 'py-12'"
		role="status"
	>
		<div
			class="size-16 rounded-full flex items-center justify-center transition-transform"
			:class="[
				illustrationBg,
				'animate-bounce-slow' // gentle attention pull, killed by html.animations-disabled
			]"
		>
			<UIcon
				:name="icon"
				class="size-9"
				:class="illustrationFg"
				aria-hidden="true"
			/>
		</div>
		<h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 m-0!">
			{{ title }}
		</h3>
		<p
			v-if="description"
			class="text-sm text-gray-700 dark:text-gray-300 m-0!"
		>
			{{ description }}
		</p>
		<IonButton
			v-if="ctaLabel"
			:color="ctaColor || 'success'"
			:fill="ctaFill || 'solid'"
			size="default"
			class="mt-2"
			@click="onCtaClick"
		>
			<UIcon
				v-if="ctaIcon"
				:name="ctaIcon"
				class="mr-2 size-4"
			/>
			{{ ctaLabel }}
		</IonButton>
		<IonButton
			v-if="secondaryLabel"
			fill="clear"
			color="medium"
			size="small"
			@click="emit('secondary')"
		>
			{{ secondaryLabel }}
		</IonButton>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		icon: string;
		title: string;
		description?: string;
		ctaLabel?: string;
		ctaIcon?: string;
		ctaColor?: 'success' | 'primary' | 'tertiary' | 'warning';
		ctaFill?: 'solid' | 'outline' | 'clear';
		ctaTo?: string;
		secondaryLabel?: string;
		dense?: boolean;
		// 'success' | 'primary' | 'warning'; sets the illustration tint
		variant?: 'success' | 'primary' | 'warning' | 'neutral';
	}>(),
	{ variant: 'primary' }
);

const emit = defineEmits<{
	cta: [];
	secondary: [];
}>();

const ionRouter = useIonRouter();

const illustrationBg = computed(() => {
	switch (props.variant) {
		case 'success':
			return 'bg-success/10';
		case 'warning':
			return 'bg-warning/10';
		case 'neutral':
			return 'bg-elevated';
		case 'primary':
		default:
			return 'bg-primary/10';
	}
});

const illustrationFg = computed(() => {
	switch (props.variant) {
		case 'success':
			return 'text-success';
		case 'warning':
			return 'text-warning';
		case 'neutral':
			return 'text-muted';
		case 'primary':
		default:
			return 'm-text-brand';
	}
});

function onCtaClick() {
	emit('cta');
	if (props.ctaTo) ionRouter.push(props.ctaTo);
}
</script>

<style scoped>
@keyframes bounce-slow {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-4px);
	}
}
/* 2 passes = 4.8s, under the WCAG 2.2 SC 2.2.2 five-second ceiling for auto-starting motion */
.animate-bounce-slow {
	animation: bounce-slow 2.4s ease-in-out 2;
}

:global(html.animations-disabled) .animate-bounce-slow,
:global(html.animations-disabled) .m-skeleton::after {
	animation: none !important;
}

/* the global killswitch only crushes the duration, which leaves an infinite animation
   reported as still running; the os query needs the same `none` the app class gets */
@media (prefers-reduced-motion: reduce) {
	.animate-bounce-slow,
	.m-skeleton::after {
		animation: none !important;
	}
}
</style>
