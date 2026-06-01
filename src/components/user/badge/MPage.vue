<template>
	<div class="flex flex-col items-center px-4 gap-2">
		<!-- mastery surface: only the badge owner ever sees this; mantle2 403s cross-user anyway -->
		<section
			v-if="showMastery"
			class="w-full flex flex-col items-center gap-3"
		>
			<div class="w-full flex items-center justify-between">
				<h4 class="text-base font-semibold m-0! flex items-center gap-2">
					<UIcon
						name="mdi:medal-outline"
						class="size-5 text-warning"
					/>
					Available Mastery Quests
				</h4>
				<span
					v-if="masteryList"
					class="text-xs opacity-80 whitespace-nowrap"
				>
					{{ masteryList.active }} / {{ masteryList.cap }} slots
				</span>
			</div>

			<span
				v-if="masteryList && masteryCapReached"
				class="text-xs text-error text-center"
			>
				Complete or let one expire before generating another.
			</span>
			<span
				v-else-if="activeMasteryItems.length > 0"
				class="text-xs opacity-70 text-center"
			>
				Each generated mastery expires in
				{{ Math.round(masteryList!.ttl_seconds / 86400) }} days if left untouched.
			</span>

			<div
				v-if="masteryListLoading && !masteryList"
				class="py-2"
			>
				<Loading />
			</div>

			<div
				v-else-if="masteryList && activeMasteryItems.length === 0"
				class="text-xs opacity-60 text-center max-w-72 py-2"
			>
				No active mastery quests. Generate one from any completed badge below.
			</div>

			<IonList
				v-else-if="activeMasteryItems.length > 0"
				lines="full"
				class="w-full rounded-lg overflow-hidden bg-transparent! px-0!"
			>
				<IonItem
					v-for="item in activeMasteryItems"
					:key="item.quest.id"
					button
					detail
					class="py-1"
					:router-link="`/tabs/quests/${item.quest.id}`"
				>
					<UIcon
						slot="start"
						:name="item.quest.icon || 'mdi:medal-outline'"
						class="size-7 text-secondary mr-2"
					/>
					<IonLabel class="my-2">
						<h3 class="font-semibold text-sm m-0!">{{ item.quest.title }}</h3>
						<p class="text-xs opacity-70 m-0! whitespace-normal">
							<span v-if="masteryStatusFor(item)">{{ masteryStatusFor(item) }}</span>
						</p>
					</IonLabel>
					<IonBadge
						v-if="isCurrentQuest(item.quest.id) || expiresInDays(item) !== null"
						slot="end"
						:color="
							isCurrentQuest(item.quest.id)
								? 'primary'
								: expiresInDays(item)! <= 3
									? 'danger'
									: 'medium'
						"
						class="px-2 py-1"
					>
						{{ isCurrentQuest(item.quest.id) ? 'current' : `${expiresInDays(item)}d` }}
					</IonBadge>
				</IonItem>
			</IonList>
		</section>

		<h4 class="text-base m-0!">{{ completedBadges.length }} / {{ badges.length }} Completed</h4>
		<span class="text-sm opacity-80 mb-4">{{ loadedBadges.length }} shown</span>

		<div
			v-if="loadedBadges.length > 0"
			class="grid grid-cols-1 justify-items-center items-center gap-4"
		>
			<LazyUserBadgeMCard
				v-for="badge in loadedBadges"
				:key="badge.id"
				:badge="badge"
				hydrate-on-visible
			/>
		</div>
		<p
			v-else-if="normalizedSearch.length > 0"
			class="text-sm text-gray-500"
		>
			No badges found.
		</p>
		<div
			v-else
			class="flex items-center"
		>
			<Loading />
		</div>
	</div>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';
import type { MasteryListItem } from 'types/user';

const props = defineProps<{
	badges: UserBadge[];
	search?: string;
	userId?: string;
}>();

const userStore = useUserStore();
const { user: authUser } = useAuth();
const { fetchUserQuest, masteryList, fetchMasteryList } = useUser(props.userId);

const normalizedSearch = computed(() => props.search?.trim().toLowerCase() || '');

const loadedBadges = computed(() => {
	if (!normalizedSearch.value) return props.badges;

	return props.badges.filter((badge) => {
		const searchableValues = [
			badge.name,
			badge.description,
			badge.id,
			badge.rarity,
			badge.tracker_id
		].filter(Boolean);
		return searchableValues.some((value) => value?.toLowerCase().includes(normalizedSearch.value));
	});
});

const completedBadges = computed(() => props.badges.filter((b) => 'granted' in b && b.granted));

// the badge owner can be passed explicitly, otherwise infer from the first granted UserBadge —
// mastery surfacing is owner-only either way
const inferredOwnerId = computed(() => {
	if (props.userId) return props.userId;
	const owned = props.badges.find((b) => 'user_id' in b)?.user_id;
	return owned;
});
const isOwnProfile = computed(() => {
	const uid = inferredOwnerId.value;
	return !!uid && uid === authUser.value?.id;
});
const showMastery = computed(() => isOwnProfile.value);

const masteryListLoading = computed(() => {
	const uid = authUser.value?.id;
	if (!uid) return false;
	return userStore.masteryListLoading.has(uid);
});
const masteryCapReached = computed(() => {
	const list = masteryList.value;
	if (!list) return false;
	return list.active >= list.cap;
});

// hide finished masteries from the active list — completed masteries appear on the badge
// itself (mastered chip + Card.vue can re-open the completed timeline), so listing them
// here misled users into thinking the slot was still occupied
const activeMasteryItems = computed(
	() => masteryList.value?.items.filter((i) => !i.mastered) ?? []
);

function expiresInDays(item: MasteryListItem): number | null {
	if (item.mastered) return null;
	const days = DateTime.fromMillis(item.expires_at).diffNow('days').days;
	return days > 0 ? Math.ceil(days) : 0;
}

function isCurrentQuest(questId: string): boolean {
	const uid = authUser.value?.id;
	if (!uid) return false;
	return userStore.quest.get(uid)?.questId === questId;
}

function masteryStatusFor(item: MasteryListItem): string | null {
	if (isCurrentQuest(item.quest.id)) return 'currently in progress';
	const days = expiresInDays(item);
	if (days === null) return null;
	if (days <= 0) return 'expires soon';
	if (days === 1) return 'expires in 1 day';
	return `expires in ${days} days`;
}

onMounted(() => {
	if (!showMastery.value) return;
	const uid = authUser.value?.id;
	if (uid) {
		fetchUserQuest();
		fetchMasteryList();
	}
});

watch(isOwnProfile, (own) => {
	if (own && authUser.value) {
		fetchUserQuest();
		fetchMasteryList();
	}
});
</script>
