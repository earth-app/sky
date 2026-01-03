<template>
	<IonPage>
		<div class="flex flex-col items-center mt-8">
			<h1 class="text-3xl font-semibold mb-4 mt-24 sm:mt-8">Login</h1>
			<UserMLoginForm @loginSuccess="handleLoginSuccess" />
			<Back text />
		</div>
	</IonPage>
</template>
<script setup lang="ts">
function handleLoginSuccess() {
	navigateTo('/tabs/dashboard');
	refreshNuxtData();
}
</script>
