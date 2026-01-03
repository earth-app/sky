<template>
	<IonPage>
		<IonContent
			v-if="prompt"
			:scroll-y="true"
		>
			<Back />
			<PromptMPage :prompt="prompt" />
		</IonContent>
		<div
			v-else
			class="h-screen"
		>
			<Back class="self-start" />
			<div class="flex items-center justify-center h-full pb-8">
				<IonSpinner name="crescent" />
			</div>
		</div>
	</IonPage>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const route = useRoute();
const { prompt, fetch } = usePrompt(route.params.id as string);

// force fetch on mount to ensure fresh data on page refresh
onMounted(() => {
	fetch();
});
</script>
