<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle class="text-center">Edit Profile</IonTitle>
			</IonToolbar>
		</IonHeader>
		<IonContent>
			<div class="flex items-center justify-between">
				<Back />
				<h2
					v-if="user"
					class="m-0! font-sans"
				>
					@{{ user.username }}
				</h2>
				<IonButton
					fill="clear"
					router-link="/tabs/profile/settings"
					:router-animation="slide"
					color="tertiary"
				>
					<UIcon
						name="mdi:menu"
						class="size-7"
					/>
				</IonButton>
			</div>
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
import slide from '~/animations/slide';

const { user } = useAuth();
</script>
