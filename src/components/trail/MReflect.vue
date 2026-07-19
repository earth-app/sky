<template>
	<div class="flex flex-col gap-5 py-6 px-4 max-w-xl mx-auto">
		<div class="flex flex-col items-center text-center gap-2">
			<div class="size-14 rounded-full bg-primary/10 flex items-center justify-center">
				<UIcon
					name="mdi:book-heart-outline"
					class="size-8 text-primary"
				/>
			</div>
			<h3 class="text-lg! font-semibold m-0!">A Moment to Reflect</h3>
			<p class="text-base opacity-90 wrap-break-word">{{ reflectionPrompt }}</p>
			<span class="text-xs opacity-60">Just for you. Your journal is private.</span>
		</div>

		<IonTextarea
			v-model="note"
			:rows="4"
			:maxlength="600"
			auto-grow
			fill="outline"
			placeholder="A few words on what you noticed..."
		/>

		<div class="flex flex-col gap-2">
			<span class="text-sm font-medium">How Did It Feel?</span>
			<div class="flex flex-wrap gap-2">
				<IonChip
					v-for="m in moods"
					:key="m.mood"
					:color="mood === m.mood ? 'primary' : 'medium'"
					:outline="mood !== m.mood"
					@click="toggleMood(m.mood)"
				>
					<UIcon
						:name="m.icon"
						class="size-4 mr-1"
					/>
					<IonLabel class="text-xs font-semibold">{{ m.label }}</IonLabel>
				</IonChip>
			</div>
		</div>

		<IonItem
			lines="none"
			class="rounded-lg border border-neutral-200 dark:border-neutral-800"
		>
			<IonToggle
				:checked="shareToGarden"
				justify="space-between"
				color="primary"
				@ionChange="onShareToggle"
			>
				<div class="flex flex-col">
					<span class="text-sm font-medium">Grow My Shared Garden</span>
					<span class="text-xs opacity-60">Add this time to the garden you share with friends</span>
				</div>
			</IonToggle>
		</IonItem>

		<div class="flex items-center justify-between gap-2">
			<IonButton
				fill="clear"
				color="medium"
				@click="save(true)"
				>Skip for Now</IonButton
			>
			<IonButton
				color="primary"
				@click="save(false)"
			>
				<UIcon
					name="mdi:check"
					class="size-5 mr-2"
				/>
				Save Reflection
			</IonButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TrailMood, TrailPractice, TrailReflection } from 'types/trails';

const props = defineProps<{
	reflectionPrompt: string;
	practice: TrailPractice;
	photoCount?: number;
}>();

const emit = defineEmits<{
	save: [reflection: TrailReflection];
}>();

const moods = computed(() => TRAIL_MOODS.map((m) => trailMoodMeta(m)!).filter(Boolean));

const note = ref('');
const mood = ref<TrailMood | undefined>(undefined);
const shareToGarden = ref(true);

function toggleMood(m: TrailMood) {
	mood.value = mood.value === m ? undefined : m;
}

function onShareToggle(event: CustomEvent) {
	shareToGarden.value = Boolean(event.detail?.checked);
}

function save(skip: boolean) {
	const reflection: TrailReflection = {
		at: new Date().toISOString(),
		sharedToGarden: shareToGarden.value,
		...(props.photoCount ? { photoCount: props.photoCount } : {})
	};
	if (!skip) {
		const trimmed = note.value.trim();
		if (trimmed) reflection.note = trimmed;
		if (mood.value) reflection.mood = mood.value;
	}
	emit('save', reflection);
}
</script>
