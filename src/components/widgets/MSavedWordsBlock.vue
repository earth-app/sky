<template>
	<IonCard
		v-if="list.length > 0"
		class="info-card-group w-11/12 max-w-2xl min-h-50 mt-4 mx-auto p-4 rounded-xl shadow-md border border-info/20"
	>
		<div class="flex items-start gap-2 mb-3">
			<UIcon
				name="mdi:book-alphabet"
				class="size-6 text-info shrink-0 mt-0.5"
			/>
			<div class="flex flex-col min-w-0 flex-1">
				<h2 class="text-base! font-semibold m-0!">Your Saved Words</h2>
				<p class="text-xs opacity-70 m-0! mt-0.5">{{ list.length }} saved · tap to revisit any</p>
			</div>
			<IonButton
				size="small"
				fill="clear"
				color="medium"
				router-link="/tabs/settings/words"
				aria-label="Open My Words"
			>
				<UIcon
					name="mdi:arrow-right"
					class="size-5"
				/>
			</IonButton>
		</div>

		<div
			class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1"
			role="list"
		>
			<button
				v-for="word in list.slice(0, 12)"
				:key="word.word"
				type="button"
				class="shrink-0 flex flex-col items-start gap-1 rounded-lg! border-2! border-info/30! bg-info/5! p-3! min-w-45 max-w-60 text-left active:scale-95! transition-transform"
				@click="open(word)"
			>
				<span class="text-sm font-semibold truncate w-full">{{ word.word }}</span>
				<span class="text-[10px] italic opacity-70">{{ word.partOfSpeech }}</span>
				<span class="text-xs opacity-90 line-clamp-2">{{ word.definition }}</span>
			</button>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const { list } = useSavedWords();

async function open(word: { word: string; partOfSpeech: string; definition: string }) {
	// quick preview: surface definition in a toast since there's no per-word page yet
	await Toast.show({
		text: `${word.word} (${word.partOfSpeech}): ${word.definition}`,
		duration: 'long'
	});
}
</script>
