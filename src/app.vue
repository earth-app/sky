<script setup lang="ts">
import slide from './animations/slide';
</script>

<template>
	<IonApp>
		<IonRouterOutlet :animation="slide" />
	</IonApp>
</template>
