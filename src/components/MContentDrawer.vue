<template>
	<IonModal
		:is-open="open"
		:initial-breakpoint="0.75"
		:breakpoints="[0, 0.25, 0.5, 0.75, 1]"
	>
		<div class="flex flex-col items-center overflow-y-auto overflow-x-hidden">
			<h2 class="text-2xl font-bold p-4">
				{{ title }}
			</h2>

			<LazyIonSearchbar
				v-if="searchable"
				v-model="search"
				type="search"
				color="light"
				placeholder="Search..."
				class="mb-4"
				hydrate-on-interaction
			/>

			<slot :search="search" />
			<div
				v-if="isLoading"
				class="flex justify-center py-4"
			>
				<Loading />
			</div>
		</div>
	</IonModal>
</template>

<script setup lang="ts">
const props = defineProps<{
	title: string;
	isLoading?: boolean;
	searchable?: boolean;
}>();

const emit = defineEmits<{
	(event: 'loadMore'): void;
}>();

const open = ref(false);
const search = ref('');

export interface ContentDrawerRef {
	open: () => void;
	close: () => void;
	search: Ref<string>;
}

defineExpose<ContentDrawerRef>({
	open: () => {
		open.value = true;
	},
	close: () => {
		open.value = false;
	},
	search: search
});
</script>
