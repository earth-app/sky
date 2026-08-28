<template>
	<div
		id="admin-blacklist"
		class="flex flex-col gap-4"
	>
		<MSurface class="gap-2">
			<p class="m-eyebrow">Add an Entry</p>
			<IonSegment v-model="kind">
				<IonSegmentButton value="username"><IonLabel>Username</IonLabel></IonSegmentButton>
				<IonSegmentButton value="email"><IonLabel>Email</IonLabel></IonSegmentButton>
			</IonSegment>
			<IonInput
				v-model="value"
				:label="kind === 'username' ? 'Username' : 'Email'"
				label-placement="stacked"
				:placeholder="kind === 'username' ? 'someone' : 'someone@example.com'"
				:maxlength="128"
				autocapitalize="off"
				:spellcheck="false"
			/>
			<IonButton
				size="small"
				color="danger"
				:disabled="!canSubmit || busy"
				@click="add"
			>
				<UIcon
					name="mdi:plus"
					class="mr-1 size-4"
				/>
				{{ busy ? 'Adding...' : 'Add to Blacklist' }}
			</IonButton>
		</MSurface>

		<IonSegment v-model="filter">
			<IonSegmentButton value="username"><IonLabel>Usernames</IonLabel></IonSegmentButton>
			<IonSegmentButton value="email"><IonLabel>Emails</IonLabel></IonSegmentButton>
		</IonSegment>

		<template v-if="loading">
			<MSkeleton
				v-for="n in 3"
				:key="n"
				:height="56"
				width="100%"
			/>
		</template>

		<MEmptyState
			v-else-if="entries.length === 0"
			icon="mdi:shield-check-outline"
			title="Nothing Blacklisted"
			description="No entries of this kind are blocked."
			variant="primary"
		/>

		<MSurface
			v-for="entry in entries"
			:key="`${entry.kind}:${entry.value}`"
			:data-blacklist-row="entry.value"
			class="flex-row items-center justify-between gap-2 p-3"
		>
			<span class="min-w-0 truncate font-mono text-sm">{{ entry.value }}</span>
			<IonButton
				size="small"
				fill="clear"
				color="medium"
				:disabled="removing === entry.value"
				:aria-label="`Remove ${entry.value}`"
				@click="remove(entry)"
			>
				<UIcon
					name="mdi:close"
					class="size-4"
				/>
			</IonButton>
		</MSurface>
	</div>
</template>

<script setup lang="ts">
import { makeClientAPIRequest } from 'utils';
import { showErrorToast, showSuccessToast } from '~/composables/useNotify';

type BlacklistKind = 'username' | 'email';
type BlacklistEntry = { kind: BlacklistKind; value: string };

const authStore = useAuthStore();

const kind = ref<BlacklistKind>('username');
const filter = ref<BlacklistKind>('username');
const value = ref('');
const entries = ref<BlacklistEntry[]>([]);
const loading = ref(false);
const busy = ref(false);
const removing = ref<string | null>(null);

const canSubmit = computed(() => value.value.trim().length > 0);

async function load() {
	loading.value = true;
	try {
		const res = await makeClientAPIRequest<{ entries?: BlacklistEntry[] }>(
			`/v2/admin/blacklist?kind=${filter.value}`,
			authStore.sessionToken
		);
		if (!res.success || !res.data) {
			await showErrorToast(res.message || 'Could not load the blacklist.');
			entries.value = [];
			return;
		}
		// the endpoint filters by kind, but be defensive so a wider payload cannot mislabel a row
		entries.value = (res.data.entries ?? []).filter((entry) => entry.kind === filter.value);
	} finally {
		loading.value = false;
	}
}

async function add() {
	const trimmed = value.value.trim();
	if (!trimmed || busy.value) return;
	busy.value = true;

	try {
		const res = await makeClientAPIRequest('/v2/admin/blacklist', authStore.sessionToken, {
			method: 'POST',
			body: { kind: kind.value, value: trimmed }
		});
		if (!res.success) {
			await showErrorToast(res.message || 'Could not add that entry.');
			return;
		}

		value.value = '';
		await showSuccessToast('Added to the blacklist.');
		// show the list the entry actually landed in
		filter.value = kind.value;
		await load();
	} finally {
		busy.value = false;
	}
}

async function remove(entry: BlacklistEntry) {
	if (removing.value) return;
	removing.value = entry.value;

	try {
		const res = await makeClientAPIRequest(
			`/v2/admin/blacklist?kind=${entry.kind}&value=${encodeURIComponent(entry.value)}`,
			authStore.sessionToken,
			{ method: 'DELETE' }
		);
		if (!res.success) {
			await showErrorToast(res.message || 'Could not remove that entry.');
			return;
		}

		entries.value = entries.value.filter((row) => row.value !== entry.value);
		await showSuccessToast('Removed from the blacklist.');
	} finally {
		removing.value = null;
	}
}

watch(filter, () => void load());
onMounted(() => void load());
</script>
