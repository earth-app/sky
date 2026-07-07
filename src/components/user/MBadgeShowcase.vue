<template>
	<div
		v-if="visible"
		class="w-full max-w-2xl mx-auto px-4 mb-4"
	>
		<IonCard
			:color="theme"
			class="m-0 px-3 pt-3 pb-2"
		>
			<div class="flex items-center gap-2 mb-4">
				<UIcon
					name="mdi:shield-star-outline"
					class="size-5 text-warning"
				/>
				<h3 class="text-sm font-semibold m-0! tracking-wide opacity-80">Recent Badges</h3>
				<span class="text-xs opacity-60 ml-auto">last 7 days</span>
			</div>
			<div class="flex gap-6 overflow-x-auto -mx-1 px-1 pb-1 scroll-smooth">
				<UserBadgeMCard
					v-for="badge in recentBadges"
					:key="badge.id"
					:badge="badge"
					size="medium"
					class="shrink-0"
				/>
			</div>
		</IonCard>
	</div>
</template>

<script setup lang="ts">
import { theme } from '~/composables/useSettings';

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
