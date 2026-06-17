<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Upgrade Account</IonTitle>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<!-- membership purchase UI disabled pending app store review (guideline 2.1(b)) -->
			<!-- <MRanks :highlighted="highlighted" /> -->
			<div class="flex flex-col items-center justify-center text-center gap-3 px-8 py-16">
				<UIcon
					name="mdi:rocket-launch-outline"
					class="size-12 text-primary"
				/>
				<h2 class="text-xl font-semibold">Memberships Are Coming Soon</h2>
				<p class="opacity-80 text-sm max-w-xs">
					Writer, Organizer, and Pro memberships aren't available just yet. Hang tight; we're
					putting the finishing touches on them.
				</p>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

onMounted(async () => {
	await Toast.show({
		text: 'Memberships are coming soon!',
		duration: 'long'
	});
});
</script>
