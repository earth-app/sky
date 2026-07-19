<template>
	<div class="flex flex-col gap-5 w-full max-w-3xl mx-auto px-4 pb-8">
		<div class="flex flex-col gap-3">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<h2 class="text-xl! font-bold m-0!">Curiosity Trails</h2>
					<p class="text-xs opacity-70 mt-1">
						One quiet outdoor practice at a time. Follow a curiosity outside, be present, and keep a
						private record of what you notice.
					</p>
				</div>
				<TrailMNatureRing
					v-if="natureMinutes"
					:minutes="natureMinutes.minutes"
					:target="natureMinutes.target"
					:best="natureMinutes.best"
					:size="64"
					compact
				/>
			</div>

			<IonButton
				fill="outline"
				color="medium"
				size="small"
				class="self-start"
				@click="journalOpen = true"
			>
				<UIcon
					name="mdi:book-heart-outline"
					class="size-5 mr-2"
				/>
				Journal
			</IonButton>

			<div class="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
				<IonChip
					v-for="opt in themeOptions"
					:key="opt.value"
					:color="activeTheme === opt.value ? 'primary' : 'medium'"
					:outline="activeTheme !== opt.value"
					@click="activeTheme = opt.value"
				>
					<IonLabel class="text-xs font-semibold">{{ opt.label }}</IonLabel>
				</IonChip>
			</div>
		</div>

		<div
			v-if="loading && !filteredTrails.length"
			class="grid grid-cols-1 sm:grid-cols-2 gap-3"
		>
			<MSkeleton
				v-for="n in 4"
				:key="n"
				:height="176"
				width="100%"
			/>
		</div>
		<div
			v-else-if="filteredTrails.length"
			class="grid grid-cols-1 sm:grid-cols-2 gap-3"
		>
			<TrailMCard
				v-for="trail in filteredTrails"
				:key="trail.id"
				:trail="trail"
				@select="openTrail"
				@preview="previewTrail"
			/>
		</div>
		<div
			v-else
			class="flex flex-col items-center text-center py-12 opacity-70"
		>
			<UIcon
				name="mdi:compass-off-outline"
				class="size-10 mb-2"
			/>
			<p class="text-sm">No Trails Here Yet.</p>
		</div>

		<TrailMRunner
			v-if="activeTrail"
			:key="activeTrail.id"
			v-model:open="runnerOpen"
			:trail="activeTrail"
			:preview="previewMode"
			@begin="previewMode = false"
		/>

		<TrailMJournal v-model:open="journalOpen" />
	</div>
</template>

<script setup lang="ts">
import type { Trail } from 'types/trails';

const props = withDefaults(defineProps<{ initialTrailId?: string }>(), { initialTrailId: '' });

const { trails, natureMinutes, fetchTrails, fetchNatureMinutes } = useTrails();
const { user } = useAuth();

const themeOptions = [
	{ value: 'all', label: 'All' },
	{ value: 'nature', label: 'Nature' },
	{ value: 'curiosity', label: 'Curiosity' },
	{ value: 'creative', label: 'Creative' },
	{ value: 'reflective', label: 'Reflective' },
	{ value: 'mixed', label: 'Mixed' }
] as const;

const activeTheme = ref<(typeof themeOptions)[number]['value']>('all');
const journalOpen = ref(false);
const loading = ref(false);
const activeTrail = ref<Trail | null>(null);
const runnerOpen = ref(false);
// preview opens the runner read-only (no pledge, no writes); begin starts the real run
const previewMode = ref(false);

// rarity-then-alphabetical, matching the quest/badge ordering
const filteredTrails = computed(() => {
	const base =
		activeTheme.value === 'all'
			? trails.value
			: trails.value.filter((t) => t.theme === activeTheme.value);
	return sortTrailsByRarity(base);
});

function open(id: string, preview: boolean) {
	const trail = trails.value.find((t) => t.id === id);
	if (!trail) return;
	activeTrail.value = trail;
	previewMode.value = preview;
	runnerOpen.value = true;
}

function openTrail(id: string) {
	open(id, false);
}

function previewTrail(id: string) {
	open(id, true);
}

onMounted(async () => {
	loading.value = true;
	try {
		await fetchTrails();
		if (user.value?.id) await fetchNatureMinutes();
		// deep-link / notification tap into a specific trail opens its runner
		if (props.initialTrailId) openTrail(props.initialTrailId);
	} finally {
		loading.value = false;
	}
});
</script>
