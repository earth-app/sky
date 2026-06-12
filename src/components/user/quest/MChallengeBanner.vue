<template>
	<div
		v-if="challenge"
		id="quest-challenge-banner"
		class="my-3 w-full"
	>
		<!-- recipient is being asked to accept -->
		<UAlert
			v-if="status === 'pending' && role === 'recipient'"
			color="warning"
			variant="subtle"
			icon="mdi:sword-cross"
			:title="`${challengerHandle} challenged you to this quest`"
			description="Accept to start a co-op run — you'll both work through it side by side."
		>
			<template #actions>
				<IonButton
					color="success"
					size="small"
					:disabled="acting"
					@click="onAccept"
				>
					<UIcon
						name="mdi:check"
						class="mr-1"
					/>
					Accept
				</IonButton>
				<IonButton
					color="medium"
					fill="outline"
					size="small"
					:disabled="acting"
					@click="onDecline"
				>
					<UIcon
						name="mdi:close"
						class="mr-1"
					/>
					Decline
				</IonButton>
			</template>
		</UAlert>

		<!-- challenger waiting for the recipient -->
		<UAlert
			v-else-if="status === 'pending' && role === 'challenger'"
			color="neutral"
			variant="subtle"
			icon="mdi:timer-sand"
			:title="`Waiting for ${recipientHandle} to accept your challenge`"
			description="We'll start the shared timeline as soon as they're in."
		/>

		<!-- shared-progress card for an accepted (or finished) challenge -->
		<div
			v-else-if="status === 'active' || status === 'completed'"
			class="rounded-lg border border-default bg-elevated/50 p-4"
		>
			<div class="flex items-center gap-2 mb-3">
				<UIcon
					name="mdi:handshake-outline"
					class="size-5 text-primary"
				/>
				<span class="font-semibold text-sm">You're in this together</span>
				<UBadge
					v-if="otherCompleted"
					color="warning"
					variant="subtle"
					size="xs"
					icon="mdi:flag-checkered"
					class="ml-auto"
					>{{ otherHandle }} finished</UBadge
				>
			</div>

			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between text-sm">
						<span class="font-medium">You</span>
						<span class="opacity-80">{{ yourSteps }}/{{ total }}</span>
					</div>
					<IonProgressBar
						:value="yourFraction"
						color="primary"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between text-sm">
						<span class="font-medium">{{ otherHandle }}</span>
						<span class="opacity-80">{{ otherSteps }}/{{ otherTotal }}</span>
					</div>
					<IonProgressBar
						:value="otherFraction"
						color="secondary"
					/>
				</div>
			</div>

			<p
				v-if="otherCompleted"
				class="text-xs text-warning mt-3"
			>
				They finished — catch up!
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	questId: string;
	// the viewer's own completed-step count + quest length, passed from the page so
	// the "You" row matches the timeline exactly. falls back to the other side's totals.
	yourCompletedSteps?: number;
	totalSteps?: number;
}>();

const questIdRef = computed(() => props.questId);
const { challenge, otherUser, otherProgress, role, status, fetch, accept, decline } =
	useQuestChallenge(questIdRef);

const acting = ref(false);

const { handle: challengerHandle } = useDisplayName(
	() => (challenge.value ? { username: challenge.value.challenger_name } : null),
	{ anonymous: 'a friend' }
);
const { handle: recipientHandle } = useDisplayName(
	() => (challenge.value ? { username: challenge.value.recipient_name } : null),
	{ anonymous: 'a friend' }
);
const { handle: otherHandle } = useDisplayName(() => otherUser.value, { anonymous: 'your friend' });

const yourSteps = computed(() => props.yourCompletedSteps ?? 0);
const total = computed(() => props.totalSteps ?? otherProgress.value?.total_steps ?? 0);
const otherSteps = computed(() => otherProgress.value?.current_step ?? 0);
const otherTotal = computed(() => otherProgress.value?.total_steps ?? total.value);
const otherCompleted = computed(() => otherProgress.value?.completed === true);

// IonProgressBar wants a 0..1 fraction, not a raw step count
const yourFraction = computed(() => (total.value > 0 ? yourSteps.value / total.value : 0));
const otherFraction = computed(() =>
	otherTotal.value > 0 ? otherSteps.value / otherTotal.value : 0
);

async function onAccept() {
	if (acting.value) return;
	acting.value = true;
	try {
		const res = await accept();
		await Toast.show({
			text: valid(res) ? "You're in — race you to the finish." : res.message || 'Please try again.',
			duration: 'long'
		});
	} finally {
		acting.value = false;
	}
}

async function onDecline() {
	if (acting.value) return;
	acting.value = true;
	try {
		const res = await decline();
		await Toast.show({
			text: valid(res) ? 'Challenge declined.' : res.message || 'Please try again.',
			duration: 'long'
		});
	} finally {
		acting.value = false;
	}
}

onMounted(() => {
	void fetch();
});
</script>
