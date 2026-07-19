<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/trails" />
				</IonButtons>
				<IonTitle>Trail</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="pt-3">
				<!-- deep-link / notification tap opens straight into this trail's runner -->
				<TrailMBrowser :initial-trail-id="trailId" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const route = useRoute();
const trailId = computed(() => (route.params.id as string | undefined) ?? '');
</script>
