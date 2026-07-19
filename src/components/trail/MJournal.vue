<template>
	<IonModal
		:is-open="isOpen"
		@did-dismiss="isOpen = false"
	>
		<IonHeader>
			<IonToolbar>
				<IonTitle>
					<span class="font-semibold text-base!">Your Trail Journal</span>
				</IonTitle>
				<IonButtons slot="end">
					<IonButton
						color="medium"
						aria-label="Close journal"
						@click="isOpen = false"
					>
						<UIcon
							name="mdi:close"
							class="min-h-6 min-w-6"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col gap-3 px-4 py-4 max-w-xl mx-auto w-full">
				<p class="text-xs opacity-60">A private record of your practices. Only you can see this.</p>

				<div
					v-if="entries.length"
					class="flex items-center gap-2 text-sm opacity-80"
				>
					<UIcon
						name="mdi:timer-sand"
						class="size-4 text-primary"
					/>
					<span>{{ total }} unhurried minutes across {{ entries.length }} reflections</span>
				</div>

				<div
					v-if="loading && !entries.length"
					class="flex flex-col gap-2"
				>
					<MSkeleton
						v-for="n in 3"
						:key="n"
						:height="80"
						width="100%"
					/>
				</div>

				<div
					v-else-if="!entries.length"
					class="flex flex-col items-center gap-2 py-10 text-center opacity-70"
				>
					<UIcon
						name="mdi:book-open-blank-variant"
						class="size-10"
					/>
					<p class="text-sm">Your journal fills as you finish trails. Head out and begin one.</p>
				</div>

				<ul
					v-else
					class="flex flex-col gap-3"
				>
					<li
						v-for="(e, i) in entries"
						:key="`${e.trailId}-${e.completedAt}-${i}`"
						class="flex flex-col gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0">
								<UIcon
									:name="practiceMeta(e.practice).icon"
									class="size-5 text-primary shrink-0"
								/>
								<span class="font-medium truncate">{{ e.title }}</span>
							</div>
							<span class="text-xs opacity-60 shrink-0">{{ formatDate(e.completedAt) }}</span>
						</div>

						<p
							v-if="e.reflection.note"
							class="text-sm opacity-90 wrap-break-word whitespace-pre-line"
						>
							{{ e.reflection.note }}
						</p>

						<div class="flex flex-wrap items-center gap-3 text-xs opacity-70">
							<span class="flex items-center gap-1">
								<UIcon
									name="mdi:leaf"
									class="size-3.5"
								/>
								{{ e.presenceMinutes }} min
							</span>
							<span
								v-if="moodMeta(e.reflection.mood)"
								class="flex items-center gap-1"
							>
								<UIcon
									:name="moodMeta(e.reflection.mood)!.icon"
									class="size-3.5"
								/>
								{{ moodMeta(e.reflection.mood)!.label }}
							</span>
							<span
								v-if="e.reflection.photoCount"
								class="flex items-center gap-1"
							>
								<UIcon
									name="mdi:camera-outline"
									class="size-3.5"
								/>
								{{ e.reflection.photoCount }}
							</span>
							<span
								v-if="e.reflection.sharedToGarden"
								class="flex items-center gap-1 text-primary"
							>
								<UIcon
									name="mdi:flower-tulip"
									class="size-3.5"
								/>
								In Your Garden
							</span>
						</div>
					</li>
				</ul>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import type { TrailMood } from 'types/trails';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const isOpen = computed({
	get: () => props.open,
	set: (v) => emit('update:open', v)
});

const { journal, fetchJournal } = useTrails();
const loading = ref(false);

const entries = computed(() => sortJournalByRecent(journal.value));
const total = computed(() => journalTotalMinutes(journal.value));

const practiceMeta = (p: string) => trailPracticeMeta(p);
const moodMeta = (m?: TrailMood) => trailMoodMeta(m);

function formatDate(iso: string): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return '';
	return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

watch(
	() => props.open,
	async (o) => {
		if (!o) return;
		loading.value = true;
		try {
			await fetchJournal();
		} finally {
			loading.value = false;
		}
	}
);
</script>
