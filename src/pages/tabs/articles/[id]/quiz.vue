<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Article Quiz</IonTitle>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonButtons
					slot="end"
					class="mx-2"
				>
					<Share
						v-if="article"
						:payload="{
							dialogTitle: 'Share Article Quiz',
							title: `Take a quiz on ${article.title} by @${article.author.username}`,
							text: article.description,
							url: `https://app.earth-app.com/articles/${article.id}`
						}"
					/>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div
				v-if="article"
				class="flex flex-col items-center w-full h-full"
			>
				<ArticleMQuiz :article="article" />
			</div>
			<div
				v-else
				class="h-screen"
			>
				<div class="flex items-center justify-center h-full pb-8">
					<IonSpinner name="crescent" />
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const route = useRoute();
const { article, fetch } = useArticle(route.params.id as string);

onMounted(() => {
	fetch();
});
</script>
