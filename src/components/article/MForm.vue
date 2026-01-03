<template>
	<IonCard class="p-4">
		<h2 class="text-2xl! font-bold! pt-2">
			{{ mode === 'create' ? 'Create New Article' : 'Edit Article' }}
		</h2>
		<UForm
			:state="state"
			class="space-y-2"
			@submit="handleSubmit"
			:schema="articleSchema"
		>
			<UFormField
				label="Title"
				name="title"
				:required="true"
			>
				<IonInput
					v-model="state.title"
					placeholder="The Wonderful World of Pizzas"
					class="w-full"
				/>
			</UFormField>

			<UFormField
				label="Description"
				name="description"
				:required="true"
				class="min-h-25"
			>
				<IonTextarea
					v-model="state.description"
					placeholder="Pizzas are great because..."
					class="w-full min-h-25!"
					:minlength="1"
					:maxlength="500"
					counter
				/>
			</UFormField>

			<UFormField
				label="Content"
				name="content"
				:required="true"
				class="min-h-40"
			>
				<IonTextarea
					v-model="state.content"
					placeholder="The first reason pizzas are great is because they are delicious and..."
					class="w-full min-h-40!"
					:minlength="1"
					:maxlength="10000"
					counter
				/>
			</UFormField>

			<UFormField
				label="Color"
				name="color_hex"
				help="The theme color for the article"
			>
				<div class="flex items-center">
					<IonInput
						v-model="state.color_hex"
						placeholder="#ffffff"
						class="mr-4"
						:disabled="loading"
					/>
					<input
						type="color"
						v-model="state.color_hex"
						class="h-10 w-20 rounded border cursor-pointer"
						:disabled="loading"
					/>
				</div>
			</UFormField>

			<UFormField
				label="Tags"
				name="tags"
				help="Additional tags that label your article. Max 10 allowed"
			>
				<div class="space-y-2">
					<div class="flex gap-2">
						<IonInput
							v-model="tagInput"
							:placeholder="state.tags.length < 10 ? 'Add a Tag' : 'Tag limit reached'"
							:disabled="loading || state.tags.length >= 10"
						/>
						<IonButton
							:icon="state.tags.length < 10 ? 'mdi:tag-plus' : 'mdi:tag-off'"
							color="tertiary"
							fill="outline"
							:disabled="loading || !tagInput.trim() || state.tags.length >= 10"
							@click="addTag"
						>
							Add
						</IonButton>
					</div>
					<div
						v-if="state.tags.length > 0"
						class="flex flex-wrap gap-2"
					>
						<UBadge
							v-for="(tag, index) in state.tags"
							:key="index"
							color="primary"
							variant="subtle"
							class="cursor-pointer"
							@click="removeTag(index)"
						>
							{{ tag }}
							<UIcon
								name="mdi:close"
								class="ml-1"
							/>
						</UBadge>
					</div>
				</div>
			</UFormField>

			<IonButton
				type="submit"
				color="success"
				class="mt-4"
				:disabled="loading"
			>
				<UIcon
					:name="mode === 'create' ? 'mdi:pen-plus' : 'mdi:pen'"
					class="size-5 mr-2"
				/>
				{{ mode === 'create' ? 'Create Article' : 'Save Changes' }}
			</IonButton>
		</UForm>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { articleSchema } from '@earth-app/crust/src/shared/schemas';
import type { Article } from '@earth-app/crust/src/shared/types/article';

const props = defineProps<{
	article?: Article;
	mode: 'create' | 'edit';
}>();

const router = useIonRouter();
const loading = ref(false);

const state = reactive<
	Omit<Article, 'id' | 'ocean' | 'created_at' | 'updated_at' | 'author' | 'author_id'>
>({
	title: props.article?.title || '',
	description: props.article?.description || '',
	content: props.article?.content || '',
	tags: props.article?.tags || [],
	color: props.article?.color || 0xffffff,
	color_hex: props.article?.color_hex || '#ffffff'
});

// link color_hex and color
watch(
	() => state.color_hex,
	(newHex) => {
		state.color = parseInt(newHex.replace('#', ''), 16);
	}
);

const tagInput = ref('');
const addTag = () => {
	const tag = tagInput.value.trim();
	if (tag && !state.tags.includes(tag)) {
		state.tags.push(tag);
		tagInput.value = '';
	}
};

const removeTag = (index: number) => {
	state.tags.splice(index, 1);
};

async function handleSubmit() {
	loading.value = true;
	if (props.mode === 'create') {
		const res = await createArticle({
			title: state.title,
			description: state.description,
			content: state.content
		});

		if (res.success && res.data) {
			if ('message' in res.data) {
				await Toast.show({
					text: res.data.message,
					duration: 'long'
				});
				loading.value = false;
				return;
			}

			await Toast.show({
				text: 'Your article has been created successfully.',
				duration: 'long'
			});

			router.push(`/articles/${res.data.id}`);
		} else {
			await Toast.show({
				text: res.message || 'Failed to create article.',
				duration: 'long'
			});
		}
	} else {
		const res = await editArticle({
			id: props.article!.id,
			title: state.title,
			description: state.description,
			content: state.content
		});

		if (res.success && res.data) {
			if ('message' in res.data) {
				await Toast.show({
					text: res.data.message,
					duration: 'long'
				});
				loading.value = false;
				return;
			}

			await Toast.show({
				text: 'Your article has been updated successfully.',
				duration: 'long'
			});

			router.push(`/tabs/articles/${res.data.id}`);
		} else {
			await Toast.show({
				text: res.message || 'Failed to update article.',
				duration: 'long'
			});
		}
	}

	loading.value = false;
}
</script>
