<template>
	<MSurface class="bg-linear-to-br from-warning/10 via-primary/5 to-transparent">
		<div class="flex items-center gap-2 mb-3">
			<UIcon
				:name="headerIcon"
				class="size-5 text-warning"
			/>
			<h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
				{{ headerLabel }}
			</h3>
		</div>
		<MSkeleton
			v-if="loading"
			variant="row"
			:count="3"
			:label="`Loading ${headerLabel}`"
		/>
		<MEmptyState
			v-else-if="rows.length === 0"
			icon="mdi:medal-outline"
			:title="emptyLabel"
			description="Be the first to climb the board."
			variant="neutral"
			dense
		/>
		<ul
			v-else
			class="flex flex-col gap-2"
		>
			<li
				v-for="row in rows"
				:key="row.id"
				class="min-w-0"
			>
				<button
					type="button"
					:aria-label="`View ${row.label}, Rank ${row.rank}`"
					class="flex w-full! min-h-11! items-center gap-3 p-2! rounded-lg! text-left! transition-colors cursor-pointer"
					:class="row.isSelf ? 'bg-primary/10! ring-1 ring-primary/40' : 'hover:bg-primary/5!'"
					@click="navigate(row.id)"
				>
					<span
						class="font-mono font-bold text-sm! w-6 text-center"
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
						<p
							v-if="row.fullName"
							class="text-sm font-semibold truncate m-0!"
						>
							{{ row.fullName }}
						</p>
						<p class="text-xs text-muted truncate m-0!">@{{ row.username }}</p>
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
				</button>
			</li>
		</ul>
	</MSurface>
</template>

<script setup lang="ts">
import { IonChip, useIonRouter } from '@ionic/vue';
import type { LeaderboardMetric, LeaderboardScope } from 'types/user';
import { comma, realFullName } from 'utils';
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
		const username = entry.user.username ?? '';
		// placeholder full names are not names; falling back to the username here would print it twice
		const fullName = realFullName(entry.user.full_name) ?? '';
		return {
			id: entry.id,
			rank: entry.rank ?? i + 1,
			username,
			fullName,
			label: fullName || `@${username}`,
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
	if (rank === 2) return 'text-muted';
	if (rank === 3) return 'text-secondary';
	return 'text-muted';
}

function navigate(id: string) {
	selection();
	router.push(`/tabs/profile/${id}`);
}
</script>
