<template>
	<div
		v-if="visible"
		class="w-full"
	>
		<MSurface class="gap-3">
			<div class="flex items-center gap-2">
				<UIcon
					name="mdi:shield-star-outline"
					class="size-5 shrink-0 m-text-warning"
					aria-hidden="true"
				/>
				<h3 class="m-0! truncate text-sm! font-semibold">Recent Badges</h3>
				<span class="ml-auto shrink-0 text-2xs text-muted">last 7 days</span>
			</div>
			<div class="flex flex-wrap items-start gap-4">
				<UserBadgeMCard
					v-for="badge in recentBadges"
					:key="badge.id"
					:badge="badge"
					size="medium"
					class="shrink-0"
				/>
			</div>
		</MSurface>
	</div>
</template>

<script setup lang="ts">
const { user } = useAuth();
const userId = computed(() => user.value?.id);
const { badges, fetchBadges } = useUser(userId);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const recentBadges = computed(() => {
	const now = Date.now();
	return badges.value
		.filter((b) => b.granted && b.granted_at)
		.filter((b) => {
			const ts = b.granted_at ? Date.parse(b.granted_at) : 0;
			return ts > 0 && now - ts <= SEVEN_DAYS_MS;
		})
		.sort((a, b) => {
			const ta = a.granted_at ? Date.parse(a.granted_at) : 0;
			const tb = b.granted_at ? Date.parse(b.granted_at) : 0;
			return tb - ta;
		})
		.slice(0, 5);
});

const visible = computed(() => !!user.value && recentBadges.value.length > 0);

// eager + fresh: force past the LRU cache so a newly-earned badge shows
watch(
	userId,
	(id) => {
		if (id) void fetchBadges(true);
	},
	{ immediate: true }
);
</script>
