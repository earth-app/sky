import { actionSheetController } from '@ionic/vue';
import type { Quest } from 'types/user';
import { valid } from 'utils';

export type ChallengeOutcome =
	| { status: 'no-quests' }
	| { status: 'cancelled' }
	| { status: 'sent' }
	| { status: 'error'; error: unknown; message?: string };

// shared challenge flow: pick one of the challenger's own quests (active or daily) and
// POST it to a friend. callers surface their own toasts/haptics.
export function useChallengeFriend() {
	const authStore = useAuthStore();
	const selfId = computed(() => authStore.currentUser?.id ?? null);

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

	// resolve which quest to challenge with: auto-select a single option, else an action
	// sheet. returns null when the user cancels (backdrop/esc resolves null too).
	async function pickQuestId(friendName: string): Promise<string | null> {
		const quests = pickableQuests.value;
		if (quests.length === 0) return null;
		if (quests.length === 1) return quests[0]!.id;

		return new Promise<string | null>((resolve) => {
			void actionSheetController
				.create({
					header: `Challenge ${friendName} to which Quest?`,
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
					void sheet.onDidDismiss().then(() => resolve(null));
				});
		});
	}

	// full flow: ensure a quest exists, resolve it, then POST
	async function challenge(friendId: string, friendName: string): Promise<ChallengeOutcome> {
		if (pickableQuests.value.length === 0) return { status: 'no-quests' };

		const questId = await pickQuestId(friendName);
		if (!questId) return { status: 'cancelled' };

		const res = await challengeFriend(friendId, questId);
		if (valid(res)) return { status: 'sent' };
		return { status: 'error', error: res, message: (res as { message?: string })?.message };
	}

	return { pickableQuests, pickQuestId, challenge };
}
