<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Activities</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<IonRefresher
				slot="fixed"
				@ionRefresh="onRefresh"
			>
				<IonRefresherContent />
			</IonRefresher>

			<div class="pt-3">
				<ActivityMBrowser ref="browser" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const browser = ref<{ reload?: () => Promise<void> } | null>(null);

async function onRefresh(event: CustomEvent) {
	try {
		await browser.value?.reload?.();
	} finally {
		(event.target as HTMLIonRefresherElement | null)?.complete();
	}
}
</script>
