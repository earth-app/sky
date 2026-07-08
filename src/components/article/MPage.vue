<template>
	<div class="flex flex-col items-center w-full">
		<div class="flex justify-end w-full pr-4 mt-2">
			<MTourButton tour-id="article-profile" />
		</div>
		<div class="mt-2 mb-4 text-wrap max-w-full px-4">
			<div
				id="author-avatar"
				class="flex justify-center mb-4"
			>
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
					@click="router.push(`/tabs/profile/@${article.author.username}`)"
				>
					@{{ article.author.username }}
				</span>
			</h2>
			<div
				id="article-tags"
				class="flex mt-2 flex-wrap"
			>
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
			class="flex gap-2 mb-4"
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

		<div
			v-if="quiz && quiz.length > 0"
			class="flex gap-2 mb-4"
		>
			<IonButton
				v-if="!score"
				id="quiz-button"
				color="secondary"
				size="small"
				:router-link="`/tabs/articles/${article.id}/quiz`"
			>
				<UIcon
					name="mdi:school"
					class="size-5 mr-2"
				/>
				Take Quiz</IonButton
			>

			<IonButton
				v-else
				id="quiz-button"
				:color="theme"
				size="small"
				:router-link="`/tabs/articles/${article.id}/quiz`"
			>
				<UIcon
					name="mdi:check-all"
					class="size-5 mr-2"
				/>
				View Quiz</IonButton
			>
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
		<h3
			id="article-time"
			class="text-xs! text-gray-600 dark:text-gray-300"
		>
			{{ time }}
		</h3>
		<div
			v-if="article.ocean"
			class="flex flex-col items-center my-8"
		>
			<h1 class="text-xl font-semibold">Cited Article</h1>
			<MInfoCard
				:title="article.ocean.title"
				:avatar="{
					src: articleOceanFavicon
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

		<ClientOnly>
			<MSiteTour
				:steps="articleTour"
				name="Article Tour"
				tour-id="article-profile"
			/>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import { DateTime } from 'luxon';
import type { Article } from 'types/article';
import { parseLooseDate, trimString } from 'utils';
import slide from '~/animations/slide';
import { theme } from '~/composables/useSettings';

const props = defineProps<{
	article: Article;
}>();

const router = useIonRouter();
const { quiz, fetchQuiz, score, fetchQuizScore, remove } = useArticle(
	props.article.id,
	makeMServerRequest
);

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

onMounted(() => {
	fetchQuiz();
	fetchQuizScore();
});

const { avatar128: userAuthorAvatar } = useUser(props.article.author_id);
const authorAvatar = computed(() => {
	const offlineAvatar = (props.article.author?.account as any)?.avatar_url_offline;
	if (offlineAvatar) return offlineAvatar;
	return userAuthorAvatar.value || '/favicon.png';
});
const articleOceanFavicon = computed(() => {
	return (props.article.ocean as any)?.favicon_offline || props.article.ocean?.favicon;
});

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
		const res = await remove();
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

// article tour

const articleTour = computed<SiteTourStep[]>(() => [
	{
		id: 'author-avatar',
		title: 'Welcome to Articles',
		description:
			'Articles are short, focused reads on hobbies, sciences, places, and ideas. Anyone can publish; and our @cloud account adapts scientific papers into approachable summaries.',
		footer: "Tap the avatar to visit the author's profile.",
		icon: 'mdi:book-open-page-variant-outline'
	},
	{
		id: 'article-tags',
		title: props.article.title,
		description: `By @${props.article.author.username}.\n\n"${props.article.description}"\n\nTags below describe what this piece covers; useful for finding more like it.`,
		footer: 'Tap any tag chip to find related articles.',
		icon: 'mdi:tag-multiple-outline'
	},
	{
		id: 'quiz-button',
		anonymous: false,
		title: 'Test Your Knowledge',
		description:
			'Most articles include a quick quiz. Taking it locks in what you read, awards Impact Points, and progresses any related quests you have running.',
		footer:
			"You can take a quiz once. After that, this button switches to 'View Quiz' so you can review your answers.",
		icon: 'mdi:school-outline',
		highlightPadding: 6,
		condition: () => Array.isArray(quiz.value) && quiz.value.length > 0,
		cta: {
			label: 'Open Quiz',
			icon: 'mdi:school',
			color: 'tertiary',
			advance: false,
			closeOnSuccess: true,
			handler: () => router.push(`/tabs/articles/${props.article.id}/quiz`, slide)
		}
	},
	{
		id: 'article-time',
		title: 'Sources & Citations',
		description: `Published on ${time.value}.\n\nIf this article is based on a paper or external source, you'll find the citation and a short summary right below; perfect for going deeper.`,
		footer: 'Enjoy the read!',
		icon: 'mdi:link-variant'
	}
]);
</script>
