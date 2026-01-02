<template>
	<MInfoCard
		:subtitle="article.title"
		:content="trimString(article.content, 300)"
		:link="noLink ? undefined : `/articles/${article.id}`"
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
			src: article.ocean?.favicon
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
		secondary-avatar-size="xs"
		class="p-4"
	/>
</template>

<script setup lang="ts">
import type { Article } from '@earth-app/crust/src/shared/types/article';
import { trimString } from '@earth-app/crust/src/shared/util';
import { DateTime } from 'luxon';

const props = defineProps<{
	article: Article;
	noLink?: boolean;
}>();

const footer = ref<string | undefined>(undefined);

const { avatar128: authorAvatar } = useUser(props.article.author_id);

const authorAvatarChipColor = ref<any | null>(null);

const i18n = useI18n();
const time = computed(() => {
	if (!props.article.created_at) return 'sometime';
	const created = DateTime.fromISO(props.article.created_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATETIME_MED);
});

onMounted(async () => {
	switch (props.article.author.account.account_type) {
		case 'WRITER':
			authorAvatarChipColor.value = 'primary';
			break;
		case 'ORGANIZER':
			authorAvatarChipColor.value = 'warning';
			break;
		case 'ADMINISTRATOR':
			authorAvatarChipColor.value = 'error';
			break;
	}

	footer.value = `@${props.article.author.username} - ${time.value}`;
});
</script>
