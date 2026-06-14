<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/settings" />
				</IonButtons>
				<IonTitle>Moderation Status</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full px-4 pb-8 max-w-3xl mx-auto">
				<p class="text-sm opacity-80 text-center mt-4 mb-4">
					Your account standing and any content removed by moderators. Repeated violations can
					temporarily disable or suspend your account.
				</p>

				<div
					v-if="loading"
					class="flex items-center justify-center w-full py-12"
				>
					<IonSpinner name="crescent" />
				</div>

				<template v-else-if="status">
					<div class="flex flex-col items-center gap-2 mb-4">
						<IonChip
							:color="standingColor"
							class="px-4"
						>
							<UIcon
								:name="standingIcon"
								class="mr-1"
							/>
							{{ standingLabel }}
						</IonChip>
						<div class="text-sm opacity-80">{{ status.count }} of 3 strikes used</div>
						<div
							v-if="disabledUntilText"
							class="text-xs opacity-70"
						>
							Restricted until {{ disabledUntilText }}
						</div>
					</div>

					<div
						v-if="status.history.length === 0"
						class="w-full rounded-xl border border-black/20 light:border-gray-300 px-6 py-10 text-center"
					>
						<UIcon
							name="mdi:shield-check-outline"
							class="size-10 text-success mb-2"
						/>
						<h2 class="text-base! font-semibold m-0! mb-2!">All clear</h2>
						<p class="text-sm opacity-80 m-0!">No moderation actions on your account.</p>
					</div>

					<IonList
						v-else
						class="w-full rounded-xl border border-black/20 light:border-gray-300"
					>
						<IonItem
							v-for="(entry, i) in status.history"
							:key="`${entry.content_id}-${i}`"
							lines="inset"
						>
							<div class="flex flex-col w-full py-2 gap-1">
								<div class="flex items-center justify-between gap-2">
									<span class="text-sm font-semibold">{{ reasonLabel(entry.reason) }}</span>
									<IonChip
										:color="entry.source === 'ai' ? 'tertiary' : 'medium'"
										class="m-0!"
									>
										{{ entry.source === 'ai' ? 'AI' : 'Report' }}
									</IonChip>
								</div>
								<div class="text-xs opacity-70 flex flex-wrap gap-x-3 gap-y-0.5">
									<span>{{ contentTypeLabel(entry.content_type) }}</span>
									<span>{{ relative(entry.at) }}</span>
								</div>
								<p
									v-if="entry.preview"
									class="text-xs italic opacity-80 m-0! mt-1"
								>
									{{ entry.preview }}
								</p>
								<p
									v-if="entry.action_notes"
									class="text-xs opacity-80 m-0! mt-1"
								>
									Moderator note: {{ entry.action_notes }}
								</p>
							</div>
						</IonItem>
					</IonList>
				</template>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';
import type { ContentType, ReportReason, ReportSource } from 'types/report';
import { reportReasonLabel } from 'types/report';
import { makeClientAPIRequest } from 'utils';
import { showErrorToast } from '~/composables/useNotify';

type StrikeHistoryEntry = {
	content_type: ContentType;
	content_id: string;
	reason: ReportReason;
	source: ReportSource;
	at: number;
	report_id?: string;
	action_notes?: string;
	preview?: string;
};

type ModerationStatus = {
	count: number;
	cycles: number;
	banned: boolean;
	disabled_until?: number;
	updated_at: number;
	strikes_remaining: number;
	standing: 'ok' | 'disabled' | 'banned';
	history: StrikeHistoryEntry[];
};

const authStore = useAuthStore();

const status = ref<ModerationStatus | null>(null);
const loading = ref(true);

const standingLabel = computed(() => {
	switch (status.value?.standing) {
		case 'banned':
			return 'Suspended';
		case 'disabled':
			return 'Temporarily Disabled';
		default:
			return 'Good Standing';
	}
});

const standingColor = computed(() => {
	switch (status.value?.standing) {
		case 'banned':
			return 'danger';
		case 'disabled':
			return 'warning';
		default:
			return 'success';
	}
});

const standingIcon = computed(() => {
	switch (status.value?.standing) {
		case 'banned':
			return 'mdi:account-cancel';
		case 'disabled':
			return 'mdi:account-clock';
		default:
			return 'mdi:shield-check';
	}
});

const disabledUntilText = computed(() => {
	const until = status.value?.disabled_until;
	if (!until) return '';
	return DateTime.fromMillis(until).toLocaleString(DateTime.DATETIME_MED);
});

function reasonLabel(reason: ReportReason): string {
	return reportReasonLabel(reason);
}

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
	prompt: 'Prompt',
	prompt_response: 'Response',
	article: 'Article',
	event: 'Event',
	event_image: 'Image',
	user: 'Profile'
};
function contentTypeLabel(type: ContentType): string {
	return CONTENT_TYPE_LABELS[type] ?? type;
}

function relative(at: number): string {
	return DateTime.fromMillis(at).toRelative() ?? '';
}

async function fetchModeration() {
	const res = await makeClientAPIRequest<ModerationStatus>(
		'/v2/users/current/moderation',
		authStore.sessionToken
	);
	if (res.success && res.data) {
		status.value = res.data;
	} else {
		await showErrorToast(res.message, { fallback: 'Could not load your moderation status.' });
	}
}

onMounted(async () => {
	try {
		await fetchModeration();
	} finally {
		loading.value = false;
	}
});
</script>
