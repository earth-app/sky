<template>
	<IonPage class="justify-start!">
		<div class="w-full flex justify-center">
			<div class="relative size-32 sm:size-40 md:size-48 mt-28 mb-16">
				<EarthCircle />
			</div>
		</div>
		<div class="w-full flex flex-col items-center justify-center">
			<h1
				id="title"
				class="text-3xl"
			>
				The Earth App
			</h1>
			<h2 class="text-sm! font-medium! mt-0! px-2 text-center text-gray-600">
				Find your Novelty, Try New Things, Discover the World
			</h2>
			<div class="mt-8 px-8 max-w-md">
				<div
					v-if="user === null"
					class="space-y-3"
				>
					<IonButton
						expand="block"
						size="small"
						fill="solid"
						color="success"
						strong
						href="/signup"
					>
						<UIcon
							name="mdi:account-plus"
							class="mr-2 size-5"
						/>
						Sign Up
					</IonButton>
					<IonButton
						expand="block"
						size="small"
						fill="solid"
						color="tertiary"
						strong
						href="/login"
					>
						<UIcon
							name="mdi:login"
							class="mr-2 size-5"
						/>
						Login
					</IonButton>
					<div class="flex flex-col space-y-2 my-6">
						<UserOAuthShield
							v-for="provider in OAUTH_PROVIDERS"
							:key="provider"
							:provider="provider"
						/>
					</div>
				</div>
				<div v-else>
					<UIcon
						name="mdi:loading"
						class="animate-spin size-8 text-gray-500 mx-auto"
					/>
				</div>
			</div>
		</div>
	</IonPage>
</template>

<script setup lang="ts">
import { SplashScreen } from '@capacitor/splash-screen';
import { OAUTH_PROVIDERS } from '@earth-app/crust/src/shared/types/user';

const { user, fetchUser, avatar } = useAuth();

await SplashScreen.hide();
onMounted(async () => {
	await SplashScreen.show({
		autoHide: false
	});
	await fetchUser();
	await SplashScreen.hide();
});

watch(user, (currentUser) => {
	if (currentUser) {
		setTimeout(() => {
			navigateTo('/tabs/dashboard');
		}, 1000);
	}
});
</script>
