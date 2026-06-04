<template>
	<IonCard
		class="m-0 p-4 rounded-xl bg-linear-to-br from-primary/10 via-secondary/5 to-transparent"
	>
		<div class="flex items-center gap-2 mb-2">
			<UIcon
				name="mdi:poll"
				class="size-5 text-primary"
			/>
			<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Poll</h3>
		</div>
		<p class="text-base font-medium mb-3">{{ question }}</p>
		<div class="flex flex-col gap-2">
			<IonButton
				v-for="(option, i) in options"
				:key="`m-poll-${i}`"
				:fill="voted === null ? 'outline' : voted === i ? 'solid' : 'clear'"
				:color="voted === i ? 'primary' : 'medium'"
				:disabled="voted !== null"
				expand="block"
				@click="vote(i)"
			>
				{{ option }}
			</IonButton>
		</div>
		<div
			v-if="voted !== null"
			class="mt-3 flex flex-col gap-2"
		>
			<div
				v-for="(option, i) in options"
				:key="`m-bar-${i}`"
				class="flex flex-col gap-1"
			>
				<div class="flex justify-between text-xs text-gray-500">
					<span :class="{ 'text-primary font-semibold': voted === i }">{{ option }}</span>
					<span>{{ percentages[i] }}%</span>
				</div>
				<IonProgressBar
					:value="(percentages[i] ?? 0) / 100"
					:color="voted === i ? 'primary' : 'medium'"
				/>
			</div>
			<p
				v-if="questHint"
				class="text-xs text-primary mt-2"
			>
				{{ questHint }}
			</p>
		</div>
	</IonCard>
</template>

<script setup lang="ts">
import { IonButton, IonCard, IonProgressBar } from '@ionic/vue';
import { useAppHaptics } from '~/composables/useHaptics';

const props = withDefaults(
	defineProps<{
		question?: string;
		options?: string[];
		results?: number[];
		questHint?: string;
	}>(),
	{
		question: 'Which would you choose: Plant a tree OR Walk 1 mile?',
		options: () => ['Plant a tree', 'Walk 1 mile'],
		results: undefined,
		questHint: undefined
	}
);

const emit = defineEmits<{
	(event: 'complete', payload: { outcome: number }): void;
}>();

const voted = ref<number | null>(null);
const { selection, notifySuccess } = useAppHaptics();

// deterministic pseudo-aggregate per option set
const pseudoResults = computed(() => {
	const base = props.options.map((opt, i) => {
		let h = 0;
		for (let c = 0; c < opt.length; c++) h = (h * 31 + opt.charCodeAt(c)) >>> 0;
		return 20 + ((h + i * 17) % 50);
	});
	const sum = base.reduce((a, b) => a + b, 0) || 1;
	return base.map((v) => Math.round((v / sum) * 100));
});

const percentages = computed(() => {
	const source = props.results ?? pseudoResults.value;
	if (voted.value === null) return source;
	const bumped = [...source];
	bumped[voted.value] = (bumped[voted.value] ?? 0) + 3;
	const total = bumped.reduce((a, b) => a + b, 0) || 1;
	return bumped.map((v) => Math.round((v / total) * 100));
});

function vote(i: number) {
	if (voted.value !== null) return;
	voted.value = i;
	selection();
	notifySuccess();
	emit('complete', { outcome: i });
}
</script>
