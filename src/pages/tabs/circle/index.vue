<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Shared Garden</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="pt-3">
				<CircleMPanel />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts"></script>
