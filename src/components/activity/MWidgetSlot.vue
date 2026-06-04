<template>
	<ClientOnly>
		<div class="w-11/12 my-2">
			<component
				:is="resolved"
				v-if="resolved"
				v-bind="extraProps"
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

// MMiniLeaderboard needs a journey type. rotate per UTC day for variety.
const LEADERBOARD_TYPES = ['article', 'prompt', 'event'] as const;
const extraProps = computed<Record<string, unknown>>(() => {
	if (props.kind === 'MiniLeaderboard') {
		const day = Math.floor(Date.now() / 86_400_000);
		return { type: LEADERBOARD_TYPES[day % LEADERBOARD_TYPES.length] };
	}
	return {};
});
</script>
