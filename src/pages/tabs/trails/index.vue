<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>
				<IonTitle>Trails</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="pt-3">
				<TrailMBrowser />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts"></script>
