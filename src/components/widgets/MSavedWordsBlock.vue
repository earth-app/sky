<template>
	<IonCard
		v-if="list.length > 0"
		class="info-card-group w-11/12 max-w-2xl min-h-2/7 mt-4 mx-auto p-4 rounded-xl shadow-md border border-info/20"
	>
		<div class="flex items-start gap-2 mb-3">
			<UIcon
				name="mdi:book-alphabet"
				class="size-6 text-info shrink-0 mt-0.5"
			/>
			<div class="flex flex-col min-w-0 flex-1">
				<h2 class="text-base! font-semibold m-0!">Saved Words</h2>
				<p class="text-xs opacity-70 m-0! mt-0.5">{{ list.length }} saved</p>
			</div>
			<IonButton
				size="small"
				fill="outline"
				color="info"
				aria-label="Word of the Day"
				@click="openWordOfTheDay"
			>
				<UIcon
					name="mdi:calendar-star"
					class="size-4 mr-1"
				/>
				Word of the Day
			</IonButton>
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

		<IonModal
			:is-open="wordModalOpen"
			@did-dismiss="wordModalOpen = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Word of the Day</IonTitle>
					<IonButtons slot="end">
						<IonButton
							color="danger"
							aria-label="Close word of the day"
							@click="wordModalOpen = false"
						>
							<UIcon
								name="mdi:close"
								class="min-h-6 min-w-6"
							/>
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<div class="h-full overflow-auto p-4">
				<WidgetsMWordOfTheDay :words="modalWords" />
			</div>
		</IonModal>
	</IonCard>
</template>

<script setup lang="ts">
type WordEntry = { word: string; partOfSpeech: string; definition: string };

const { list } = useSavedWords();

const wordModalOpen = ref(false);
const activeWord = ref<WordEntry | null>(null);

// undefined lets the widget use its own daily pool; a single entry pins it to the tapped word
const modalWords = computed<WordEntry[] | undefined>(() =>
	activeWord.value ? [activeWord.value] : undefined
);

// tapping a saved word now opens the interactive widget in a modal (was a plain toast)
function open(word: WordEntry) {
	activeWord.value = word;
	wordModalOpen.value = true;
}

function openWordOfTheDay() {
	activeWord.value = null;
	wordModalOpen.value = true;
}
</script>
