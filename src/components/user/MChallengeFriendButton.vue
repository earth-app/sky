<template>
	<IonButton
		:size="size"
		:fill="fill"
		:expand="expand"
		color="warning"
		:disabled="sending"
		@click="onChallenge"
	>
		<UIcon
			name="mdi:sword-cross"
			class="size-5 mr-1"
		/>
		{{ label }}
	</IonButton>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { actionSheetController, IonButton } from '@ionic/vue';
import type { Quest } from 'types/user';
import { valid } from 'utils';

const props = withDefaults(
	defineProps<{
		friendId: string;
		friendName: string;
		size?: 'small' | 'default' | 'large';
		fill?: 'clear' | 'outline' | 'solid' | 'default';
		expand?: 'block' | 'full';
		label?: string;
	}>(),
	{ size: 'small', fill: 'outline', label: 'Challenge' }
);

const authStore = useAuthStore();
const selfId = computed(() => authStore.currentUser?.id ?? null);
const { notifySuccess, notifyError } = useAppHaptics();

// the challenge is always with one of the challenger's own quests (active or daily)
const { quest: activeQuest } = useUser(selfId);
const { quest: dailyQuest } = useDailyQuest();

const pickableQuests = computed<Quest[]>(() => {
	const byId = new Map<string, Quest>();
	const add = (q?: Quest | null) => {
		if (q && !byId.has(q.id)) byId.set(q.id, q);
	};
	add(activeQuest.value?.quest);
	add(dailyQuest.value);
	return Array.from(byId.values());
});

const sending = ref(false);

// resolve which quest to challenge with — auto-select a single option, else an
// action sheet. returns null when the user cancels.
async function pickQuestId(): Promise<string | null> {
	const quests = pickableQuests.value;
	if (quests.length === 1) return quests[0]!.id;

	return new Promise<string | null>((resolve) => {
		void actionSheetController
			.create({
				header: `Challenge ${props.friendName} to which Quest?`,
				buttons: [
					...quests.map((q) => ({
						text: q.title,
						handler: () => resolve(q.id)
					})),
					{ text: 'Cancel', role: 'cancel', handler: () => resolve(null) }
				]
			})
			.then((sheet) => {
				void sheet.present();
				// dismissal via backdrop/esc resolves null if no button handler fired
				void sheet.onDidDismiss().then(() => resolve(null));
			});
	});
}

async function onChallenge() {
	if (pickableQuests.value.length === 0) {
		void notifyError();
		await Toast.show({
			text: 'Start a quest first, then challenge a friend to it.',
			duration: 'short'
		});
		return;
	}

	const questId = await pickQuestId();
	if (!questId) return;

	sending.value = true;
	try {
		const res = await challengeFriend(props.friendId, questId);
		if (valid(res)) {
			void notifySuccess();
			await Toast.show({
				text: `${props.friendName} has been challenged. Game on.`,
				duration: 'short'
			});
		} else {
			void notifyError();
			await Toast.show({
				text: res.message || 'Could not send the challenge. Please try again.',
				duration: 'short'
			});
		}
	} finally {
		sending.value = false;
	}
}
</script>
