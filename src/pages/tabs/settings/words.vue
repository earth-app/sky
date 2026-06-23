<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/settings" />
				</IonButtons>
				<IonTitle>My Words</IonTitle>
				<IonButtons slot="end">
					<IonButton
						v-if="list.length > 0"
						color="danger"
						fill="clear"
						@click="confirmClear"
					>
						<UIcon
							name="mdi:delete-sweep"
							class="size-5"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full px-4 pb-8 max-w-3xl mx-auto">
				<p class="text-sm opacity-80 text-center mt-4 mb-4">
					Words you've saved from Word of the Day. Stored on this device, up to {{ cap }} entries.
				</p>

				<div
					v-if="list.length === 0"
					class="w-full rounded-xl border border-black/20 light:border-gray-300 px-6 py-10 text-center"
				>
					<UIcon
						name="mdi:book-alphabet"
						class="size-10 text-info mb-2"
					/>
					<h2 class="text-base! font-semibold m-0! mb-2!">No saved words yet</h2>
					<p class="text-xs opacity-70 m-0!">
						Tap Save Word on a Word of the Day card and it will land here.
					</p>
				</div>

				<IonList
					v-else
					class="w-full rounded-xl border border-black/20 light:border-gray-300"
				>
					<IonItem
						v-for="word in list"
						:key="word.word"
						lines="inset"
					>
						<div class="flex flex-col w-full py-2">
							<div class="flex items-baseline gap-2">
								<span class="text-base font-semibold">{{ word.word }}</span>
								<span class="text-xs italic opacity-70">{{ word.partOfSpeech }}</span>
								<span
									v-if="word.savedAt"
									class="text-[10px] uppercase tracking-wide opacity-50 ml-auto"
									>{{ formatSavedAt(word.savedAt) }}</span
								>
							</div>
							<p class="text-sm opacity-90 m-0! mt-1">{{ word.definition }}</p>
						</div>
						<IonButton
							slot="end"
							fill="clear"
							color="danger"
							aria-label="Remove saved word"
							@click="remove(word.word)"
						>
							<UIcon
								name="mdi:bookmark-off-outline"
								class="size-5"
							/>
						</IonButton>
					</IonItem>
				</IonList>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { DateTime } from 'luxon';

const { list, remove, clearAll, cap } = useSavedWords();

function formatSavedAt(ts: number): string {
	const dt = DateTime.fromMillis(ts);
	return dt.toRelative({ style: 'short' }) ?? '';
}

async function confirmClear() {
	const confirmed = window.confirm(
		'Clear all saved words? This only affects this device and cannot be undone.'
	);
	if (!confirmed) return;
	clearAll();
	await Toast.show({ text: 'Cleared saved words', duration: 'short' });
}
</script>
