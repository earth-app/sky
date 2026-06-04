<template>
	<IonCard class="m-0 p-4 rounded-xl bg-linear-to-br from-warning/10 via-primary/5 to-transparent">
		<div class="flex items-center gap-2 mb-3">
			<UIcon
				name="mdi:trophy-variant"
				class="size-5 text-warning"
			/>
			<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">
				Top {{ typeLabel }} Streaks
			</h3>
		</div>
		<div
			v-if="loading && rows.length === 0"
			class="text-xs text-gray-500 py-4 text-center"
		>
			Loading top streaks...
		</div>
		<div
			v-else-if="rows.length === 0"
			class="text-xs text-gray-500 py-6 text-center flex flex-col items-center gap-2"
		>
			<UIcon
				name="mdi:medal-outline"
				class="size-8 text-gray-400"
			/>
			<p>No active {{ typeLabel.toLowerCase() }} streaks yet.</p>
			<p class="text-[10px]">Be the first to start one.</p>
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
						name="mdi:fire"
						class="size-4 mr-1"
					/>
					{{ row.streak }}
				</IonChip>
			</li>
		</ul>
	</IonCard>
</template>

<script setup lang="ts">
import { IonCard, IonChip, useIonRouter } from '@ionic/vue';
import { useAppHaptics } from '~/composables/useHaptics';

const props = defineProps<{
	type: 'article' | 'prompt' | 'event';
}>();

const router = useIonRouter();
const { leaderboard } = useJourneyLeaderboard(props.type, makeMServerRequest);
const { user: currentUser } = useAuth(makeMServerRequest);
const avatarStore = useAvatarStore();
const { selection } = useAppHaptics();

// gate the empty-state UI behind a short window so we don't flash "no streaks" before the
// composable's first fetch settles. rows going positive at any point flips us out early.
const loading = ref(true);
onMounted(() => {
	setTimeout(() => {
		loading.value = false;
	}, 3000);
});

const typeLabel = computed(() => {
	const t = props.type;
	return t.charAt(0).toUpperCase() + t.slice(1);
});

const rows = computed(() =>
	leaderboard.value.slice(0, 3).map((entry, i) => {
		const url = entry.user.account?.avatar_url;
		const avatarSrc = avatarStore.safeUrl(url, 'avatar128');
		return {
			id: entry.id,
			rank: i + 1,
			username: entry.user.username ?? '',
			fullName: entry.user.full_name ?? entry.user.username ?? '',
			streak: entry.streak,
			avatarSrc,
			isSelf: currentUser.value?.id === entry.id
		};
	})
);

// flip loading off the moment data arrives; the 3s timer is just a fallback
watch(
	() => rows.value.length,
	(n) => {
		if (n > 0) loading.value = false;
	},
	{ immediate: true }
);

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
