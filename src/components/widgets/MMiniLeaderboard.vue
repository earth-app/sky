<template>
	<IonCard class="m-0 p-4 rounded-xl bg-linear-to-br from-warning/10 via-primary/5 to-transparent">
		<div class="flex items-center gap-2 mb-3">
			<UIcon
				:name="headerIcon"
				class="size-5 text-warning"
			/>
			<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">
				{{ headerLabel }}
			</h3>
		</div>
		<div
			v-if="loading"
			class="text-xs text-gray-500 py-4 text-center"
		>
			Loading leaderboard...
		</div>
		<div
			v-else-if="rows.length === 0"
			class="text-xs text-gray-500 py-6 text-center flex flex-col items-center gap-2"
		>
			<UIcon
				name="mdi:medal-outline"
				class="size-8 text-gray-400"
			/>
			<p>{{ emptyLabel }}</p>
			<p class="text-[10px]">Be the first to climb the board.</p>
		</div>
		<ul
			v-else
			class="flex flex-col gap-2"
		>
			<li
				v-for="row in rows"
				:key="row.id"
				class="flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer"
				:class="row.isSelf ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-primary/5'"
				@click="navigate(row.id)"
			>
				<span
					class="font-mono font-bold text-sm w-6 text-center"
					:class="rankColor(row.rank)"
				>
					#{{ row.rank }}
				</span>
				<UAvatar
					:src="row.avatarSrc"
					:alt="row.username"
					size="sm"
				/>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold truncate">
						{{ row.fullName }}
					</p>
					<p class="text-xs text-gray-500 truncate">@{{ row.username }}</p>
				</div>
				<IonChip
					color="warning"
					class="px-2 py-1 text-xs font-semibold"
				>
					<UIcon
						:name="valueIcon"
						class="size-4 mr-1"
					/>
					{{ row.value }}
				</IonChip>
			</li>
		</ul>
	</IonCard>
</template>

<script setup lang="ts">
import { IonCard, IonChip, useIonRouter } from '@ionic/vue';
import type { LeaderboardMetric, LeaderboardScope } from 'types/user';
import { comma } from 'utils';
import { useAppHaptics } from '~/composables/useHaptics';

const props = withDefaults(
	defineProps<{
		metric?: LeaderboardMetric;
		scope?: LeaderboardScope;
	}>(),
	{ scope: 'global' }
);

// metric prop wins; fall back to the legacy `type` (streak) prop, else points
const metric = computed<LeaderboardMetric>(() => props.metric ?? 'points');
const isPoints = computed(() => metric.value === 'points');

const router = useIonRouter();
const { leaderboard, fetchLeaderboard } = useLeaderboard(
	metric.value,
	props.scope,
	makeMServerRequest
);
const { user: currentUser } = useAuth(makeMServerRequest);
const avatarStore = useAvatarStore();
const { selection } = useAppHaptics();

// always fetch on mount and always resolve loading. deriving the flag from the shared
// state's emptiness left the widget stuck spinning when a fetch was already in flight
// from another consumer of the same keyed state (it never re-resolved here).
const loading = ref(true);
onMounted(async () => {
	try {
		await fetchLeaderboard(10);
	} finally {
		loading.value = false;
	}
});

const metricLabel = computed(() => {
	const m = metric.value;
	if (m === 'points') return 'Points';
	return m.charAt(0).toUpperCase() + m.slice(1);
});

const headerLabel = computed(() =>
	isPoints.value ? 'Top Impact Points' : `Top ${metricLabel.value} Streaks`
);
const headerIcon = computed(() => (isPoints.value ? 'mdi:star-circle' : 'mdi:trophy-variant'));
const valueIcon = computed(() => (isPoints.value ? 'mdi:star-four-points' : 'mdi:fire'));
const emptyLabel = computed(() =>
	isPoints.value
		? 'No impact points ranked yet.'
		: `No active ${metricLabel.value.toLowerCase()} streaks yet.`
);

const rows = computed(() => {
	// in friends/circle streak widgets a 0-streak friend shouldn't take a top-3 slot
	const source =
		props.scope !== 'global' && !isPoints.value
			? leaderboard.value.filter((e) => e.value > 0)
			: leaderboard.value;
	return source.slice(0, 3).map((entry, i) => {
		const url = entry.user.account?.avatar_url;
		const avatarSrc = avatarStore.safeUrl(url, 'avatar128');
		return {
			id: entry.id,
			rank: entry.rank ?? i + 1,
			username: entry.user.username ?? '',
			fullName: entry.user.full_name ?? entry.user.username ?? '',
			value: isPoints.value ? comma(entry.value) : entry.value,
			avatarSrc,
			isSelf: currentUser.value?.id === entry.id
		};
	});
});

// prefetch avatar blobs for top 3
watch(
	rows,
	(list) => {
		for (const row of list) {
			const url = leaderboard.value.find((e) => e.id === row.id)?.user.account?.avatar_url;
			if (url) void avatarStore.fetchAvatarBlobs(url);
		}
	},
	{ immediate: true }
);

function rankColor(rank: number): string {
	if (rank === 1) return 'text-warning';
	if (rank === 2) return 'text-gray-500';
	if (rank === 3) return 'text-secondary';
	return 'text-gray-500';
}

function navigate(id: string) {
	selection();
	router.push(`/tabs/profile/${id}`);
}
</script>
