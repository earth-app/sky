<template>
	<IonPage>
		<IonContent :scroll-y="true">
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonTitle class="text-center">Profile</IonTitle>
				</IonToolbar>
			</IonHeader>
			<UserMProfile
				v-if="user"
				:user="user"
			/>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();
</script>
