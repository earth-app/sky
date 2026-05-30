<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Journey Leaderboard</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<UserJourneyMLeaderboard
				v-if="type"
				:type="type"
			/>
			<Loading v-else />
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const route = useRoute();
const type = computed(() => (route.params.type as 'event' | 'prompt' | 'article') || null);
</script>
