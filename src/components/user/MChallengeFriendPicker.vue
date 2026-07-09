<template>
	<IonModal
		:is-open="isOpen"
		@did-dismiss="onDidDismiss"
	>
		<IonHeader>
			<IonToolbar>
				<IonTitle>
					<div class="flex justify-center items-center gap-2">
						<UAvatar
							slot="start"
							:src="avatarSrc(authStore.currentUser!)"
							:alt="authStore.currentUser?.username"
							size="sm"
						/>
						Challenge a Friend
					</div>
				</IonTitle>
				<IonButtons slot="end">
					<IonButton
						aria-label="Close"
						@click="close"
					>
						<UIcon
							slot="icon-only"
							name="mdi:close"
							class="size-6"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent>
			<div class="flex justify-between items-center w-full px-2 mt-2">
				<LazyIonSearchbar
					id="challenge-friend-search"
					v-model="search"
					placeholder="Search Friends..."
					:color="theme"
					class="w-full max-w-2xl p-0!"
					@keyup.enter="loadFriends"
					hydrate-on-interaction
				/>

				<IonButton
					:disabled="loading"
					@click="loadFriends"
					fill="clear"
					size="small"
					class="ml-2 size-8"
				>
					<UIcon
						name="mdi:refresh"
						class="min-w-5 min-h-5"
					/>
				</IonButton>
			</div>

			<div
				v-if="loading"
				class="flex justify-center py-12"
			>
				<IonSpinner name="crescent" />
			</div>

			<div
				v-else-if="rows.length === 0 && friends.length === 0 && circle.length === 0"
				id="challenge-empty-state"
				class="flex flex-col items-center gap-3 px-6 py-16 text-center"
			>
				<UIcon
					name="mdi:account-multiple-outline"
					class="size-12 text-gray-400"
				/>
				<p class="text-sm text-gray-500">Add friends to challenge them to your quests.</p>
				<IonButton
					fill="outline"
					color="primary"
					@click="findFriends"
				>
					Find Friends
				</IonButton>
			</div>

			<div
				v-else-if="rows.length === 0"
				id="challenge-no-results"
				class="flex flex-col items-center gap-3 px-6 py-16 text-center"
			>
				<UIcon
					name="mdi:account-multiple-outline"
					class="size-12 text-gray-400"
				/>
				<p class="text-sm text-gray-500">
					No friends found matching your search. Try refreshing the list.
				</p>
			</div>

			<div
				class="flex flex-col items-center w-full"
				v-else
			>
				<LazyIonList
					id="challenge-friend-list"
					class="w-full"
					lines="full"
					hydrate-on-interaction
				>
					<IonItem
						v-for="row in rows"
						:key="row.user.id"
						button
						class="challenge-friend-row w-full"
						:data-username="row.user.username"
						:disabled="!!sendingId"
						@click="onSelect(row)"
					>
						<UAvatar
							slot="start"
							:src="avatarSrc(row.user)"
							:alt="row.user.username"
							size="md"
						/>
						<IonLabel class="ml-2">
							<h2 class="font-semibold!">{{ displayName(row.user) }}</h2>
							<p class="text-xs! text-gray-500!">@{{ row.user.username }}</p>
						</IonLabel>
						<div
							slot="end"
							class="flex items-center gap-2"
						>
							<IonChip
								v-if="row.user.is_in_my_circle"
								color="warning"
								class="text-xs! font-semibold! m-0! h-8! px-2"
							>
								<UIcon
									name="mdi:account-group"
									class="size-3! mr-1!"
								/>
								In Your Circle
							</IonChip>

							<IonChip
								v-if="row.recommended"
								color="primary"
								class="text-xs! font-semibold! m-0!"
							>
								<UIcon
									name="mdi:star-four-points"
									class="size-3! mr-1!"
								/>
								Recommended
							</IonChip>
							<IonSpinner
								v-if="sendingId === row.user.id"
								name="crescent"
							/>
							<UIcon
								v-else
								name="mdi:sword-cross"
								class="size-5! text-success!"
							/>
						</div>
					</IonItem>
				</LazyIonList>

				<span class="text-sm text-gray-500 mt-2"> Showing {{ rows.length }} friends </span>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonButtons,
	IonChip,
	IonContent,
	IonHeader,
	IonItem,
	IonLabel,
	IonModal,
	IonSpinner,
	IonTitle,
	IonToolbar,
	useIonRouter
} from '@ionic/vue';
import type { User } from 'types/user';
import { getUserDisplayName } from 'utils';
import { sortFriendsForChallenge } from '~/utils/challengeFriends';

const props = defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<{
	(event: 'update:isOpen', value: boolean): void;
}>();

const router = useIonRouter();
const authStore = useAuthStore();
const avatarStore = useAvatarStore();
const { selection } = useAppHaptics();

const { friends, circle, fetchFriends, fetchCircle } = useFriends();
const { challenge } = useChallengeFriend();

const loading = ref(false);
const sendingId = ref<string | null>(null);
const search = ref('');

// friends + circle (deduped); circle members are marked so they float to the top, then
// sorted (circle-first / last_login desc / alpha) with the newest friend tagged
const rows = computed(() => {
	const searchLower = search.value.toLowerCase();
	const circleIds = new Set(circle.value.map((c) => c.id));
	const merged = new Map<string, User>();
	for (const f of friends.value) merged.set(f.id, f);
	for (const c of circle.value) if (!merged.has(c.id)) merged.set(c.id, c);

	const list = Array.from(merged.values())
		.map((u) => (circleIds.has(u.id) && !u.is_in_my_circle ? { ...u, is_in_my_circle: true } : u))
		.filter(
			(u) =>
				u.username.toLowerCase().includes(searchLower) ||
				getUserDisplayName(u).toLowerCase().includes(searchLower)
		);
	return sortFriendsForChallenge(list, authStore.currentUser?.friends ?? []);
});

async function loadFriends() {
	loading.value = true;
	try {
		await Promise.all([fetchFriends(), fetchCircle()]);
	} finally {
		loading.value = false;
	}
}

// fetch only when the modal opens (avoids an eager call on page mount)
watch(
	() => props.isOpen,
	(open) => {
		if (open) void loadFriends();
	}
);

function close() {
	emit('update:isOpen', false);
}

// keep the controlled ref in sync so the modal can be reopened after a gesture dismiss
function onDidDismiss() {
	emit('update:isOpen', false);
}

function avatarSrc(user: User): string {
	return avatarStore.safeUrl(user.account?.avatar_url, 'avatar128');
}

function displayName(user: User): string {
	return getUserDisplayName(user);
}

async function onSelect(row: { user: User }) {
	if (sendingId.value) return;
	const friend = row.user;
	selection();
	sendingId.value = friend.id;
	try {
		const outcome = await challenge(friend.id, getUserDisplayName(friend, { at: true }));
		if (outcome.status === 'sent') {
			await showInfoToast(`Challenge sent to @${friend.username}`);
			close();
		} else if (outcome.status === 'no-quests') {
			await showInfoToast('Start a quest first, then challenge a friend to it.');
		} else if (outcome.status === 'error') {
			await showErrorToast(outcome.error, {
				fallback: 'Could not send the challenge. Please try again.'
			});
		}
		// cancelled -> keep the picker open, no toast
	} finally {
		sendingId.value = null;
	}
}

function findFriends() {
	close();
	router.push('/tabs/discover?tab=user');
}
</script>
