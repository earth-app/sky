<template>
	<MInfoCard
		v-if="articleData"
		:subtitle="articleData.title"
		:content="trimString(articleData.content, 300)"
		:link="noLink ? undefined : `/tabs/articles/${articleData.id}`"
		:footer="footer"
		:avatar="{
			src: authorAvatar,
			size: 'xl',
			chip: authorAvatarChipColor
				? {
						color: authorAvatarChipColor,
						size: 'xl'
					}
				: undefined
		}"
		:secondary-avatar="
			showSecondaryAvatar
				? {
						src: articleOceanFavicon,
						size: 'xs'
					}
				: undefined
		"
		:badges="
			articleData.tags.map((tag) => ({
				text: tag,
				color: 'warning',
				icon: 'mdi:tag-outline'
			}))
		"
		class="p-4"
	/>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';
import type { Article } from 'types/article';
import { trimString } from 'utils';

const props = defineProps<{
	article: Article;
	noLink?: boolean;
}>();

const articleData = computed(() => {
	const article = props.article;
	if (!article || typeof article !== 'object') return null;
	if (!article.id || !article.title || !article.content || !Array.isArray(article.tags))
		return null;
	if (!article.author || typeof article.author !== 'object') return null;
	if (!article.created_at) return null;

	return article;
});

const footer = ref<string | undefined>(undefined);

const avatarStore = useAvatarStore();
const userStore = useUserStore();
const showSecondaryAvatar = computed(() => !isDataConstrained.value);

const authorAvatarUrl = computed(() => {
	if (!articleData.value) return undefined;
	return (
		(articleData.value.author?.account as any)?.avatar_url_offline ||
		articleData.value.author?.account?.avatar_url
	);
});
const authorAvatar = computed(() => {
	const url = authorAvatarUrl.value;
	if (!url) return '/favicon.png';
	if (url.startsWith('data:')) return url;
	if (!url.startsWith('http')) return '/favicon.png';
	return avatarStore.get(url)?.avatar128 || '/favicon.png';
});
const articleOceanFavicon = computed(() => {
	if (!articleData.value) return undefined;
	return (articleData.value.ocean as any)?.favicon_offline || articleData.value.ocean?.favicon;
});
const authorAvatarChipColor = computed(() => {
	if (!articleData.value) return undefined;
	return userStore.getChipColor(articleData.value.author);
});

watch(
	[authorAvatarUrl, () => isDataConstrained.value],
	([url, constrained]) => {
		if (!constrained && url && url.startsWith('http')) {
			avatarStore.preloadAvatar(url);
		}
	},
	{ immediate: true }
);

const i18n = useI18n();
const time = computed(() => {
	if (!articleData.value?.created_at) return 'sometime';
	const created = DateTime.fromISO(articleData.value.created_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATETIME_MED);
});

onMounted(() => {
	if (!articleData.value?.author?.username) return;
	footer.value = `@${articleData.value.author.username} - ${time.value}`;
});
</script>
