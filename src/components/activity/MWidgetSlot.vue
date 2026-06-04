<template>
	<ClientOnly>
		<div class="w-11/12 my-2">
			<component
				:is="resolved"
				v-if="resolved"
				:topic="topic"
			/>
		</div>
	</ClientOnly>
</template>

<script setup lang="ts">
// sky-side widget slot. consumes the same FeedWidgetKind contract as crust but maps each kind
// to the M-prefixed ionic sibling.

const props = withDefaults(
	defineProps<{
		kind: FeedWidgetKind;
		topic?: string;
	}>(),
	{
		topic: 'today'
	}
);

const COMPONENTS: Record<FeedWidgetKind, ReturnType<typeof defineAsyncComponent>> = {
	MoodSpark: defineAsyncComponent(() => import('~/components/activity/widgets/MMoodSpark.vue')),
	MicroPoll: defineAsyncComponent(() => import('~/components/activity/widgets/MMicroPoll.vue')),
	MicroQuiz: defineAsyncComponent(() => import('~/components/activity/widgets/MMicroQuiz.vue')),
	WordOfTheDay: defineAsyncComponent(
		() => import('~/components/activity/widgets/MWordOfTheDay.vue')
	),
	ImpactTracker: defineAsyncComponent(
		() => import('~/components/activity/widgets/MImpactTracker.vue')
	),
	MiniLeaderboard: defineAsyncComponent(
		() => import('~/components/activity/widgets/MMiniLeaderboard.vue')
	),
	MicroReflection: defineAsyncComponent(
		() => import('~/components/activity/widgets/MMicroReflection.vue')
	),
	RapidFlash: defineAsyncComponent(() => import('~/components/activity/widgets/MRapidFlash.vue'))
};

const resolved = computed(() => COMPONENTS[props.kind] ?? null);
</script>
