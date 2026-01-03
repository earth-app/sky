<template>
	<div class="flex flex-col items-center w-full">
		<div class="mt-8 mb-4 text-wrap max-w-full px-4">
			<div class="flex justify-center mb-4">
				<UAvatar
					:src="authorAvatar"
					alt="Author's avatar"
					:title="`@${article.author.username}`"
					class="mb-4 w-30 h-30"
				/>
			</div>
			<h1 class="text-2xl! mb-1! font-bold">{{ article.title }}</h1>
			<h2 class="text-lg! m-0!">
				by
				<span
					class="font-semibold text-blue-500"
					@click="navigateTo(`/tabs/profile/@${article.author.username}`)"
				>
					@{{ article.author.username }}
				</span>
			</h2>
			<div class="flex mt-2 flex-wrap">
				<UBadge
					v-for="(tag, index) in article.tags"
					:key="`article-tag-${index}`"
					class="mr-2 mb-2"
					:ui="{ label: 'text-sm' }"
					variant="subtle"
					icon="mdi:tag"
					size="lg"
					color="warning"
					>{{ tag }}</UBadge
				>
			</div>
		</div>
		<div
			v-if="hasWriteAccess"
			class="mb-4"
		>
			<IonButton
				color="danger"
				icon=""
				@click="removeArticle"
				size="small"
			>
				<UIcon
					name="mdi:delete"
					class="size-5 mr-2"
				/>
				Delete
			</IonButton>
			<IonButton
				class="ml-2"
				@click="
					() => {
						if (editor) editor.isOpen = true;
					}
				"
				size="small"
			>
				<UIcon
					name="mdi:pencil"
					class="size-5 mr-2"
				/>
				Edit
			</IonButton>
			<ArticleMEditor
				:article="article"
				mode="edit"
				ref="editor"
			/>
		</div>
		<div class="mt-2 prose min-w-85 w-9/10 items-center">
			<p
				v-for="(paragraph, index) in contentParagraphs"
				:key="index"
				class="mb-2"
			>
				{{ paragraph }}
			</p>
		</div>
		<h3 class="text-xs! text-gray-400">{{ time }}</h3>
		<div
			v-if="article.ocean"
			class="flex flex-col items-center my-8"
		>
			<h1 class="text-xl font-semibold">Cited Article</h1>
			<MInfoCard
				:title="article.ocean.title"
				:avatar="{
					src: article.ocean.favicon
				}"
				:subtitle="article.ocean.author"
				:external="true"
				:link="article.ocean.url"
				:content="
					trimString(article.ocean.content || article.ocean.abstract || 'No content provided.', 400)
				"
				:footer="oceanTime"
				:secondary-footer="article.ocean.source"
				:badges="oceanBadges"
				color="dark"
				class="w-full min-w-90 p-4"
				in-browser
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import type { Article } from '@earth-app/crust/src/shared/types/article';
import { parseLooseDate, trimString } from '@earth-app/crust/src/shared/util';
import { DateTime } from 'luxon';

const props = defineProps<{
	article: Article;
}>();

const router = useIonRouter();

const contentParagraphs = computed(() => {
	return props.article.content.split('\n').filter((p) => p.trim().length > 0);
});
const oceanBadges = computed(() => {
	return (
		props.article.ocean?.keywords
			?.slice(0, 10)
			.map((k) => ({ text: k.toLowerCase(), color: 'primary' as const })) || []
	);
});

const { avatar128: authorAvatar } = useUser(props.article.author_id);

const i18n = useI18n();
const time = computed(() => {
	if (!props.article.created_at) return 'sometime';
	const created = DateTime.fromISO(props.article.created_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATETIME_FULL);
});

const oceanTime = computed(() => {
	if (!props.article.ocean?.date) return 'sometime';
	const created = parseLooseDate(props.article.ocean.date);
	if (typeof created === 'string') return created;

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
});

const oceanColor = computed(() => {
	if (!props.article.ocean?.theme_color) return 0xffffff;
	return parseInt(props.article.ocean.theme_color.replace('#', ''), 16);
});

// Owner Actions

const { user } = useAuth();
const hasWriteAccess = computed(() => {
	if (user.value == null) return false;
	if (props.article.author_id === user.value.id) return true;

	return user.value?.account.account_type === 'ADMINISTRATOR';
});

const editor = ref<{ isOpen: boolean }>();

async function removeArticle() {
	const yes = await Dialog.confirm({
		message: 'Are you sure you want to delete this article? This action cannot be undone.'
	});

	if (yes.value) {
		const res = await deleteArticle(props.article.id);
		if (res.success) {
			await Toast.show({
				text: 'The article has been successfully deleted.',
				duration: 'long'
			});

			refreshNuxtData(`article-${props.article.id}`);
			router.push('/articles');
		} else {
			await Toast.show({
				text: res.message || 'An unknown error occurred while deleting your article.',
				duration: 'long'
			});
		}
	} else {
		await Toast.show({
			text: 'Article deletion has been cancelled.',
			duration: 'long'
		});
	}
}
</script>
