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
			<MRanks :highlighted="highlighted" />
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const route = useRoute();

const highlighted = computed(() => {
	const param = route.query.highlighted;
	if (param) {
		return param.toString().toUpperCase() as 'WRITER' | 'ORGANIZER' | 'PRO';
	}

	return undefined;
});
</script>
