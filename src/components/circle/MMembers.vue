<template>
	<section class="flex flex-col gap-2">
		<div class="flex items-center justify-between px-1">
			<h3 class="text-sm! font-semibold m-0! opacity-80">Your Circle</h3>
			<UBadge
				color="neutral"
				variant="soft"
				size="sm"
				>{{ members.length }}</UBadge
			>
		</div>

		<IonSearchbar
			v-if="members.length > 4"
			v-model="q"
			placeholder="Search Your Circle"
			:color="theme"
			class="p-0! min-h-0"
		/>

		<div
			v-if="loading && !members.length"
			class="flex justify-center py-6"
		>
			<IonSpinner name="crescent" />
		</div>

		<MEmptyState
			v-else-if="!members.length"
			icon="mdi:account-multiple-plus-outline"
			title="Your Circle is Empty"
			description="Invite friends to grow a garden together."
			cta-label="Invite Friends"
			cta-icon="mdi:account-plus"
			cta-color="primary"
			dense
			@cta="inviteOpen = true"
		/>

		<MEmptyState
			v-else-if="!filtered.length"
			icon="mdi:account-search-outline"
			title="No One in Your Circle Matches That Search."
			variant="neutral"
			dense
		/>

		<IonList
			v-else
			class="bg-transparent"
			lines="none"
		>
			<IonItem
				v-for="m in filtered"
				:key="m.id"
				button
				:detail="false"
				:aria-label="`View ${m.username}'s Profile`"
				class="rounded-lg border border-default mb-1 last:mb-0"
				@click="openProfile(m)"
			>
				<UAvatar
					slot="start"
					:src="avatarOf(m)"
					:alt="m.username"
					size="sm"
				/>
				<IonLabel class="ml-2 truncate text-sm font-medium">{{ m.username }}</IonLabel>
				<UserMTypeBadge :user="m" />
			</IonItem>
		</IonList>

		<IonModal
			:is-open="inviteOpen"
			@did-dismiss="inviteOpen = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Invite Friends</IonTitle>
					<IonButtons slot="end">
						<IonButton
							aria-label="Close"
							@click="inviteOpen = false"
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
			<IonContent class="ion-padding">
				<UserMInviteFriend />
			</IonContent>
		</IonModal>
	</section>
</template>

<script setup lang="ts">
import { useIonRouter } from '@ionic/vue';
import { useAvatarStore } from 'stores/avatar';
import { useFriendsStore } from 'stores/friends';
import type { User } from 'types/user';
import { theme } from '~/composables/useSettings';

const friends = useFriendsStore();
const avatarStore = useAvatarStore();
const router = useIonRouter();

const loading = ref(false);
const q = ref('');
const inviteOpen = ref(false);

const members = computed<User[]>(() => friends.getCircle('current'));

const filtered = computed(() => {
	const term = q.value.trim().toLowerCase();
	if (!term) return members.value;
	return members.value.filter((m) => m.username?.toLowerCase().includes(term));
});

function avatarOf(m: User): string {
	return avatarStore.safeUrl(m.account?.avatar_url, 'avatar128');
}

function openProfile(m: User) {
	router.push(`/tabs/profile/${m.id}`);
}

onMounted(async () => {
	loading.value = true;
	try {
		await friends.fetchCircle('current');
	} finally {
		loading.value = false;
	}
});
</script>
