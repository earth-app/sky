<template>
	<IonModal
		:is-open="isOpen"
		can-dismiss
	>
		<IonHeader>
			<IonToolbar class="px-4">
				<IonTitle>
					<UAvatar
						:src="avatar32"
						class="mr-2"
					/>
					{{ mode === 'create' ? 'Create New Article' : 'Edit Article' }}
				</IonTitle>
				<IonButtons slot="end">
					<IonButton
						fill="clear"
						strong
						@click="isOpen = false"
						>Close</IonButton
					>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent>
			<ArticleMForm
				:mode="mode"
				:article="article"
				@submitted="isOpen = false"
			/>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import type { Article } from '@earth-app/crust/src/shared/types/article';

const props = defineProps<{
	article?: Article;
	mode: 'create' | 'edit';
}>();

const { user } = useAuth();
const { avatar32 } = useUser(props.article?.author_id || user.value?.id || '');

const isOpen = ref(false);

defineExpose({
	isOpen
});
</script>
