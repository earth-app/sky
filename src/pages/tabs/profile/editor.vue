<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Edit Profile - {{ user?.username }}</IonTitle>
				<IonButtons slot="start">
					<IonBackButton :default-href="profileRoute" />
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent>
			<div
				v-if="user"
				class="flex flex-col items-center size-full mt-4"
			>
				<UserMProfileEditor :user="user" />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user } = useAuth();

const profileRoute = computed(() =>
	user.value?.username ? `/tabs/profile/@${user.value.username}` : '/tabs/dashboard'
);
</script>
