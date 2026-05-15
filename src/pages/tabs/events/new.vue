<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Create Event</IonTitle>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
					<UAvatar
						:src="avatar128"
						size="md"
						class="self-center mx-2 shadow-md shadow-black/10 light:shadow-black/30"
					/>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="flex flex-col items-center">
				<EventMForm
					v-if="user"
					mode="create"
				/>
				<Loading v-else />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
const { user, avatar128 } = useAuth();
</script>
