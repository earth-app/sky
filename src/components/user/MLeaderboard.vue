<template>
	<div class="flex flex-col items-center size-full px-2">
		<h1 class="font-semibold! text-lg! text-center mb-2">
			{{ metricLabel }} Leaderboard (Showing {{ size }})
		</h1>

		<IonSegment
			v-model="scope"
			class="w-full max-w-md mb-3"
			:scrollable="true"
		>
			<IonSegmentButton
				v-for="s in scopeItems"
				:key="s.value"
				:value="s.value"
			>
				<IonLabel>{{ s.label }}</IonLabel>
			</IonSegmentButton>
		</IonSegment>

		<div class="flex items-center gap-2 mb-3 flex-wrap justify-center">
			<IonChip
				v-for="m in metricItems"
				:key="m.value"
				:color="metric === m.value ? 'primary' : 'medium'"
				:outline="metric !== m.value"
				class="px-3 py-1 cursor-pointer"
				@click="metric = m.value"
			>
				<UIcon
					:name="m.icon"
					class="size-4 mr-1"
				/>
				<IonLabel>{{ m.label }}</IonLabel>
			</IonChip>
		</div>

		<UInputNumber
			v-model="size"
			:min="5"
			:step="15"
			:max="100"
			placeholder="Change how big the table should be"
			variant="subtle"
		/>

		<p
			v-if="scope !== 'global' && !isAuthenticated"
			class="text-sm text-gray-500 my-4 text-center"
		>
			Sign in to see how you stack up against your {{ scope }}.
		</p>
		<UTable
			v-else
			:columns="columns"
			:data="visibleRows"
			:loading="loading"
			class="min-w-full size-full mt-4"
			:ui="{
				th: 'text-xs! px-2! py-2!',
				td: 'text-center'
			}"
		/>
	</div>
</template>

<script setup lang="ts">
import { IonChip, IonLabel, IonSegment, IonSegmentButton } from '@ionic/vue';
import type { TableColumn } from '@nuxt/ui';
import type { LeaderboardMetric, LeaderboardScope, User } from 'types/user';
import { capitalizeFully, comma, getUserDisplayName } from 'utils';
import type { EffectScope } from 'vue';

const props = withDefaults(
	defineProps<{
		// initial metric/scope; defaults preserve the old journey behavior
		type?: LeaderboardMetric;
		initialScope?: LeaderboardScope;
	}>(),
	{ type: 'article', initialScope: 'global' }
);

const authStore = useAuthStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);

const metric = ref<LeaderboardMetric>(props.type);
const scope = ref<LeaderboardScope>(props.initialScope);
const size = ref<number>(10);

const scopeItems = [
	{ label: 'Global', value: 'global' as const },
	{ label: 'Friends', value: 'friends' as const },
	{ label: 'Circle', value: 'circle' as const }
];

const metricItems = [
	{ label: 'Points', value: 'points' as const, icon: 'mdi:star-four-points' },
	{ label: 'Articles', value: 'article' as const, icon: 'mdi:newspaper' },
	{ label: 'Prompts', value: 'prompt' as const, icon: 'mdi:lightbulb-on-outline' },
	{ label: 'Events', value: 'event' as const, icon: 'mdi:calendar-star' }
];

const metricLabel = computed(
	() => metricItems.find((m) => m.value === metric.value)?.label ?? capitalizeFully(metric.value)
);

const UIcon = resolveComponent('UIcon');
const UserMCard = resolveComponent('UserMCard');
const IonChipComponent = resolveComponent('IonChip');
const ChallengeButton = resolveComponent('UserMChallengeFriendButton');

type Row = {
	rank: number;
	id: string;
	user: User;
	value: number;
};

const data = ref<Row[]>([]);
const loading = ref(true);

// hide 0-streak entries in friends/circle streak boards; points + global stay unfiltered
const visibleRows = computed(() =>
	scope.value !== 'global' && metric.value !== 'points'
		? data.value.filter((row) => row.value > 0)
		: data.value
);

let bindingScope: EffectScope | null = null;
let fetchCurrent: ((limit: number) => Promise<void>) | null = null;

function bind() {
	bindingScope?.stop();
	bindingScope = effectScope();
	bindingScope.run(() => {
		const { leaderboard, fetchLeaderboard } = useLeaderboard(
			metric.value,
			scope.value,
			makeMServerRequest
		);
		fetchCurrent = fetchLeaderboard;
		watch(
			leaderboard,
			(next) => {
				data.value = next.map((entry, index) => ({
					rank: entry.rank ?? index + 1,
					id: entry.id,
					user: entry.user,
					value: entry.value
				}));
			},
			{ immediate: true }
		);
	});
}

// rebind (its immediate watcher paints any cached rows), then only hit the network when
// this keyed state has nothing cached yet; switching back to a loaded tab is instant.
async function load(force = false) {
	bind();
	if (!force && data.value.length > 0) {
		loading.value = false;
		return;
	}
	loading.value = true;
	try {
		await fetchCurrent?.(size.value);
	} finally {
		loading.value = false;
	}
}

onMounted(() => load());
watch([metric, scope], () => load());
watch(size, () => load(true));
onScopeDispose(() => bindingScope?.stop());

const valueHeader = computed(() =>
	metric.value === 'points' ? 'Impact Points' : 'Current Streak'
);

const columns = computed<TableColumn<Row>[]>(() => {
	const cols: TableColumn<Row>[] = [
		{
			accessorKey: 'rank',
			header: 'Rank',
			cell: ({ row }) => {
				return h(
					IonChipComponent,
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
			cell: ({ row }) =>
				h(UserMCard, { user: row.original.user, activities: false, class: 'max-w-50 m-2' })
		},
		{
			accessorKey: 'value',
			header: valueHeader.value,
			cell: ({ row }) => {
				const v = row.original.value;
				if (metric.value === 'points') {
					return h(
						IonChipComponent,
						{ color: 'tertiary', class: 'px-2 py-1 font-semibold self-center' },
						() => [
							h(UIcon, { name: 'mdi:star-circle', class: 'inline-block mr-1 size-5' }),
							comma(v)
						]
					);
				}
				return h(
					IonChipComponent,
					{ color: 'tertiary', class: 'px-2 py-1 font-semibold self-center' },
					() => [
						h(UIcon, { name: 'mdi:fire', class: 'inline-block mr-1 size-5' }),
						`${v} day${v !== 1 ? 's' : ''}`
					]
				);
			}
		}
	];

	// challenge column only for non-global friend rows that aren't yourself
	if (scope.value !== 'global') {
		cols.push({
			accessorKey: 'challenge',
			header: '',
			cell: ({ row }) => {
				const isSelf = authStore.currentUser?.id === row.original.id;
				if (isSelf) return null;
				return h(
					ChallengeButton,
					{ class: 'px-2' },
					{
						size: 'small',
						friendId: row.original.id,
						friendName: getUserDisplayName(row.original.user, { at: true })
					}
				);
			}
		});
	}

	return cols;
});
</script>
