<template>
	<div
		v-if="visible"
		class="w-full max-w-2xl mx-auto px-4 mb-4"
	>
		<IonCard
			:color="theme"
			class="m-0 p-0"
		>
			<div
				v-if="currentQuest"
				class="px-3 pt-3"
			>
				<IonChip
					:class="['m-0 quest-chip', !prefersReducedMotion ? 'current-quest-pulse' : '']"
					color="warning"
					@click="openCurrentQuest"
				>
					<IonLabel class="flex items-center text-xs font-semibold px-3">
						<UIcon
							name="mdi:compass-rose"
							class="size-4 mr-1"
						/>
						Continue Quest: {{ truncatedCurrentTitle }}
					</IonLabel>
				</IonChip>
			</div>
			<div
				v-else-if="dailyQuest"
				class="px-3 pt-3"
			>
				<IonChip
					:class="[
						'm-0 quest-chip',
						!dailyQuestTapped && !prefersReducedMotion ? 'daily-quest-pulse' : ''
					]"
					color="primary"
					@click="openDailyQuest"
				>
					<IonLabel class="flex items-center text-xs font-semibold px-3">
						<UIcon
							name="ion:flash-outline"
							class="size-4 mr-1"
						/>
						Today's Quest: {{ truncatedTitle }}
					</IonLabel>
				</IonChip>
			</div>
			<div class="flex items-center px-4 py-3">
				<div class="flex items-center min-w-3/5">
					<UIcon
						name="mdi:fire"
						class="size-6 text-warning"
					/>
					<h3 class="text-sm font-semibold m-0! tracking-wide opacity-80">Your Journeys</h3>
				</div>
				<span class="text-xs opacity-60">resets after 48h of inactivity</span>
			</div>
			<div class="grid grid-cols-3 gap-2 px-3 pb-3">
				<button
					v-for="row in rows"
					:key="row.type"
					type="button"
					class="flex flex-col items-center gap-1 py-3! rounded-lg! transition-colors active:bg-primary/10"
					:class="cellClass(row)"
					:aria-label="`${row.label} journey: ${row.count}. Tap to continue.`"
					@click="onTap(row)"
				>
					<UIcon
						:name="row.icon"
						class="size-6"
						:class="row.count > 0 ? 'text-primary' : 'text-gray-500'"
					/>
					<span class="text-xl font-bold! tabular-nums leading-none">{{ row.count }}</span>
					<span class="text-xs opacity-80">{{ row.label }}</span>
					<span
						v-if="row.expiringSoon"
						class="text-[10px] font-semibold! text-red-500"
						>Expires Soon</span
					>
				</button>
			</div>
			<button
				v-if="showQuestCta"
				type="button"
				class="mx-2! px-3! mb-3! flex items-center justify-center gap-2 py-2! rounded-lg! bg-primary/10! active:bg-primary/20! text-primary! text-sm! font-medium!"
				@click="onTapQuestCta"
			>
				<UIcon
					name="mdi:flag-checkered"
					class="size-4"
				/>
				<span>Try a Quest to Keep your Streak Alive</span>
			</button>
		</IonCard>
	</div>
</template>

<script setup lang="ts">
import { theme } from '~/composables/useSettings';

type JourneyType = 'article' | 'prompt' | 'event';

const ROWS: { type: JourneyType; label: string; icon: string; cta: string }[] = [
	{
		type: 'article',
		label: 'Articles',
		icon: 'mdi:book-open-page-variant-outline',
		cta: '/tabs/discover?tab=article'
	},
	{
		type: 'prompt',
		label: 'Prompts',
		icon: 'mdi:lightbulb-on-outline',
		cta: '/tabs/discover?tab=prompt'
	},
	{ type: 'event', label: 'Events', icon: 'mdi:calendar-star', cta: '/tabs/discover?tab=event' }
];

const { user, fetchCurrentJourney } = useAuth(makeMServerRequest);
const ionRouter = useIonRouter();
const { selection } = useAppHaptics();
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

const userId = computed(() => user.value?.id);

const {
	quest: dailyQuest,
	isTapped: dailyQuestTapped,
	markTapped: markDailyQuestTapped
} = useDailyQuest();
const { quest: currentQuest, fetchUserQuest } = useUser(userId);

function truncate(t: string): string {
	return t.length > 30 ? `${t.slice(0, 27).trimEnd()}...` : t;
}

const truncatedTitle = computed(() => truncate(dailyQuest.value?.title ?? ''));
const truncatedCurrentTitle = computed(() => truncate(currentQuest.value?.quest.title ?? ''));

function openDailyQuest() {
	if (!dailyQuest.value) return;
	void selection();
	markDailyQuestTapped();
	ionRouter.navigate(`/tabs/quests/${dailyQuest.value.id}`, 'forward', 'push');
}

function openCurrentQuest() {
	if (!currentQuest.value) return;
	void selection();
	ionRouter.navigate(`/tabs/quests/${currentQuest.value.questId}`, 'forward', 'push');
}

watch(
	userId,
	(id) => {
		if (id) void fetchUserQuest();
	},
	{ immediate: true }
);

const STREAK_TTL_MS = 172800000;
const WARN_THRESHOLD_MS = 12 * 60 * 60 * 1000;

const counts = ref<Record<JourneyType, number>>({ article: 0, prompt: 0, event: 0 });
const lastWrites = ref<Record<JourneyType, number>>({ article: 0, prompt: 0, event: 0 });
const now = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;

const rows = computed(() =>
	ROWS.map((r) => {
		const lw = lastWrites.value[r.type];
		const remaining = lw ? lw + STREAK_TTL_MS - now.value : 0;
		const expiringSoon = counts.value[r.type] > 0 && remaining > 0 && remaining < WARN_THRESHOLD_MS;
		return { ...r, count: counts.value[r.type], expiringSoon };
	})
);

const showQuestCta = computed(() => {
	const anyExpiring = rows.value.some((r) => r.expiringSoon);
	const allZero = rows.value.every((r) => r.count === 0);
	return anyExpiring || allZero;
});

function cellClass(row: { count: number; expiringSoon: boolean }) {
	if (row.expiringSoon) return 'bg-red-500/10';
	if (row.count > 0) return 'bg-primary/5';
	return 'opacity-60';
}

function onTapQuestCta() {
	ionRouter.push('/tabs/quests');
}

// only show the card once we have at least one fetch returned to avoid a flash of zeros
const hasLoaded = ref(false);
const visible = computed(() => !!user.value && hasLoaded.value);

async function loadJourneys() {
	if (!user.value) return;
	const userId = user.value.id;
	const results = await Promise.all(
		ROWS.map((r) => fetchCurrentJourney(r.type, userId).catch(() => null))
	);
	for (let i = 0; i < ROWS.length; i++) {
		const res = results[i];
		const row = ROWS[i];
		if (!res || !row) continue;
		if (valid(res)) {
			counts.value[row.type] = res.data?.count ?? 0;
			lastWrites.value[row.type] = (res.data as { lastWrite?: number })?.lastWrite ?? 0;
		}
	}
	hasLoaded.value = true;
}

function onTap(row: { type: JourneyType; cta: string }) {
	ionRouter.push(row.cta);
}

// keep the hero in sync with crust's live journey-update events
function onJourneyUpdated(ev: Event) {
	const detail = (ev as CustomEvent<{ type: JourneyType; count: number }>).detail;
	if (!detail) return;
	if (detail.type in counts.value) {
		counts.value[detail.type] = detail.count;
		lastWrites.value[detail.type] = Date.now();
	}
}

onMounted(() => {
	void loadJourneys();
	if (import.meta.client) {
		window.addEventListener('earth-app:journey-updated', onJourneyUpdated);
		tickHandle = setInterval(() => {
			now.value = Date.now();
		}, 60000);
	}
});

onBeforeUnmount(() => {
	if (import.meta.client) {
		window.removeEventListener('earth-app:journey-updated', onJourneyUpdated);
	}
	if (tickHandle) clearInterval(tickHandle);
});

watch(
	() => user.value?.id,
	(id) => {
		if (id) void loadJourneys();
	}
);
</script>

<style scoped>
.quest-chip {
	position: relative;
	overflow: visible;
}

.daily-quest-pulse {
	animation: daily-quest-pulse 1.6s ease-out infinite;
}
@keyframes daily-quest-pulse {
	0% {
		box-shadow: 0 0 0 0 rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0.55);
	}
	80% {
		box-shadow: 0 0 0 10px rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0);
	}
	100% {
		box-shadow: 0 0 0 0 rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0);
	}
}

.current-quest-pulse {
	animation: current-quest-pulse 1.6s ease-out infinite;
}
@keyframes current-quest-pulse {
	0% {
		box-shadow: 0 0 0 0 rgba(var(--ion-color-warning-rgb, 56, 128, 255), 0.55);
	}
	80% {
		box-shadow: 0 0 0 10px rgba(var(--ion-color-warning-rgb, 56, 128, 255), 0);
	}
	100% {
		box-shadow: 0 0 0 0 rgba(var(--ion-color-warning-rgb, 56, 128, 255), 0);
	}
}
</style>
