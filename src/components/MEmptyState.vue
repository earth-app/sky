<template>
	<div
		class="flex flex-col items-center justify-center text-center px-8 py-12 gap-3 max-w-md mx-auto"
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
			return 'bg-gray-200 dark:bg-gray-700';
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
			return 'text-gray-600 dark:text-gray-300';
		case 'primary':
		default:
			return 'text-primary';
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
.animate-bounce-slow {
	animation: bounce-slow 2.4s ease-in-out infinite;
}

:global(html.animations-disabled) .animate-bounce-slow,
:global(html.animations-disabled) .m-skeleton::after {
	animation: none !important;
}
</style>
