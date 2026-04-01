<template>
	<MInfoCard
		:subtitle="article.title"
		:content="trimString(article.content, 300)"
		:link="noLink ? undefined : `/tabs/articles/${article.id}`"
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
			article.tags.map((tag) => ({
				text: tag,
				color: 'warning',
				icon: 'mdi:tag-outline',
				variant: 'subtle',
				size: 'md'
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

const footer = ref<string | undefined>(undefined);

const avatarStore = useAvatarStore();
const userStore = useUserStore();
const showSecondaryAvatar = computed(() => !isDataConstrained.value);

const authorAvatarUrl = computed(() => {
	return (
		(props.article.author?.account as any)?.avatar_url_offline ||
		props.article.author?.account?.avatar_url
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
	return (props.article.ocean as any)?.favicon_offline || props.article.ocean?.favicon;
});
const authorAvatarChipColor = computed(() => userStore.getChipColor(props.article.author));

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
	if (!props.article.created_at) return 'sometime';
	const created = DateTime.fromISO(props.article.created_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATETIME_MED);
});

onMounted(() => {
	footer.value = `@${props.article.author.username} - ${time.value}`;
});
</script>
