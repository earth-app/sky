<template>
	<component
		:is="highlight ? 'UiAnimatedGradientBorder' : 'div'"
		class="rounded-xl"
	>
		<div
			class="flex flex-col h-full p-4 rounded-xl border bg-default active:border-primary/50 transition-colors"
			:class="trail.premium ? 'border-warning/90' : 'border-neutral-200 dark:border-neutral-800'"
		>
			<div class="flex items-start gap-3">
				<div class="size-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
					<UIcon
						:name="trail.icon || 'mdi:map-marker-path'"
						class="size-6 text-primary"
					/>
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="text-base! font-semibold m-0! truncate">{{ trail.title }}</h3>
					<div class="flex flex-wrap items-center gap-1 mt-1">
						<UBadge
							:color="rarityColor"
							variant="subtle"
							size="sm"
							>{{ rarityLabel }}</UBadge
						>
						<UBadge
							color="neutral"
							variant="soft"
							size="sm"
							>{{ themeLabel }}</UBadge
						>
						<UBadge
							v-if="trail.seasonal"
							color="warning"
							variant="soft"
							size="sm"
							>Seasonal</UBadge
						>
						<UBadge
							v-if="trail.premium"
							color="primary"
							variant="soft"
							size="sm"
							class="flex items-center"
						>
							<UIcon
								name="mdi:diamond-stone"
								class="size-3"
							/>
							Premium</UBadge
						>
					</div>
				</div>
			</div>

			<p class="text-sm opacity-80 mt-3 line-clamp-3">{{ trail.description }}</p>

			<UiCuriosityTeaser
				:revealed="revealed"
				:total="1"
				noun="Wonder"
				icon="mdi:map-marker-question-outline"
				class="self-start mt-3"
			/>

			<div class="flex items-center justify-between gap-2 mt-auto pt-4">
				<div class="flex items-center gap-3 text-xs opacity-70">
					<span class="flex items-center gap-1">
						<UIcon
							:name="practiceMeta.icon"
							class="size-4"
						/>
						{{ practiceMeta.label }}
					</span>
					<span class="flex items-center gap-1">
						<UIcon
							name="mdi:timer-sand"
							class="size-4"
						/>
						~{{ targetMinutes }} min
					</span>
				</div>
				<div class="flex items-center gap-1 shrink-0">
					<IonButton
						fill="outline"
						color="tertiary"
						size="small"
						aria-label="Preview Trail"
						@click="emit('preview', trail.id)"
					>
						<UIcon
							name="mdi:eye-outline"
							class="size-5"
						/>
					</IonButton>
					<IonButton
						:color="trail.premium ? 'warning' : 'primary'"
						size="small"
						@click="emit('select', trail.id)"
					>
						<UIcon
							name="mdi:map-marker-path"
							class="size-4 mr-1"
						/>
						Begin Trail
					</IonButton>
				</div>
			</div>
		</div>
	</component>
</template>

<script setup lang="ts">
import { useTrailsStore } from 'stores/trails';
import type { Trail, TrailRarity } from 'types/trails';

const props = defineProps<{ trail: Trail }>();
const emit = defineEmits<{ select: [id: string]; preview: [id: string] }>();

const trailsStore = useTrailsStore();
const practiceMeta = computed(() => trailPracticeMeta(props.trail.practice));
const targetMinutes = computed(() => trailTargetMinutes(props.trail));
// curiosity-gap: the single awe reveal stays hidden until the practice is done
const revealed = computed(() => (trailsStore.getRun(props.trail.id)?.completed ? 1 : 0));

const highlight = computed(
	() => props.trail.rarity === 'amazing' || props.trail.rarity === 'green'
);

const RARITY_LABEL: Record<TrailRarity, string> = {
	normal: 'Normal',
	rare: 'Rare',
	amazing: 'Amazing',
	green: 'Green'
};
type BadgeColor = 'neutral' | 'info' | 'warning' | 'success' | 'primary' | 'secondary' | 'error';
const RARITY_COLOR: Record<TrailRarity, BadgeColor> = {
	normal: 'neutral',
	rare: 'info',
	amazing: 'warning',
	green: 'success'
};
const THEME_LABEL: Record<string, string> = {
	nature: 'Nature',
	curiosity: 'Curiosity',
	creative: 'Creative',
	reflective: 'Reflective',
	mixed: 'Mixed'
};

const rarityLabel = computed(() => RARITY_LABEL[props.trail.rarity] ?? 'Normal');
const rarityColor = computed(() => RARITY_COLOR[props.trail.rarity] ?? 'neutral');
const themeLabel = computed(() => THEME_LABEL[props.trail.theme] ?? 'Mixed');
</script>
