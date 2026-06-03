<template>
	<div
		v-if="visible"
		class="w-full max-w-2xl mx-auto px-4 mb-4"
	>
		<IonCard
			:color="theme"
			class="m-0 p-0"
		>
			<div class="flex items-center justify-between px-4 py-3">
				<div class="flex items-center">
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
					class="flex flex-col items-center gap-1 py-3 rounded-lg transition-colors active:bg-primary/10"
					:class="row.count > 0 ? 'bg-primary/5' : 'opacity-60'"
					:aria-label="`${row.label} journey: ${row.count}. Tap to continue.`"
					@click="onTap(row)"
				>
					<UIcon
						:name="row.icon"
						class="size-6"
						:class="row.count > 0 ? 'text-primary' : 'text-gray-500'"
					/>
					<span class="text-xl font-bold tabular-nums leading-none">{{ row.count }}</span>
					<span class="text-xs opacity-80">{{ row.label }}</span>
				</button>
			</div>
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

const counts = ref<Record<JourneyType, number>>({ article: 0, prompt: 0, event: 0 });

const rows = computed(() => ROWS.map((r) => ({ ...r, count: counts.value[r.type] })));

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
		if (valid(res)) counts.value[row.type] = res.data?.count ?? 0;
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
	if (detail.type in counts.value) counts.value[detail.type] = detail.count;
}

onMounted(() => {
	void loadJourneys();
	if (import.meta.client) {
		window.addEventListener('earth-app:journey-updated', onJourneyUpdated);
	}
});

onBeforeUnmount(() => {
	if (import.meta.client) {
		window.removeEventListener('earth-app:journey-updated', onJourneyUpdated);
	}
});

watch(
	() => user.value?.id,
	(id) => {
		if (id) void loadJourneys();
	}
);
</script>
