<template>
	<div
		id="admin-analytics"
		class="flex flex-col gap-4"
	>
		<IonSegment
			v-model="range"
			value="24h"
		>
			<IonSegmentButton value="24h"><IonLabel>24h</IonLabel></IonSegmentButton>
			<IonSegmentButton value="7d"><IonLabel>7 Days</IonLabel></IonSegmentButton>
			<IonSegmentButton value="30d"><IonLabel>30 Days</IonLabel></IonSegmentButton>
		</IonSegment>

		<template v-if="loading">
			<MSkeleton
				v-for="n in 3"
				:key="n"
				:height="96"
				width="100%"
			/>
		</template>

		<MEmptyState
			v-else-if="!snapshot"
			icon="mdi:chart-line-variant"
			title="No Analytics"
			description="Analytics could not be loaded for this range."
			variant="neutral"
		/>

		<MEmptyState
			v-else-if="!snapshot.configured"
			icon="mdi:cog-off-outline"
			title="Analytics Not Configured"
			description="The edge analytics source is not set up, so there is nothing to show."
			variant="neutral"
		/>

		<template v-else>
			<MSurface class="gap-2">
				<p class="m-eyebrow">Signup Funnel</p>
				<div class="grid grid-cols-3 gap-2">
					<MStat
						:value="funnel.signup_views"
						label="Views"
						icon="mdi:eye-outline"
					/>
					<MStat
						:value="funnel.signups_completed"
						label="Signups"
						icon="mdi:account-plus-outline"
					/>
					<MStat
						:value="funnel.verifications_completed"
						label="Verified"
						icon="mdi:check-decagram-outline"
					/>
				</div>
				<p class="m-0! text-2xs text-muted">
					{{
						signupRate === null
							? 'No signup views recorded yet'
							: `${signupRate}% of views completed a signup`
					}}
				</p>
			</MSurface>

			<MSurface class="gap-2">
				<p class="m-eyebrow">Requests by Country</p>
				<div
					v-for="row in topCountries"
					:key="row.dimensions.clientCountryName"
					class="flex items-center justify-between gap-2 text-sm"
				>
					<span class="truncate">{{ row.dimensions.clientCountryName || 'Unknown' }}</span>
					<span class="tabular-nums opacity-70">{{ row.sum.requests.toLocaleString() }}</span>
				</div>
				<p
					v-if="topCountries.length === 0"
					class="m-0! text-xs text-muted"
				>
					No requests in this range.
				</p>
			</MSurface>

			<MSurface class="gap-2">
				<p class="m-eyebrow">Responses by Status</p>
				<div class="flex flex-wrap gap-2">
					<IonBadge
						v-for="row in byStatus"
						:key="row.dimensions.edgeResponseStatus"
						:color="statusColor(row.dimensions.edgeResponseStatus)"
					>
						{{ row.dimensions.edgeResponseStatus }} - {{ row.sum.requests.toLocaleString() }}
					</IonBadge>
				</div>
			</MSurface>

			<MSurface class="gap-2">
				<p class="m-eyebrow">Top Paths</p>
				<div
					v-for="row in topPaths"
					:key="row.dimensions.clientRequestPath"
					class="flex items-center justify-between gap-2 text-xs"
				>
					<span class="truncate font-mono">{{ row.dimensions.clientRequestPath }}</span>
					<span class="shrink-0 tabular-nums opacity-70">{{
						row.sum.requests.toLocaleString()
					}}</span>
				</div>
			</MSurface>

			<p class="text-2xs text-muted">
				{{ snapshot.since }} to {{ snapshot.until }}. Read-only; changes stay on the web.
			</p>
		</template>
	</div>
</template>

<script setup lang="ts">
import { makeClientAPIRequest } from 'utils';

// mirrors crust's admin/Analytics.vue shape; sky vendors crust as a tarball so the type is inline
type AnalyticsSnapshot = {
	since: string;
	until: string;
	by_country: { dimensions: { clientCountryName: string }; sum: { requests: number } }[];
	by_status: { dimensions: { edgeResponseStatus: number }; sum: { requests: number } }[];
	top_paths: { dimensions: { clientRequestPath: string }; sum: { requests: number } }[];
	signup_funnel: {
		signup_views: number;
		signups_completed: number;
		verifications_completed: number;
	};
	configured: boolean;
};

const TOP_ROWS = 8;

const authStore = useAuthStore();
const snapshot = ref<AnalyticsSnapshot | null>(null);
const loading = ref(false);
const range = ref<'24h' | '7d' | '30d'>('24h');

const funnel = computed(
	() =>
		snapshot.value?.signup_funnel ?? {
			signup_views: 0,
			signups_completed: 0,
			verifications_completed: 0
		}
);

// an empty denominator is no measurement, not a zero rate
const signupRate = computed(() => {
	if (!funnel.value.signup_views) return null;
	return ((funnel.value.signups_completed / funnel.value.signup_views) * 100).toFixed(1);
});

const topCountries = computed(() =>
	[...(snapshot.value?.by_country ?? [])]
		.sort((a, b) => b.sum.requests - a.sum.requests)
		.slice(0, TOP_ROWS)
);
const byStatus = computed(() =>
	[...(snapshot.value?.by_status ?? [])].sort(
		(a, b) => a.dimensions.edgeResponseStatus - b.dimensions.edgeResponseStatus
	)
);
const topPaths = computed(() =>
	[...(snapshot.value?.top_paths ?? [])]
		.sort((a, b) => b.sum.requests - a.sum.requests)
		.slice(0, TOP_ROWS)
);

function statusColor(status: number): string {
	if (status >= 500) return 'danger';
	if (status >= 400) return 'warning';
	return 'success';
}

// the range is expressed as a `since` the api understands, same as crust
function rangeQuery(): string {
	const hours = range.value === '24h' ? 24 : range.value === '7d' ? 24 * 7 : 24 * 30;
	const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
	return `?since=${encodeURIComponent(since)}`;
}

async function load() {
	loading.value = true;
	try {
		const res = await makeClientAPIRequest<AnalyticsSnapshot>(
			`/v2/admin/analytics${rangeQuery()}`,
			authStore.sessionToken
		);
		snapshot.value = res.success && res.data ? res.data : null;
	} finally {
		loading.value = false;
	}
}

watch(range, () => void load());
onMounted(() => void load());
</script>
