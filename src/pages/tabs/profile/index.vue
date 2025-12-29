<template>
	<IonPage>
		<div class="flex flex-col size-full">
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonTitle class="text-center">Profile</IonTitle>
				</IonToolbar>
			</IonHeader>
			<UserMProfile
				v-if="user"
				:user="user"
			/>
		</div>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();
</script>
