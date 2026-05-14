<template>
	<div class="flex flex-col items-center size-full px-2">
		<h1 class="font-semibold! text-lg! text-center mb-2">
			{{ capitalizeFully(props.type) }} Leaderboard (Showing {{ size }})
		</h1>
		<UInputNumber
			v-model="size"
			:min="5"
			:step="15"
			:max="100"
			placeholder="Change how big the table should be"
			variant="subtle"
		/>
		<UTable
			:columns="columns"
			:data="data"
			:loading="data.length === 0"
			class="min-w-full size-full mt-4"
			:ui="{
				th: 'text-xs! px-2! py-2!',
				td: 'text-center'
			}"
		/>
	</div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import { capitalizeFully } from 'utils';

const props = defineProps<{
	type: 'event' | 'prompt' | 'article';
}>();

const { leaderboard, fetchLeaderboard } = useJourneyLeaderboard(props.type, makeMServerRequest);

const UIcon = resolveComponent('UIcon');
const UserMCard = resolveComponent('UserMCard');
const IonChip = resolveComponent('IonChip');

type LeaderboardEntry = {
	rank: number;
	user: User;
	streak: number;
};

const size = ref<number>(10);
const data = ref<LeaderboardEntry[]>([]);

watch(
	leaderboard,
	(newLeaderboard) => {
		data.value = newLeaderboard.map((entry, index) => ({
			rank: index + 1,
			user: entry.user,
			streak: entry.streak
		}));
	},
	{ immediate: true }
);

watch(size, (newSize) => {
	fetchLeaderboard(newSize);
});

const columns: TableColumn<LeaderboardEntry>[] = [
	{
		accessorKey: 'rank',
		header: 'Rank',
		cell: ({ row }) => {
			return h(
				IonChip,
				{
					color: row.original.rank === 1 ? 'warning' : 'primary',
					class: 'px-2 py-1 font-semibold self-center mx-2'
				},
				() => [
					h(UIcon, {
						name:
							row.original.rank === 1
								? 'mdi:trophy-variant'
								: row.original.rank <= 10
									? 'mdi:medal'
									: 'mdi:dots-grid',
						class: 'inline-block mr-1 size-5'
					}),
					`#${row.original.rank}`
				]
			);
		}
	},
	{
		accessorKey: 'user',
		header: 'User',
		cell: ({ row }) => {
			const user = row.original.user;
			return h(UserMCard, { user, activities: false, class: 'max-w-50 m-2' });
		}
	},
	{
		accessorKey: 'streak',
		header: 'Streak',
		cell: ({ row }) => {
			return h(
				IonChip,
				{
					color: 'tertiary',
					class: 'px-2 py-1 font-semibold self-center'
				},
				() => [
					h(UIcon, { name: 'mdi:fire', class: 'inline-block mr-1 size-5' }),
					`${row.original.streak} day${row.original.streak !== 1 ? 's' : ''}`
				]
			);
		}
	}
];
</script>
