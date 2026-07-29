<template>
	<div
		v-if="list.length > 0"
		class="w-full"
	>
		<MSurface
			class="gap-3 border-info/20 bg-linear-to-br from-info/10 via-primary/5 to-transparent"
		>
			<div class="flex items-center gap-2">
				<UIcon
					name="mdi:book-alphabet"
					class="size-5 shrink-0 m-text-brand"
					aria-hidden="true"
				/>
				<h3 class="m-0! truncate text-sm! font-semibold">Saved Words</h3>
				<span class="ml-auto shrink-0 text-2xs text-muted">{{ list.length }} saved</span>
			</div>

			<div class="flex flex-col gap-2">
				<button
					v-for="word in list.slice(0, 2)"
					:key="word.word"
					type="button"
					:aria-label="`Open ${word.word}`"
					class="flex min-h-11! w-full flex-col items-start gap-0.5 rounded-lg! border! border-info/30! bg-info/5! p-3! text-left transition-transform active:scale-95!"
					@click="open(word)"
				>
					<span class="w-full truncate text-sm font-semibold"
						>{{ word.word }}
						<span class="text-3xs font-normal italic opacity-70">{{ word.partOfSpeech }}</span>
					</span>
					<span class="w-full truncate text-xs opacity-90">{{ word.definition }}</span>
				</button>
			</div>

			<div class="mt-auto flex items-center gap-2">
				<IonButton
					size="small"
					fill="outline"
					color="primary"
					aria-label="Word of the Day"
					@click="openWordOfTheDay"
				>
					<UIcon
						name="mdi:calendar-star"
						class="mr-1 size-4"
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
		</MSurface>
	</div>
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
