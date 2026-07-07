<template>
	<IonCard
		class="m-0! p-2 rounded-xl! border-2 border-gray-700 light:border-gray-300 overflow-hidden"
	>
		<IonCardHeader class="flex items-center pb-4">
			<div class="flex items-center gap-2">
				<IonIcon
					:icon="pulseOutline"
					class="text-base text-primary"
				/>
				<IonCardSubtitle class="uppercase tracking-wide text-xs">Mood Spark</IonCardSubtitle>
			</div>
			<IonCardTitle class="text-base! text-center font-medium! my-2!">{{ question }}</IonCardTitle>
		</IonCardHeader>
		<IonCardContent class="pt-2 pb-3">
			<div
				v-if="!showResults"
				class="grid grid-cols-3 gap-2"
			>
				<button
					v-for="emoji in EMOJIS"
					:key="emoji"
					type="button"
					:disabled="loading"
					:aria-label="`Vote ${MOOD_LABELS[emoji]}`"
					class="flex flex-col items-center gap-1 py-2! rounded-lg! border-2! border-gray-700! light:border-gray-300! bg-accented/5! active:scale-95! transition-transform disabled:opacity-50"
					@click="onVote(emoji)"
				>
					<span class="text-3xl">{{ emoji }}</span>
					<span class="text-[10px] uppercase tracking-wide text-medium">{{
						MOOD_LABELS[emoji]
					}}</span>
				</button>
			</div>

			<div
				v-else
				class="flex flex-col gap-2"
			>
				<div
					v-for="emoji in EMOJIS"
					:key="`bar-${emoji}`"
					class="flex items-center gap-2"
				>
					<span class="text-lg shrink-0 w-7 text-center">{{ emoji }}</span>
					<IonProgressBar
						:value="percentages[emoji] / 100"
						:color="myVote === emoji ? 'primary' : 'medium'"
						class="flex-1 min-w-0"
					/>
					<span
						class="text-xs tabular-nums w-10 text-right whitespace-nowrap shrink-0"
						:class="myVote === emoji ? 'font-semibold text-primary' : 'text-medium'"
						>{{ percentages[emoji] }}%</span
					>
				</div>
				<p class="text-xs font-medium text-primary mt-1">
					{{ votedThisSession ? 'Thanks for Sharing Today' : "You've Already Shared Today" }}
				</p>
				<p
					v-if="snapshot && snapshot.total > 0"
					class="text-xs text-medium"
				>
					{{ snapshot.total }} {{ snapshot.total === 1 ? 'voice' : 'voices' }} today
				</p>
			</div>

			<UAlert
				v-if="errorMessage"
				color="error"
				variant="subtle"
				icon="mdi:alert-circle"
				:title="errorMessage"
				:close="{ color: 'error', variant: 'link' }"
				class="mt-2! text-xs!"
				@update:open="errorMessage = null"
			/>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import {
	IonCard,
	IonCardContent,
	IonCardHeader,
	IonCardSubtitle,
	IonCardTitle,
	IonIcon,
	IonProgressBar
} from '@ionic/vue';
import { pulseOutline } from 'ionicons/icons';
import { showErrorToast, showInfoToast } from '~/composables/useNotify';
import { computeMoodPercentages, moodMyVoteStorageKey, moodTodayUtc } from '~/utils/mood';

const props = withDefaults(
	defineProps<{
		topic?: string;
		question?: string;
	}>(),
	{
		topic: 'today',
		question: 'How are you feeling about today?'
	}
);

const emit = defineEmits<{
	(event: 'complete', payload: { emoji: MoodEmoji }): void;
}>();

const { snapshot, hasVoted, vote, fetchSnapshot, EMOJIS } = useMood(() => props.topic);
const haptics = useAppHaptics();

const MOOD_LABELS: Record<MoodEmoji, string> = {
	'😍': 'Love',
	'😊': 'Good',
	'🤔': 'Curious',
	'😐': 'Meh',
	'😟': 'Worried',
	'😤': 'Frustrated'
};

const myVote = ref<MoodEmoji | null>(null);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
// true only for a vote cast this mount; a reloaded prior vote reads back as false
const votedThisSession = ref(false);

// localStorage-backed hasVoted isn't reactive to a fresh vote, so also flip on myVote
const showResults = computed(() => hasVoted.value || myVote.value !== null);

const percentages = computed<Record<MoodEmoji, number>>(() =>
	computeMoodPercentages(snapshot.value?.counts, snapshot.value?.total ?? 0, EMOJIS)
);

function normalizedTopic(): string {
	return props.topic.trim().toLowerCase();
}

// re-highlight the bar this device picked earlier today (crust's guard only stores a timestamp)
function readPersistedVote(): MoodEmoji | null {
	if (!import.meta.client) return null;
	try {
		const v = window.localStorage.getItem(moodMyVoteStorageKey(normalizedTopic(), moodTodayUtc()));
		return v && (EMOJIS as readonly string[]).includes(v) ? (v as MoodEmoji) : null;
	} catch {
		return null;
	}
}

function persistVote(emoji: MoodEmoji) {
	if (!import.meta.client) return;
	try {
		window.localStorage.setItem(moodMyVoteStorageKey(normalizedTopic(), moodTodayUtc()), emoji);
	} catch {
		// no localStorage; highlight just won't survive a reload
	}
}

async function onVote(emoji: MoodEmoji) {
	if (loading.value || hasVoted.value) return;
	loading.value = true;
	errorMessage.value = null;
	haptics.selection();

	const res = await vote(props.topic, emoji);
	loading.value = false;

	if (res.success) {
		myVote.value = emoji;
		votedThisSession.value = true;
		persistVote(emoji);
		haptics.notifySuccess();
		emit('complete', { emoji });
		showInfoToast('Mood recorded.');
	} else {
		errorMessage.value = res.error ?? 'Could not record your mood.';
		if (!res.error?.toLowerCase().includes('already')) {
			haptics.notifyWarning();
			showErrorToast(res.error ?? 'Could not record your mood.');
		}
	}
}

onMounted(async () => {
	// restore the prior highlight before the snapshot lands so the correct bar lights up
	if (hasVoted.value) myVote.value = readPersistedVote();
	await fetchSnapshot();
});
</script>
