<template>
	<div class="flex flex-col items-center px-4">
		<h4 class="text-base">{{ completedBadges.length }} / {{ badges.length }} Completed</h4>

		<div
			v-if="badges.length > 0"
			class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center items-center gap-4"
		>
			<LazyUserBadgeMCard
				v-for="badge in loadedBadges"
				:key="badge.id"
				:badge="badge"
				hydrate-on-visible
			/>
		</div>
		<p
			v-else-if="normalizedSearch.length > 0"
			class="text-sm text-gray-500"
		>
			No badges found.
		</p>
		<div
			v-else
			class="flex items-center"
		>
			<Loading />
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	badges: UserBadge[];
	search?: string;
}>();

const normalizedSearch = computed(() => props.search?.trim().toLowerCase() || '');

const loadedBadges = computed(() => {
	if (!normalizedSearch.value) return props.badges;

	return props.badges.filter((badge) => {
		const searchableValues = [badge.name, badge.description, badge.id].filter(Boolean);
		return searchableValues.some((value) => value.toLowerCase().includes(normalizedSearch.value));
	});
});

const completedBadges = computed(() => props.badges.filter((b) => 'granted' in b && b.granted));
</script>
