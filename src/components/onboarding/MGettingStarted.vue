<template>
	<div
		v-if="visible"
		id="getting-started"
		class="w-full px-4 pb-4"
	>
		<MSurface class="gap-3 border-primary/30! bg-primary/10">
			<div class="flex items-center gap-3">
				<UIcon
					name="mdi:flag-checkered"
					class="size-6 shrink-0 m-text-brand"
					aria-hidden="true"
				/>
				<div class="flex min-w-0 flex-1 flex-col">
					<h2 class="m-0! truncate text-sm! font-semibold">Getting Started</h2>
					<p class="m-0! truncate text-xs text-muted">{{ nextHint }}</p>
				</div>
				<span class="shrink-0 text-sm font-bold! tabular-nums">{{ completed }}/{{ total }}</span>
			</div>

			<MProgress
				:value="fraction"
				:total="total"
				color="primary"
			/>

			<IonButton
				class="self-end"
				size="small"
				fill="outline"
				color="primary"
				@click="viewChecklist"
			>
				<UIcon
					name="mdi:format-list-checks"
					class="mr-1.5 size-4"
				/>
				View Checklist
			</IonButton>
		</MSurface>
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
const fraction = computed(() => (total.value ? completed.value / total.value : 0));

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
