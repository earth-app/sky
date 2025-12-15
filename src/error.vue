<template>
	<IonApp>
		<div class="flex flex-col items-center py-24 min-h-screen">
			<IonImg
				src="/cloud.png"
				alt="Error Image"
				format="webp"
				class="size-48 max-w-2xs max-h-2xs mb-6"
				loading="eager"
				decoding="async"
				fetchpriority="high"
			/>
			<h1 class="text-4xl font-bold mb-4">Oops! Something went wrong.</h1>
			<p class="text-lg mb-8">
				{{ error?.message || "We're sorry, but we couldn't find the page you were looking for." }}
			</p>
			<IonButton
				class="hover:cursor-pointer"
				@click="$router.push('/')"
			>
				Go Back Home
			</IonButton>
		</div>
	</IonApp>
</template>

<script setup lang="ts">
const error = useError();
</script>
