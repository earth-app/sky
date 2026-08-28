<template>
	<div class="flex flex-col gap-5 w-full max-w-3xl mx-auto px-4 pb-8">
		<div
			id="activities-header"
			class="min-w-0"
		>
			<h2 class="text-xl! font-bold m-0!">Activities</h2>
			<p class="text-xs opacity-70 mt-1">
				{{ total ? `${total} ways` : 'Ways' }} to spend your time, from the ordinary to the ones
				nobody told you about.
			</p>
		</div>

		<IonSearchbar
			id="activity-search"
			:debounce="350"
			placeholder="Search Activities..."
			@ionInput="onSearch"
		/>

		<ActivityMSurprise v-if="user" />

		<UserPlanMComposer v-if="user" />

		<div id="activity-list">
			<div
				v-if="loading && !activities.length"
				class="grid grid-cols-1 sm:grid-cols-2 gap-3"
			>
				<MSkeleton
					v-for="n in 4"
					:key="n"
					:height="160"
					width="100%"
				/>
			</div>

			<div
				v-else-if="activities.length"
				class="grid grid-cols-1 sm:grid-cols-2 gap-3"
			>
				<ActivityMCard
					v-for="activity in activities"
					:key="activity.id"
					:activity="activity"
				/>
			</div>

			<MEmptyState
				v-else
				icon="mdi:magnify"
				:title="search ? 'No matches' : 'No activities yet'"
				:description="
					search
						? `Nothing in the catalog matches ${search}. Try a broader word.`
						: 'The catalog is still loading in. Pull down to refresh.'
				"
			/>
		</div>

		<IonInfiniteScroll
			:disabled="!hasMore"
			@ionInfinite="onInfinite"
		>
			<IonInfiniteScrollContent loading-spinner="dots" />
		</IonInfiniteScroll>
	</div>
</template>

<script setup lang="ts">
import type { Activity } from 'types/activity';

const PAGE_SIZE = 24;

const { user } = useAuth();
const { fetch: fetchActivities } = useActivities();

const activities = ref<Activity[]>([]);
const total = ref(0);
const page = ref(1);
const search = ref('');
const loading = ref(false);

const hasMore = computed(() => activities.value.length < total.value);

async function load(reset = false) {
	if (loading.value) return;
	loading.value = true;

	try {
		const nextPage = reset ? 1 : page.value;
		const res = await fetchActivities(nextPage, PAGE_SIZE, search.value);

		if (res.success && res.data) {
			const items = Array.isArray(res.data.items) ? res.data.items : [];
			// an id-keyed merge; the catalog is paginated server-side and pages can overlap
			const seen = new Set(reset ? [] : activities.value.map((a) => a.id));
			const merged = reset ? [] : [...activities.value];
			for (const item of items) {
				if (!item?.id || seen.has(item.id)) continue;
				seen.add(item.id);
				merged.push(item);
			}

			activities.value = merged;
			total.value = res.data.total ?? merged.length;
			page.value = nextPage + 1;
		}
	} finally {
		loading.value = false;
	}
}

async function onSearch(event: CustomEvent) {
	const value = (event.detail as { value?: string | null })?.value ?? '';
	if (value.trim() === search.value) return;

	search.value = value.trim();
	await load(true);
}

async function onInfinite(event: CustomEvent) {
	if (hasMore.value) await load();
	(event.target as HTMLIonInfiniteScrollElement | null)?.complete();
}

onMounted(() => void load(true));

defineExpose({ reload: () => load(true) });
</script>
