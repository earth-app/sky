<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Admin</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<IonRefresher
				slot="fixed"
				:disabled="loading"
				@ionRefresh="onRefresh"
			>
				<IonRefresherContent />
			</IonRefresher>

			<div
				v-if="user === undefined"
				class="flex flex-col gap-3 p-4"
			>
				<MSkeleton
					v-for="n in 3"
					:key="n"
					:height="96"
					width="100%"
				/>
			</div>

			<MEmptyState
				v-else-if="!isAdmin"
				icon="mdi:shield-lock-outline"
				title="Administrators Only"
				description="This Action is Protected and Prohibited for your account."
				cta-label="Back to Dashboard"
				cta-icon="mdi:view-dashboard-outline"
				cta-to="/tabs/dashboard"
				variant="neutral"
			/>

			<div
				v-else
				class="flex flex-col gap-4 p-4"
			>
				<IonSegment
					v-model="section"
					value="staged"
				>
					<IonSegmentButton value="staged">
						<IonLabel>Review</IonLabel>
					</IonSegmentButton>
					<IonSegmentButton value="analytics">
						<IonLabel>Analytics</IonLabel>
					</IonSegmentButton>
					<IonSegmentButton value="blacklist">
						<IonLabel>Blacklist</IonLabel>
					</IonSegmentButton>
				</IonSegment>

				<AdminMAnalytics v-if="section === 'analytics'" />
				<AdminMBlacklist v-else-if="section === 'blacklist'" />

				<template v-else>
					<MSurface class="gap-1">
						<p class="m-eyebrow">Staged Activities</p>
						<h2 class="m-0! text-lg! font-semibold">{{ headline }}</h2>
						<p class="m-0! text-xs text-muted">
							Approve or deny a submission. Bulk actions, editing and the rest of the admin suite
							stay on the web.
						</p>
					</MSurface>

					<template v-if="loading && items.length === 0">
						<MSkeleton
							v-for="n in 3"
							:key="n"
							:height="120"
							width="100%"
						/>
					</template>

					<MEmptyState
						v-else-if="items.length === 0"
						icon="mdi:check-decagram-outline"
						title="Nothing Waiting"
						description="Every submission has been reviewed."
						variant="primary"
					/>

					<MSurface
						v-for="item in items"
						:key="item.id"
						class="gap-2"
					>
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<h3 class="m-0! truncate text-base! font-semibold">
									{{ item.activity?.name || item.activity_id }}
								</h3>
								<p class="m-0! text-2xs text-muted">
									{{ submitterLabel(item) }} - expires {{ expiryLabel(item) }}
								</p>
							</div>
							<IonBadge :color="item.state === 'pending' ? 'warning' : 'medium'">
								{{ stateLabel(item.state) }}
							</IonBadge>
						</div>

						<p
							v-if="item.activity?.description"
							class="m-0! text-xs opacity-80"
						>
							{{ item.activity.description }}
						</p>

						<div
							v-if="item.note"
							class="rounded-lg bg-primary/5 p-2 text-xs"
						>
							{{ item.note }}
						</div>

						<div
							v-if="item.state === 'pending'"
							class="flex gap-2"
						>
							<IonButton
								size="small"
								color="primary"
								:disabled="busy[item.id] !== undefined"
								@click="decide(item, 'approve')"
							>
								<UIcon
									name="mdi:check"
									class="mr-1 size-4"
								/>
								{{ busy[item.id] === 'approve' ? 'Approving...' : 'Approve' }}
							</IonButton>
							<IonButton
								size="small"
								fill="outline"
								color="danger"
								:disabled="busy[item.id] !== undefined"
								@click="decide(item, 'deny')"
							>
								<UIcon
									name="mdi:close"
									class="mr-1 size-4"
								/>
								{{ busy[item.id] === 'deny' ? 'Denying...' : 'Deny' }}
							</IonButton>
						</div>
					</MSurface>

					<IonButton
						v-if="items.length < total"
						fill="clear"
						size="small"
						:disabled="loading"
						@click="loadMore"
					>
						Load More
					</IonButton>
				</template>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { makeClientAPIRequest } from 'utils';
import { showErrorToast, showSuccessToast } from '~/composables/useNotify';

// called straight against mantle2, matching the other sky-only admin-adjacent surfaces: sky vendors
// crust as a tarball, so a crust composable added today is not visible here until a republish
type StagedActivity = {
	id: number;
	activity_id: string;
	state: string;
	note?: string;
	expires_at?: string | number;
	submitter?: { username?: string } | null;
	submitter_kind?: string;
	activity?: { name?: string; description?: string } | null;
};

const PAGE_LIMIT = 25;

const { user } = useAuth();
const authStore = useAuthStore();

const section = ref<'staged' | 'analytics' | 'blacklist'>('staged');

const items = ref<StagedActivity[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const busy = reactive<Record<number, 'approve' | 'deny' | undefined>>({});

const isAdmin = computed(() => user.value?.account?.account_type === 'ADMINISTRATOR');

const headline = computed(() =>
	total.value === 1 ? '1 Submission Awaiting Review' : `${total.value} Awaiting Review`
);

function stateLabel(state: string): string {
	return state
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function submitterLabel(item: StagedActivity): string {
	if (item.submitter?.username) return `@${item.submitter.username}`;
	return item.submitter_kind === 'cloud' ? 'Discovered by Cloud' : 'Unknown Submitter';
}

function expiryLabel(item: StagedActivity): string {
	const raw = item.expires_at;
	if (!raw) return 'never';
	const at = typeof raw === 'number' ? new Date(raw * 1000) : new Date(raw);
	if (Number.isNaN(at.getTime())) return 'never';
	return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function load(reset = false) {
	if (!isAdmin.value || loading.value) return;
	loading.value = true;
	if (reset) page.value = 1;

	try {
		const res = await makeClientAPIRequest<{ items: StagedActivity[]; total: number }>(
			`/v2/activities/staged?state=pending&page=${page.value}&limit=${PAGE_LIMIT}`,
			authStore.sessionToken
		);
		if (!res.success || !res.data) {
			await showErrorToast(res.message || 'Could not load staged activities.');
			return;
		}

		const incoming = res.data.items ?? [];
		items.value = reset || page.value === 1 ? incoming : [...items.value, ...incoming];
		total.value = res.data.total ?? items.value.length;
	} finally {
		loading.value = false;
	}
}

async function loadMore() {
	page.value += 1;
	await load();
}

async function decide(item: StagedActivity, action: 'approve' | 'deny') {
	if (busy[item.id]) return;
	busy[item.id] = action;

	try {
		const res = await makeClientAPIRequest<StagedActivity>(
			`/v2/activities/staged/${item.id}/${action}`,
			authStore.sessionToken,
			{ method: 'POST', body: {} }
		);
		if (!res.success) {
			await showErrorToast(res.message || `Could not ${action} this submission.`);
			return;
		}

		// drop the row rather than refetching the page: the list is pending-only
		items.value = items.value.filter((row) => row.id !== item.id);
		total.value = Math.max(0, total.value - 1);
		await showSuccessToast(action === 'approve' ? 'Submission approved.' : 'Submission denied.');
	} finally {
		busy[item.id] = undefined;
	}
}

async function onRefresh(event: CustomEvent) {
	try {
		await load(true);
	} finally {
		(event.target as HTMLIonRefresherElement | null)?.complete();
	}
}

watch(isAdmin, (admin) => {
	if (admin) void load(true);
});

onMounted(() => {
	if (isAdmin.value) void load(true);
});

setTitleSuffix('Admin');
</script>
