<template>
	<IonCard
		class="m-0 p-4 rounded-xl bg-linear-to-br from-primary/10 via-secondary/5 to-transparent"
	>
		<div class="flex items-center gap-2 mb-1">
			<UIcon
				name="mdi:account-multiple-plus"
				class="size-6 text-primary"
			/>
			<h3 class="text-lg font-semibold m-0!">Invite Friends</h3>
		</div>
		<p class="text-sm text-gray-500 mb-4">
			Share your link — when a friend joins, you both move up the Recruiter ranks.
		</p>

		<div class="flex flex-col gap-2 mb-4">
			<IonInput
				:value="inviteUrl"
				readonly
				fill="outline"
				class="font-mono text-sm"
				aria-label="Your invite link"
			/>
			<div class="flex gap-2">
				<IonButton
					color="primary"
					class="flex-1"
					:disabled="!inviteUrl"
					@click="onCopy"
				>
					<UIcon
						name="mdi:content-copy"
						class="size-5 mr-2"
					/>
					Copy Link
				</IonButton>
				<Share
					v-if="inviteUrl"
					:payload="sharePayload"
				/>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-3 mb-4">
			<div class="flex flex-col items-center p-3 rounded-lg bg-black/5 light:bg-white/5">
				<span class="text-2xl font-bold text-primary">{{ clicks }}</span>
				<span class="text-xs text-gray-500">Link Clicks</span>
			</div>
			<div class="flex flex-col items-center p-3 rounded-lg bg-black/5 light:bg-white/5">
				<span class="text-2xl font-bold text-success">{{ conversions }}</span>
				<span class="text-xs text-gray-500">Friends Joined</span>
			</div>
		</div>

		<div class="flex flex-col gap-1">
			<div class="flex items-center justify-between text-sm">
				<span class="font-medium">{{ tierLabel }}</span>
				<span class="text-gray-500">
					<template v-if="nextTier">{{ conversions }} / {{ nextTier }}</template>
					<template v-else>Max tier reached</template>
				</span>
			</div>
			<UProgress
				:model-value="tierProgress"
				color="primary"
				size="sm"
			/>
			<p
				v-if="nextTier"
				class="text-xs text-gray-500"
			>
				{{ nextTier - conversions }} more to reach the next Recruiter tier.
			</p>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { IonCard } from '@ionic/vue';

// recruiter tiers — friends-joined thresholds
const TIERS = [1, 5, 25] as const;

const { inviteUrl, stats, fetchCode, fetchStats, copyLink } = useReferral();
const { notifySuccess, notifyError } = useAppHaptics();

const clicks = computed(() => stats.value?.clicks ?? 0);
const conversions = computed(() => stats.value?.conversions ?? 0);

const sharePayload = computed(() => ({
	title: 'Join me on The Earth App',
	text: 'I’m exploring activities, quests, and events on The Earth App — come join me.',
	url: inviteUrl.value
}));

const nextTier = computed<number | null>(() => TIERS.find((t) => conversions.value < t) ?? null);

const tierLabel = computed(() => {
	const reached = TIERS.filter((t) => conversions.value >= t).length;
	if (reached === 0) return 'Newcomer';
	if (reached === 1) return 'Recruiter';
	if (reached === 2) return 'Connector';
	return 'Ambassador';
});

const tierProgress = computed(() => {
	if (!nextTier.value) return 100;
	const prev = TIERS.filter((t) => t < nextTier.value!).pop() ?? 0;
	const span = nextTier.value - prev;
	if (span <= 0) return 100;
	return Math.min(100, Math.round(((conversions.value - prev) / span) * 100));
});

async function onCopy() {
	const ok = await copyLink();
	if (ok) {
		void notifySuccess();
		await Toast.show({ text: 'Invite link copied to clipboard.', duration: 'short' });
	} else {
		void notifyError();
		await Toast.show({ text: 'Could not copy the link. Try sharing instead.', duration: 'short' });
	}
}

onMounted(async () => {
	await fetchCode();
	await fetchStats();
});
</script>
