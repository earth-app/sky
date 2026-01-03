<template>
	<IonPage>
		<IonContent :scroll-y="true">
			<div
				v-if="article"
				class="flex flex-col items-center w-full h-full pt-12 sm:pt-0"
			>
				<Back class="self-start" />
				<ArticleMPage :article="article" />
				<div class="flex items-center w-screen">
					<MInfoCardGroup
						title="Related Articles"
						description="Articles similar to this one"
						icon="mdi:book-multiple-variant"
						show-dots
					>
						<InfoCardSkeleton
							v-if="!relatedLoaded"
							v-for="n in 3"
							:key="n"
						/>
						<ArticleMCard
							v-else
							v-for="article in relatedArticles"
							:key="article.id"
							:article="article"
						/>
					</MInfoCardGroup>
				</div>
			</div>
			<div
				v-else
				class="h-screen"
			>
				<Back class="self-start" />
				<div class="flex items-center justify-center h-full pb-8">
					<IonSpinner name="crescent" />
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import type { Article } from '@earth-app/crust/src/shared/types/article';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const { user } = useAuth();
const route = useRoute();

const relatedLoaded = ref(false);
const relatedArticles = ref<Article[]>([]);

const { article } = useArticle(route.params.id as string);
watch(article, async (newArticle) => {
	if (newArticle) {
		await loadSimilar(newArticle);
	}
});

onMounted(async () => {
	if (!article.value) return;
	await loadSimilar(article.value);

	if (!user.value) return;
	const count = await getCurrentJourneyM('article', user.value.id);
	if (!count.success || !count.data) return; // silently ignore errors
	if ('message' in count.data) return;

	const res = await tapCurrentJourneyM('article');
	if (!res.success || !res.data) return; // silently ignore errors
	if ('message' in res.data) return;

	if (count.data.count === res.data.count) return; // no change

	await Toast.show({
		text: `You have now read ${res.data.count} articles on your journey streak. Keep going!`,
		duration: 'long'
	});
});

async function loadSimilar(article?: Article) {
	if (!article) return;
	if (!user.value) return;
	relatedLoaded.value = false;

	const res = await getSimilarArticlesM(article);
	if (res.success && res.data) {
		relatedArticles.value = res.data;
		relatedLoaded.value = true;
	} else {
		console.error('Failed to load similar articles:', res.message);
		relatedLoaded.value = true;

		await Toast.show({
			text: res.message || 'Failed to load similar articles.',
			duration: 'long'
		});
	}
}
</script>
