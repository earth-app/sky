<template>
	<div
		v-if="visible"
		id="getting-started"
		class="w-full px-4 mb-4"
	>
		<IonCard class="gs-card m-0 p-4 border-0!">
			<div class="flex items-start gap-3">
				<div class="gs-badge shrink-0 flex items-center justify-center rounded-full size-10">
					<UIcon
						name="mdi:flag-checkered"
						class="size-6 text-white!"
					/>
				</div>
				<div class="flex flex-col min-w-0 flex-1">
					<h2 class="gs-text text-base font-bold! m-0!">Getting Started</h2>
					<p class="gs-text-soft text-xs! m-0! mt-0.5 truncate">{{ nextHint }}</p>
				</div>
				<span class="gs-text text-sm font-bold! tabular-nums shrink-0"
					>{{ completed }}/{{ total }}</span
				>
			</div>

			<div
				class="gs-track mt-3 h-2 w-full rounded-full overflow-hidden"
				role="progressbar"
				:aria-valuenow="completed"
				:aria-valuemin="0"
				:aria-valuemax="total"
				aria-label="Getting Started progress"
			>
				<div
					class="gs-fill h-full rounded-full transition-all duration-500"
					:style="{ width: `${pct}%` }"
				/>
			</div>

			<div class="flex justify-end mt-3">
				<IonButton
					size="small"
					fill="solid"
					class="gs-cta font-semibold!"
					@click="viewChecklist"
				>
					<UIcon
						name="mdi:format-list-checks"
						class="size-4 mr-1.5"
					/>
					View Checklist
				</IonButton>
			</div>
		</IonCard>
	</div>
</template>

<script setup lang="ts">
// above-the-fold "start here" card; the durable guide that new users land on after the
// short welcome tour hands off to it (the tour highlights id="getting-started")
const onboarding = useOnboarding();
const { user } = useAuth();

// count REQUIRED steps only so the card reaches N/N exactly when isComplete flips (isComplete
// ignores optional steps); avoids showing "8/10" then vanishing mid-count
const requiredSteps = ONBOARDING_CHECKLIST.filter((s) => !s.optional);
const completedSet = computed(() => new Set(onboarding.state.value?.completed_steps ?? []));
const total = computed(() => requiredSteps.length);
const completed = computed(() => requiredSteps.filter((s) => completedSet.value.has(s.id)).length);
const pct = computed(() => (total.value ? Math.round((completed.value / total.value) * 100) : 0));

// only for logged-in users mid-onboarding; hidden once complete or dismissed so it never
// lingers for returning users
const visible = computed(
	() =>
		!!user.value &&
		!!onboarding.state.value &&
		!onboarding.isComplete.value &&
		!onboarding.isDismissed.value
);

const nextStep = computed(() => ONBOARDING_CHECKLIST.find((s) => !completedSet.value.has(s.id)));
const nextHint = computed(() =>
	nextStep.value ? `Next: ${nextStep.value.title}` : 'Finish Setting up Your Account'
);

function viewChecklist() {
	if (typeof document === 'undefined') return;
	document
		.getElementById('welcome-checklist')
		?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<style scoped>
/* on-brand earth gradient; theme-aware via ionic color tokens */
.gs-card {
	background: linear-gradient(
		135deg,
		var(--ion-color-primary, #2e7d5b),
		var(--ion-color-secondary, #1b5e5e)
	);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.gs-badge {
	background: rgba(255, 255, 255, 0.18);
}

.gs-text {
	color: #fff;
}

.gs-text-soft {
	color: rgba(255, 255, 255, 0.85);
}

.gs-track {
	background: rgba(255, 255, 255, 0.25);
}

.gs-fill {
	background: #fff;
}

.gs-cta {
	--background: rgba(255, 255, 255, 0.95);
	--background-hover: #fff;
	--background-activated: #fff;
	--color: var(--ion-color-primary, #2e7d5b);
	--border-radius: 9999px;
}
</style>
