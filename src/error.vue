<template>
	<IonApp>
		<div class="flex flex-col items-center py-24 min-h-screen">
			<IonImg
				src="/cloud.png"
				alt="Error Image"
				class="size-48 max-w-2xs max-h-2xs mb-6"
			/>
			<h1 class="w-full px-4 mb-4 text-3xl sm:text-4xl font-bold text-center text-balance">
				Oops! Something went wrong.
			</h1>
			<p class="w-full px-4 mb-8 text-lg text-center">
				{{ error?.message || "We're sorry, but we couldn't find the page you were looking for." }}
			</p>
			<IonButton
				class="hover:cursor-pointer"
				color="primary"
				@click="navigateTo('/tabs/dashboard')"
			>
				Go Back Home
			</IonButton>
		</div>
	</IonApp>
</template>

<script setup lang="ts">
const error = useError();
</script>
