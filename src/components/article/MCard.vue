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
		:secondary-avatar="{
			src: article.ocean?.favicon,
			size: 'xs'
		}"
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

const authorAvatarUrl = computed(() => props.article.author.account?.avatar_url);
const authorAvatar = computed(() => {
	const url = authorAvatarUrl.value;
	if (!url || !url.startsWith('http')) return '/favicon.png';
	return avatarStore.get(url)?.avatar128 || '/favicon.png';
});
const authorAvatarChipColor = computed(() => userStore.getChipColor(props.article.author));

if (authorAvatarUrl.value) {
	avatarStore.preloadAvatar(authorAvatarUrl.value);
}

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
