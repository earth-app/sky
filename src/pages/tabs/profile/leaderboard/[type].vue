<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Leaderboard</IonTitle>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div id="leaderboard-hero">
				<UserMLeaderboard
					v-if="type"
					:type="type"
				/>
				<Loading v-else />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import type { LeaderboardMetric } from 'types/user';

const route = useRoute();
const VALID_METRICS: LeaderboardMetric[] = ['points', 'article', 'prompt', 'event'];
const type = computed<LeaderboardMetric | null>(() => {
	const raw = route.params.type as string;
	return VALID_METRICS.includes(raw as LeaderboardMetric) ? (raw as LeaderboardMetric) : null;
});
</script>
