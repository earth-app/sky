<template>
	<IonCard
		v-if="show"
		id="welcome-checklist"
		class="ion-no-margin border-2 border-primary/30 p-2 bg-linear-to-br from-primary/15 to-transparent my-3!"
	>
		<IonCardHeader>
			<div class="flex items-start justify-between gap-3">
				<div class="flex flex-col">
					<div class="flex items-center gap-2">
						<UIcon
							name="mdi:rocket-launch-outline"
							class="size-5 text-secondary"
						/>
						<IonCardTitle class="text-base!">Welcome to The Earth App</IonCardTitle>
					</div>
					<IonCardSubtitle class="text-xs! my-1!">
						Complete to finish your first quest!
					</IonCardSubtitle>
				</div>
				<IonButton
					fill="clear"
					color="medium"
					size="small"
					@click="dismiss"
					aria-label="Hide Checklist"
				>
					<UIcon
						name="mdi:eye-off-outline"
						class="size-5"
					/>
				</IonButton>
			</div>
		</IonCardHeader>
		<IonCardContent class="pt-0! px-1!">
			<div class="mb-3">
				<div class="flex items-center justify-between text-xs mb-1">
					<span class="text-muted">{{ progress.done }} of {{ progress.total }} done</span>
					<span class="font-medium">{{ percent }}%</span>
				</div>
				<IonProgressBar
					:value="percent / 100"
					color="primary"
				/>
			</div>

			<div class="flex flex-col gap-1">
				<div
					v-for="step in steps"
					:key="step.id"
					class="flex items-start gap-3 rounded-lg px-2 py-2"
					:class="isDone(step.id) ? 'opacity-60' : step.id === nextStep?.id ? 'bg-primary/10' : ''"
				>
					<UIcon
						:name="isDone(step.id) ? 'mdi:check-circle' : step.icon"
						class="size-5 mt-0.5 shrink-0"
						:class="isDone(step.id) ? 'text-success' : 'text-default'"
					/>
					<div class="flex-1 min-w-0">
						<p
							class="text-sm font-medium leading-tight"
							:class="isDone(step.id) ? 'line-through' : ''"
						>
							{{ step.title }}
						</p>
						<p
							v-if="!isDone(step.id)"
							class="text-xs text-muted mt-0.5"
						>
							{{ step.description }}
						</p>
					</div>
					<IonButton
						v-if="!isDone(step.id) && step.id === nextStep?.id"
						size="small"
						color="primary"
						fill="solid"
						@click="invoke(step)"
					>
						{{ step.cta }}
					</IonButton>
					<IonButton
						v-else-if="!isDone(step.id)"
						size="small"
						color="medium"
						fill="outline"
						@click="invoke(step)"
					>
						{{ step.cta }}
					</IonButton>
				</div>
			</div>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const onboarding = useOnboarding();
const { user } = useAuth();
const router = useIonRouter();
const tours = useSiteTour();

onMounted(() => {
	if (user.value) onboarding.fetchState();
});

watch(user, (u) => {
	if (u) onboarding.fetchState();
});

// same auto-detection watchers crust uses — the composable + checklist data
// are shared, so completion semantics stay consistent across web and mobile
watch(
	() => user.value?.account?.email_verified,
	(v) => {
		if (
			v &&
			onboarding.state.value &&
			!onboarding.state.value.completed_steps.includes('verify_email')
		) {
			onboarding.completeStep('verify_email');
		}
	},
	{ immediate: true }
);
watch(
	() => user.value?.activities?.length ?? 0,
	(n) => {
		if (
			n > 0 &&
			onboarding.state.value &&
			!onboarding.state.value.completed_steps.includes('first_activity')
		) {
			onboarding.completeStep('first_activity');
		}
	},
	{ immediate: true }
);
watch(
	() => user.value?.mutual_count ?? 0,
	(n) => {
		if (
			n > 0 &&
			onboarding.state.value &&
			!onboarding.state.value.completed_steps.includes('first_friend')
		) {
			onboarding.completeStep('first_friend');
		}
	},
	{ immediate: true }
);
watch(
	() => tours.hasCompleted('welcome'),
	(done) => {
		if (
			done &&
			onboarding.state.value &&
			!onboarding.state.value.completed_steps.includes('welcome')
		) {
			onboarding.completeStep('welcome');
		}
	},
	{ immediate: true }
);

const userStore = useUserStore();
watch(
	() => {
		const uid = user.value?.id;
		if (!uid) return false;
		return !!userStore.quest.get(uid);
	},
	(hasActive) => {
		if (
			hasActive &&
			onboarding.state.value &&
			!onboarding.state.value.completed_steps.includes('first_quest_started')
		) {
			onboarding.completeStep('first_quest_started');
		}
	},
	{ immediate: true }
);
watch(
	() => {
		const uid = user.value?.id;
		if (!uid) return 0;
		return userStore.questHistory.get(uid)?.size ?? 0;
	},
	(n) => {
		if (!onboarding.state.value) return;
		if (n > 0) {
			if (!onboarding.state.value.completed_steps.includes('first_quest_started')) {
				onboarding.completeStep('first_quest_started');
			}
			if (!onboarding.state.value.completed_steps.includes('first_quest_completed')) {
				onboarding.completeStep('first_quest_completed');
			}
		}
	},
	{ immediate: true }
);

const steps = ONBOARDING_CHECKLIST;
const progress = computed(() => onboarding.progress.value);
const nextStep = computed(() => onboarding.nextStep.value || steps[0]);
const percent = computed(() =>
	progress.value.total === 0 ? 0 : Math.round((progress.value.done / progress.value.total) * 100)
);

const show = computed(() => {
	if (!user.value) return false;
	if (onboarding.isDismissed.value) return false;
	if (onboarding.isComplete.value) return false;
	return true;
});

function isDone(id: string) {
	return onboarding.state.value?.completed_steps.includes(id as any) ?? false;
}

function invoke(step: (typeof ONBOARDING_CHECKLIST)[number]) {
	if (step.id === 'welcome') {
		tours.startTour('welcome');
		return;
	}
	if (step.id === 'pick_interests') {
		emit('open-persona');
		return;
	}
	if (step.completeOnClick) {
		void onboarding.completeStep(step.id);
	}
	// sky routes live under /tabs/* — prefer the mobile-specific link when set
	const target = step.mLink ?? step.link;
	if (target) router.navigate(target, 'forward');
}

const emit = defineEmits<{
	(event: 'open-persona'): void;
}>();

async function dismiss() {
	onboarding.dismiss();

	await Toast.show({
		text: 'Checklist dismissed.',
		duration: 'long'
	});
}
</script>
