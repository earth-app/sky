<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Memberships</IonTitle>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full px-4 pb-10 max-w-3xl mx-auto">
				<p class="text-sm opacity-80 text-center mt-4 mb-6">
					Upgrade to unlock more events, faster quests, creator tools, and more. Plans renew monthly
					and can be canceled anytime from Settings.
				</p>

				<MRanks :highlighted="highlighted" />

				<div class="flex flex-col items-center gap-1 mt-6">
					<IonButton
						fill="clear"
						size="small"
						color="medium"
						:disabled="restoring"
						@click="onRestore"
					>
						{{ restoring ? 'Restoring...' : 'Restore Purchases' }}
					</IonButton>
					<p class="text-xs opacity-70 text-center max-w-xs">
						Payment is charged to your app store account. Subscriptions renew automatically unless
						canceled at least 24 hours before the end of the period.
					</p>
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { showErrorToast, showInfoToast } from '~/composables/useNotify';

const route = useRoute();
const { restore } = useIapPurchase();
const restoring = ref(false);

const highlighted = computed<'FREE' | 'PRO' | 'WRITER' | 'ORGANIZER' | undefined>(() => {
	const raw = String(route.query.plan ?? '').toUpperCase();
	return raw === 'FREE' || raw === 'PRO' || raw === 'WRITER' || raw === 'ORGANIZER'
		? (raw as 'FREE' | 'PRO' | 'WRITER' | 'ORGANIZER')
		: undefined;
});

async function onRestore() {
	if (restoring.value) return;
	restoring.value = true;
	try {
		const res = await restore();
		if (res.success) {
			await showInfoToast('Your Purchases Have Been Restored.');
		} else if (res.reason === 'nothing_to_restore') {
			await showInfoToast('No Previous Purchases Were Found to Restore.');
		} else if (res.reason !== 'cancelled') {
			await showErrorToast(res.error, { fallback: 'Could not restore your purchases.' });
		}
	} finally {
		restoring.value = false;
	}
}
</script>
