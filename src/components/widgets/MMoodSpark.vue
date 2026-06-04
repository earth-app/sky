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
				v-if="!hasVoted"
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
						class="flex-1"
					/>
					<span
						class="text-xs tabular-nums w-9 text-right"
						:class="myVote === emoji ? 'font-semibold text-primary' : 'text-medium'"
						>{{ percentages[emoji] }}%</span
					>
				</div>
				<p
					v-if="snapshot && snapshot.total > 0"
					class="text-xs text-medium mt-1"
				>
					{{ snapshot.total }} {{ snapshot.total === 1 ? 'voice' : 'voices' }} today
				</p>
			</div>

			<p
				v-if="errorMessage"
				class="text-xs text-danger mt-2"
			>
				{{ errorMessage }}
			</p>
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

const percentages = computed<Record<MoodEmoji, number>>(() => {
	const counts = snapshot.value?.counts;
	const total = snapshot.value?.total ?? 0;
	const out = {} as Record<MoodEmoji, number>;
	for (const e of EMOJIS) {
		const v = counts?.[e] ?? 0;
		out[e] = total > 0 ? Math.round((v / total) * 100) : 0;
	}
	return out;
});

async function onVote(emoji: MoodEmoji) {
	if (loading.value || hasVoted.value) return;
	loading.value = true;
	errorMessage.value = null;
	haptics.selection();

	const res = await vote(props.topic, emoji);
	loading.value = false;

	if (res.success) {
		myVote.value = emoji;
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
	await fetchSnapshot();
});
</script>
