<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
				</IonButtons>

				<IonButtons
					slot="end"
					class="gap-2 mx-2"
				>
					<Share
						v-if="currentArticle"
						:payload="{
							dialogTitle: 'Share Article',
							title: `Read about ${currentArticle.title} by @${currentArticle.author.username}`,
							text: currentArticle.description,
							url: `https://app.earth-app.com/articles/${currentArticle.id}`
						}"
					/>

					<div class="relative size-8 flex items-center justify-center">
						<Transition
							name="download-icon-fade"
							mode="out-in"
						>
							<UIcon
								v-if="isDownloading"
								key="downloading"
								name="line-md:downloading-loop"
								class="text-primary size-8"
							/>
							<UIcon
								v-else-if="isDownloaded"
								key="delete"
								name="material-symbols:delete-outline"
								:class="
									canDeleteDownload
										? 'text-error size-8 cursor-pointer'
										: 'text-gray-400 size-8 opacity-60 cursor-not-allowed'
								"
								@click.stop="deleteDownload"
							/>
							<UIcon
								v-else
								key="download"
								name="material-symbols:download-for-offline-outline"
								class="text-primary size-8 cursor-pointer"
								@click.stop="startDownload"
							/>
						</Transition>
					</div>

					<Transition name="download-icon-pop">
						<UIcon
							v-if="isDownloaded"
							name="mdi:check-circle"
							class="text-success size-6"
						/>
					</Transition>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div
				v-if="currentArticle"
				class="flex flex-col items-center w-full h-full"
			>
				<ContentTTLNotice
					v-if="articleExpiresAt"
					kind="article"
					variant="countdown"
					:expires-at="articleExpiresAt"
					class="w-full max-w-2xl px-4 mt-2"
				/>
				<ArticleMPage :article="currentArticle" />
				<div
					v-if="!loadedFromOffline"
					class="flex items-center w-screen"
				>
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
						<LazyArticleMCard
							v-else
							v-for="article in relatedArticles"
							:key="article.id"
							:article="article"
							hydrate-on-visible
						/>
					</MInfoCardGroup>
				</div>
			</div>
			<div
				v-else-if="unavailableOffline"
				class="h-screen flex flex-col"
			>
				<div class="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-2">
					<h2 class="text-xl font-semibold">Article unavailable offline</h2>
					<p class="text-gray-500 text-sm">
						Connect once and download this article to open it without internet.
					</p>
				</div>
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
import { Toast } from '@capacitor/toast';
import { useRoute } from 'vue-router'; // explicit import fixes issues with ionic

const { user, fetchCurrentJourney, tapCurrentJourney } = useAuth(makeMServerRequest);
const route = useRoute();

const relatedLoaded = ref(false);
const relatedArticles = ref<Article[]>([]);
const currentArticle = ref<Article | null>(null);
const loadedFromOffline = ref(false);
const unavailableOffline = ref(false);

const articleExpiresAt = computed(() => {
	const a = currentArticle.value;
	if (!a?.created_at) return null;
	return computeContentExpiry('article', Math.floor(Date.parse(a.created_at) / 1000));
});

const { article, fetch, fetchSimilar } = useArticle(route.params.id as string, makeMServerRequest);

const downloads = useDownloads();
const routeId = computed(() => route.params.id as string);
const downloadItem = computed(() => {
	const id = routeId.value;
	if (!id || !currentArticle.value) return null;

	return {
		id,
		type: 'article' as const,
		payload: currentArticle.value
	};
});
const timerMetadata = computed(() => ({
	article: currentArticle.value ?? article.value ?? undefined,
	user: user.value ?? undefined
}));
useTimeOnPageM('articles_read_time', timerMetadata);
const {
	isDownloaded,
	isDownloading,
	startDownload: startArticleDownload,
	deleteDownload: deleteArticleDownload
} = useDownloadState(() => downloadItem.value);
const canDeleteDownload = computed(() => false);

async function startDownload() {
	if (isDownloading.value || isDownloaded.value) return;

	try {
		const started = await startArticleDownload();
		if (!started) return;

		await Toast.show({
			text: 'Article downloaded for offline use',
			duration: 'short'
		});
	} catch (error: any) {
		await Toast.show({
			text: error?.message || 'Failed to download article',
			duration: 'short'
		});
	}
}

async function deleteDownload() {
	if (!canDeleteDownload.value) return;

	const removed = await deleteArticleDownload();
	if (!removed) return;
	await Toast.show({ text: 'Removed download', duration: 'short' });
}

async function loadArticleForView() {
	const id = routeId.value;
	if (!id) return;

	unavailableOffline.value = false;

	if (isOffline.value) {
		const offlineArticle = await downloads.get('article', id);
		if (offlineArticle) {
			loadedFromOffline.value = true;
			currentArticle.value = offlineArticle as Article;
			relatedArticles.value = [];
			relatedLoaded.value = true;
			return;
		}

		currentArticle.value = null;
		loadedFromOffline.value = false;
		relatedArticles.value = [];
		relatedLoaded.value = true;
		unavailableOffline.value = true;
		return;
	}

	loadedFromOffline.value = false;
	relatedLoaded.value = false;
	await fetch();
	currentArticle.value = article.value;
}

watch(
	[routeId, isOffline],
	() => {
		void loadArticleForView();
	},
	{ immediate: true }
);

watch(article, (newArticle) => {
	if (!loadedFromOffline.value && newArticle) {
		currentArticle.value = newArticle;
	}
});

watch(currentArticle, async (newArticle) => {
	if (newArticle && !loadedFromOffline.value) {
		await loadSimilar(newArticle);
	}
});

onMounted(async () => {
	if (isOffline.value || loadedFromOffline.value) return;

	if (!user.value) return;
	const count = await fetchCurrentJourney('article', user.value.id);
	if (!valid(count)) return; // silently ignore errors

	const res = await tapCurrentJourney('article');
	if (!valid(res)) return; // silently ignore errors

	if (count.data.count === res.data.count) return; // no change

	await Toast.show({
		text: `You have now read ${res.data.count} articles on your journey streak. Keep going!`,
		duration: 'long'
	});
});

async function loadSimilar(article?: Article) {
	if (!article) return;
	if (!user.value) {
		relatedArticles.value = [];
		relatedLoaded.value = true;
		return;
	}

	relatedLoaded.value = false;

	const res = await fetchSimilar();
	if (valid(res)) {
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

<style scoped>
.download-icon-fade-enter-active,
.download-icon-fade-leave-active {
	transition:
		opacity 180ms ease,
		transform 180ms ease;
}

.download-icon-fade-enter-from,
.download-icon-fade-leave-to {
	opacity: 0;
	transform: scale(0.92);
}

.download-icon-pop-enter-active,
.download-icon-pop-leave-active {
	transition:
		opacity 160ms ease,
		transform 160ms ease;
}

.download-icon-pop-enter-from,
.download-icon-pop-leave-to {
	opacity: 0;
	transform: scale(0.88);
}
</style>
