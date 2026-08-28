<template>
	<div
		id="activity-surprise"
		class="rounded-2xl border border-default bg-elevated/40 p-4"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h3 class="text-base! font-bold m-0!">Something Unexpected</h3>
				<p class="text-xs opacity-70 mt-1">
					A draw from the far side of the catalog: whatever your activities are least like.
				</p>
			</div>
			<UIcon
				name="mdi:dice-multiple-outline"
				class="size-6 shrink-0 opacity-70"
			/>
		</div>

		<MSkeleton
			v-if="loading && !activity"
			:height="132"
			width="100%"
			class="mt-3"
		/>

		<div
			v-else-if="activity"
			class="mt-3 flex flex-col gap-2"
		>
			<ActivityMCard :activity="activity" />
			<p
				v-if="unrelated"
				class="text-xs opacity-70"
			>
				Nothing about this overlaps what you already do.
			</p>
		</div>

		<p
			v-else-if="error"
			class="mt-3 text-xs opacity-70"
		>
			{{ error }}
		</p>

		<IonButton
			fill="outline"
			color="primary"
			size="small"
			class="mt-3"
			:disabled="loading"
			@click="draw"
		>
			<UIcon
				name="mdi:refresh"
				class="size-5 mr-2"
			/>
			{{ activity ? 'Draw Another' : 'Surprise Me' }}
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import type { Activity } from 'types/activity';
import { makeClientAPIRequest } from 'utils';

// called directly rather than through the inherited crust composable: sky vendors crust as a
// tarball, so a new crust export is only reachable after a republish + dep bump
const POOL_LIMIT = 100;

const { user } = useAuth();
const authStore = useAuthStore();

const activity = ref<Activity | null>(null);
const unrelated = ref(false);
const loading = ref(false);
const error = ref('');

async function draw() {
	if (loading.value || !user.value) return;

	loading.value = true;
	error.value = '';

	try {
		const res = await makeClientAPIRequest<{
			activity: Activity;
			unrelated: boolean;
			pool: number;
		}>(`/v2/users/current/activities/surprise?pool_limit=${POOL_LIMIT}`, authStore.sessionToken, {
			method: 'GET'
		});

		if (res.success && res.data?.activity) {
			activity.value = res.data.activity;
			unrelated.value = Boolean(res.data.unrelated);
		} else {
			error.value = extractServerMessage(res, 'Nothing unexpected to show right now.');
		}
	} catch (err) {
		error.value = extractServerMessage(err, 'Nothing unexpected to show right now.');
	} finally {
		loading.value = false;
	}
}

defineExpose({ draw });
</script>
