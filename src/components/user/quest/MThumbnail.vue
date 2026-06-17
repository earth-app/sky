<template>
	<IonCard
		v-if="quest"
		class="gap-4 p-4 shadow-lg dark:shadow-gray-800"
		:class="
			current
				? 'ring-4 ring-primary'
				: completed
					? 'ring-2 ring-warning-300'
					: 'ring-1 ring-neutral-300'
		"
		:router-link="canOpenPremium || !quest?.premium ? `/tabs/quests/${quest.id}` : undefined"
		@click="onCardTap"
	>
		<IonCardHeader>
			<div class="flex justify-between w-full px-2">
				<span
					v-if="completedCount > 0"
					class="text-sm"
				>
					{{ completedCount }} / {{ quest.steps.length }} completed</span
				>
				<span
					v-else
					class="text-sm underline opacity-80"
					>{{ quest.steps.length }} steps</span
				>

				<span class="text-sm underline opacity-80">{{ comma(fullReward) }} points</span>

				<UIcon
					v-if="quest.premium"
					name="mdi:diamond-stone"
					class="size-5 text-secondary"
				/>
			</div>
		</IonCardHeader>

		<IonCardContent class="mt-2">
			<div class="flex items-center gap-2">
				<UBadge
					:icon="quest.icon"
					:variant="completed ? 'solid' : completedCount > 0 ? 'subtle' : 'outline'"
					:color="completed ? 'primary' : 'neutral'"
					size="xl"
				/>

				<UBadge
					:color="rarityColor"
					variant="subtle"
					size="md"
					class="my-2"
					>{{ capitalizeFully(quest.rarity || '') }}</UBadge
				>
			</div>

			<div class="flex flex-col gap-2">
				<h1 class="font-semibold! text-lg!">{{ quest.title }}</h1>
				<span class="font-medium! opacity-90 text-base!">{{ quest.description }}</span>
				<span
					v-if="completedAt"
					class="text-sm! opacity-80"
					>Completed {{ completedAt }}</span
				>
			</div>
		</IonCardContent>

		<!-- premium upgrade modal disabled pending app store review (guideline 2.1(b)) -->
		<!--
		<IonModal
			:is-open="premiumOpen"
			@did-dismiss="premiumOpen = false"
		>
			<IonHeader>
				<IonToolbar class="px-2">
					<IonTitle>Upgrade to Access Premium Quests</IonTitle>
					<IonButtons slot="end">
						<IonButton
							fill="clear"
							color="danger"
							aria-label="Close upgrade prompt"
							@click="premiumOpen = false"
						>
							<UIcon
								name="mdi:close"
								class="size-5"
							/>
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent>
				<div class="p-4">
					<MRanks highlighted="PRO" />
				</div>
			</IonContent>
		</IonModal>
		-->
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { DateTime } from 'luxon';
import { capitalizeFully, comma } from 'utils';

const props = defineProps<{
	quest: Quest | null;
	progress?: (QuestProgressEntry | QuestProgressEntry[])[];
	current?: boolean;
	completedAt?: number;
}>();

const { user } = useAuth();
const quest = computed(() => props.quest);

const fullReward = computed(() => {
	if (!quest.value) return 0;
	let base = quest.value.reward || 0;
	for (let step of quest.value.steps.flatMap((s) => (Array.isArray(s) ? s : [s]))) {
		if (step.reward) base += step.reward;
	}

	return base;
});

const completedCount = computed(() => props.progress?.length || 0);
const completed = computed(() => {
	if (!quest.value) return false;
	if (props.completedAt) return true;

	return completedCount.value >= quest.value.steps.length;
});

const i18n = useI18n();
const completedAt = computed(() => {
	if (!props.completedAt) return null;
	return DateTime.fromMillis(props.completedAt).toRelative({ locale: i18n.locale.value });
});

const rarityColor = computed(() => {
	if (!quest.value) return 'neutral';
	switch (quest.value.rarity) {
		case 'normal':
			return 'neutral';
		case 'rare':
			return 'info';
		case 'amazing':
			return 'warning';
		case 'green':
			return 'primary';
	}
});

const canOpenPremium = computed(() => {
	if (!quest.value) return false;
	if (!quest.value.premium) return true;

	return user.value?.account.account_type !== 'FREE';
});

async function onCardTap() {
	if (quest.value?.premium && !canOpenPremium.value) {
		await Toast.show({ text: 'Premium quests are coming soon!', duration: 'long' });
	}
}
</script>
