<template>
	<div
		v-if="expeditions.length || loading"
		id="activity-expeditions"
		class="flex flex-col gap-3 min-w-85 w-4/5 mt-6"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h3 class="text-base! font-bold m-0!">Groups Doing This</h3>
				<p class="text-xs opacity-70 mt-1">
					Shared gardens gathered around {{ activity.name }}. Everyone's outdoor time grows the same
					garden.
				</p>
			</div>
			<UIcon
				name="mdi:account-group-outline"
				class="size-6 shrink-0 opacity-70"
			/>
		</div>

		<MSkeleton
			v-if="loading && !expeditions.length"
			:height="72"
			width="100%"
		/>

		<MSurface
			v-for="expedition in expeditions"
			:key="expedition.id"
			class="gap-1"
		>
			<div class="flex items-center justify-between gap-2">
				<p class="text-sm font-semibold m-0! truncate">{{ expedition.title }}</p>
				<UBadge
					color="primary"
					variant="subtle"
					size="sm"
					>{{ percent(expedition) }}%</UBadge
				>
			</div>
			<p class="text-2xs opacity-70 m-0!">
				{{ expedition.contributors.length }}
				{{ expedition.contributors.length === 1 ? 'person' : 'people' }} ·
				{{ goalLabel(expedition) }}
			</p>
		</MSurface>
	</div>
</template>

<script setup lang="ts">
import type { Activity } from 'types/activity';
import { makeClientAPIRequest } from 'utils';

type ExpeditionSummary = {
	id: string;
	title: string;
	goal: string;
	target: number;
	progress: number;
	contributors: { uid: string }[];
};

const props = defineProps<{ activity: Activity }>();

// called straight against mantle2: the crust composable that wraps this ships in 0.6.x and sky
// vendors crust as a tarball
const authStore = useAuthStore();

const expeditions = ref<ExpeditionSummary[]>([]);
const loading = ref(false);

const GOAL_LABELS: Record<string, string> = {
	nature_minutes: 'minutes outside',
	trails: 'trails',
	quests: 'quests'
};

function goalLabel(expedition: ExpeditionSummary): string {
	return `${expedition.progress} / ${expedition.target} ${GOAL_LABELS[expedition.goal] ?? expedition.goal}`;
}

function percent(expedition: ExpeditionSummary): number {
	if (!expedition.target) return 0;
	return Math.min(100, Math.round((expedition.progress / expedition.target) * 100));
}

async function load() {
	const id = props.activity?.id;
	if (!id) return;

	loading.value = true;
	try {
		const res = await makeClientAPIRequest<{ total: number; expeditions: ExpeditionSummary[] }>(
			`/v2/activities/${encodeURIComponent(id)}/expeditions`,
			authStore.sessionToken,
			{ method: 'GET' }
		);
		expeditions.value =
			res.success && Array.isArray(res.data?.expeditions) ? res.data.expeditions : [];
	} catch {
		expeditions.value = [];
	} finally {
		loading.value = false;
	}
}

watch(() => props.activity?.id, load, { immediate: true });
</script>
