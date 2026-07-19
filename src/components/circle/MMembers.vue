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

		<div
			v-else-if="!members.length"
			class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-4 text-center"
		>
			<UIcon
				name="mdi:account-multiple-plus-outline"
				class="size-8 opacity-60"
			/>
			<p class="text-sm opacity-70">
				Your circle is empty. Invite friends to grow a garden together.
			</p>
			<IonButton
				size="small"
				color="primary"
				@click="inviteOpen = true"
			>
				<UIcon
					name="mdi:account-plus"
					class="size-4 mr-2"
				/>
				Invite Friends
			</IonButton>
		</div>

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
				class="rounded-lg"
				@click="openProfile(m)"
			>
				<UAvatar
					slot="start"
					:src="avatarOf(m)"
					:alt="m.username"
					size="sm"
				/>
				<IonLabel class="ml-2 truncate text-sm font-medium">{{ m.username }}</IonLabel>
			</IonItem>
			<IonItem
				v-if="!filtered.length"
				lines="none"
			>
				<IonLabel class="text-sm opacity-60">No One in Your Circle Matches That Search.</IonLabel>
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
	return avatarStore.safeUrl(m.account?.avatar_url, 'avatar32');
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
