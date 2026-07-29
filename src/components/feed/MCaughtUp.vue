<template>
	<div class="w-full max-w-2xl mx-auto px-4 my-6">
		<IonCard
			id="feed-caught-up"
			:color="theme"
			:class="['m-0 overflow-hidden', prefersReducedMotion ? '' : 'caught-up-appear']"
		>
			<MAmbient
				:seed="ambientSeed"
				:height="AMBIENT_BAND"
				class="absolute inset-x-0 top-0 opacity-30"
			/>
			<div
				class="pointer-events-none absolute inset-x-0 top-0"
				:style="{ height: `${AMBIENT_BAND}px`, backgroundImage: ambientFade }"
			/>
			<div class="relative flex flex-col items-center text-center gap-3 px-5 py-6">
				<div :class="['caught-up-badge', prefersReducedMotion ? '' : 'caught-up-badge-float']">
					<UIcon
						name="mdi:leaf-circle-outline"
						class="size-12 text-success"
					/>
				</div>
				<h3 class="text-lg font-bold m-0!">You're All Caught Up</h3>
				<p class="text-sm opacity-70 m-0! max-w-md">
					{{ headline }}
				</p>
				<p
					v-if="bestLabel"
					class="text-xs opacity-60 m-0!"
				>
					{{ bestLabel }}
				</p>

				<div class="flex flex-col gap-2 w-full max-w-xs mt-2">
					<IonButton
						expand="block"
						color="success"
						@click="goOutside"
					>
						<UIcon
							name="mdi:map-marker-path"
							class="size-5 mr-2"
						/>
						Browse Trails
					</IonButton>
					<IonButton
						v-if="questCta"
						expand="block"
						fill="outline"
						color="primary"
						@click="openQuest"
					>
						<UIcon
							:name="questCta.daily ? 'ion:flash-outline' : 'mdi:compass-rose'"
							class="size-5 mr-2"
						/>
						{{ questCta.label }}
					</IonButton>
				</div>

				<button
					type="button"
					class="mt-2! text-xs! opacity-60! underline! bg-transparent!"
					@click="onKeepBrowsing"
				>
					Keep Browsing
				</button>
			</div>
		</IonCard>
	</div>
</template>

<script setup lang="ts">
import { theme } from '~/composables/useSettings';
import { caughtUpQuestCta } from '~/utils/feed';

const props = withDefaults(
	defineProps<{
		reason?: 'session' | 'daily' | null;
	}>(),
	{ reason: 'session' }
);

const emit = defineEmits<{ (e: 'keep-browsing'): void }>();

const ionRouter = useIonRouter();
const { selection, impactLight } = useAppHaptics();
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

// the ambient band and its fade share one height, so the scene dissolves instead of cutting off
const AMBIENT_BAND = 280;

const { user: currentUser } = useAuth();
// account data, never a device value; the same account always closes the feed on the same sky
const ambientSeed = computed(() => currentUser.value?.id || 'sky');
const userId = computed(() => currentUser.value?.id);

// the card carries an ionic color, so the fade has to land on that color and not on the page
const ambientFade = computed(
	() => `linear-gradient(180deg, transparent 0%, var(--ion-color-${theme.value}) 100%)`
);

const { quest: dailyQuest, markTapped: markDailyQuestTapped } = useDailyQuest();
// the same store MJourneyHero reads and already fetched on this page; read-only, so no extra request
const { quest: currentQuest } = useUser(userId);
// nature minutes is shared store state; the dashboard card already hydrated it, so read-only here
const { natureMinutes } = useNatureMinutes();

const questCta = computed(() =>
	caughtUpQuestCta(currentQuest.value?.questId, dailyQuest.value?.id)
);

// calm, non-transactional exit copy; nudge toward the 120 min/week nature thesis
const headline = computed(() =>
	props.reason === 'daily'
		? "That's a full day of screen time. The rest of today is waiting outside."
		: "You've reached a good stopping point. The best part of today is still outside."
);

// self-referential personal-best touch (informational, never compared)
const bestLabel = computed(() => {
	const nm = natureMinutes.value;
	if (!nm) return '';
	if (nm.best > 0)
		return `Personal Best: ${nm.best} min outdoors in a week. This week: ${Math.round(nm.minutes)} min.`;
	return `${Math.round(nm.minutes)} of ${nm.target} Nature Minutes this week. Every walk counts.`;
});

function goOutside() {
	void selection();
	ionRouter.push('/tabs/trails');
}

function openQuest() {
	const cta = questCta.value;
	if (!cta) return;

	void selection();
	if (cta.daily) markDailyQuestTapped();
	ionRouter.navigate(`/tabs/quests/${cta.questId}`, 'forward', 'push');
}

function onKeepBrowsing() {
	void selection();
	emit('keep-browsing');
}

onMounted(() => {
	// gentle landing cue; useAppHaptics no-ops off-native + when haptics are disabled
	void impactLight();
});
</script>

<style scoped>
.caught-up-appear {
	animation: caught-up-appear 0.45s ease-out both;
}
@keyframes caught-up-appear {
	from {
		opacity: 0;
		transform: translateY(10px) scale(0.98);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

.caught-up-badge-float {
	animation: caught-up-badge-float 3.5s ease-in-out infinite;
}
@keyframes caught-up-badge-float {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-4px);
	}
}
</style>
