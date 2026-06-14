<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/settings" />
				</IonButtons>
				<IonTitle>Blocked Users</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full px-4 pb-8 max-w-3xl mx-auto">
				<p class="text-sm opacity-80 text-center mt-4 mb-4">
					People you've blocked can't see your profile or interact with your content. Unblock anyone
					to restore interaction.
				</p>

				<div
					v-if="loading"
					class="flex items-center justify-center w-full py-12"
				>
					<IonSpinner name="crescent" />
				</div>

				<template v-else>
					<div
						v-if="blocked.length === 0"
						class="w-full rounded-xl border border-black/20 light:border-gray-300 px-6 py-10 text-center"
					>
						<UIcon
							name="mdi:account-cancel-outline"
							class="size-10 text-info mb-2"
						/>
						<h2 class="text-base! font-semibold m-0! mb-2!">No blocked users</h2>
						<p class="text-sm opacity-80 m-0!">You haven't blocked anyone.</p>
					</div>

					<IonList
						v-else
						class="w-full rounded-xl border border-black/20 light:border-gray-300"
					>
						<IonItem
							v-for="blockedUser in blocked"
							:key="blockedUser.id"
							lines="inset"
						>
							<UAvatar
								slot="start"
								:src="blockedUser.account.avatar_url"
								class="size-10"
							/>
							<div class="flex flex-col w-full py-2">
								<span class="text-base font-semibold">@{{ blockedUser.username }}</span>
								<span
									v-if="blockedUser.full_name"
									class="text-sm opacity-80"
									>{{ blockedUser.full_name }}</span
								>
							</div>
							<IonButton
								slot="end"
								size="small"
								fill="clear"
								color="success"
								:disabled="busyId === blockedUser.id"
								@click="onUnblock(blockedUser)"
							>
								Unblock
							</IonButton>
						</IonItem>
					</IonList>
				</template>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import type { User } from 'types/user';
import { makeClientAPIRequest } from 'utils';
import { showErrorToast, showInfoToast } from '~/composables/useNotify';

const authStore = useAuthStore();

const blocked = ref<User[]>([]);
const loading = ref(true);
const busyId = ref<string | null>(null);

async function fetchBlocked() {
	const res = await makeClientAPIRequest<{ items: User[]; total: number }>(
		'/v2/users/current/blocked',
		authStore.sessionToken
	);
	if (res.success && res.data) {
		blocked.value = res.data.items ?? [];
	} else {
		await showErrorToast(res.message, { fallback: 'Could not load your blocked users.' });
	}
}

async function onUnblock(target: User) {
	const { value } = await Dialog.confirm({
		title: 'Unblock User',
		message: `Unblock @${target.username}? They'll be able to see your profile and interact with your content again.`,
		okButtonTitle: 'Unblock',
		cancelButtonTitle: 'Cancel'
	});
	if (!value) return;

	busyId.value = target.id;
	try {
		const res = await makeClientAPIRequest(
			`/v2/users/current/blocked?user=${encodeURIComponent(target.id)}`,
			authStore.sessionToken,
			{ method: 'DELETE' }
		);
		if (res.success) {
			blocked.value = blocked.value.filter((u) => u.id !== target.id);
			void showInfoToast(`Unblocked @${target.username}.`);
		} else {
			await showErrorToast(res.message, { fallback: 'Could not unblock this user.' });
		}
	} finally {
		busyId.value = null;
	}
}

onMounted(async () => {
	try {
		await fetchBlocked();
	} finally {
		loading.value = false;
	}
});
</script>
