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
					<div
						v-if="showActions(step)"
						class="flex flex-col items-end gap-1 shrink-0"
					>
						<IonButton
							size="small"
							:color="step.id === nextStep?.id ? 'primary' : 'medium'"
							:fill="step.id === nextStep?.id ? 'solid' : 'outline'"
							:disabled="isBusy(step)"
							@click="invoke(step)"
						>
							<IonSpinner
								v-if="isBusy(step)"
								name="crescent"
								class="size-4"
							/>
							<span v-else>{{ ctaLabel(step) }}</span>
						</IonButton>
						<IonButton
							v-if="step.optional && !isDone(step.id) && !stepCompleted(step.id)"
							size="small"
							color="medium"
							fill="clear"
							:disabled="isBusy(step)"
							@click="skipStep(step)"
						>
							Skip
						</IonButton>
					</div>
				</div>
			</div>
		</IonCardContent>
	</IonCard>

	<IonCard
		v-else-if="showError"
		id="welcome-checklist-error"
		class="ion-no-margin border-2 border-primary/30 p-2 my-3!"
	>
		<IonCardContent class="text-center">
			<UIcon
				name="mdi:cloud-alert-outline"
				class="size-6 text-muted mx-auto mb-2"
			/>
			<p class="text-sm text-muted mb-3">We couldn't load your welcome checklist.</p>
			<IonButton
				size="small"
				color="primary"
				fill="solid"
				:disabled="onboarding.loading.value"
				@click="retry"
			>
				<IonSpinner
					v-if="onboarding.loading.value"
					name="crescent"
					class="size-4"
				/>
				<span v-else>Retry</span>
			</IonButton>
		</IonCardContent>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const onboarding = useOnboarding();
const { user, regenerateAvatar, fetchUser } = useAuth();
const router = useIonRouter();
const tours = useSiteTour();
const avatarStore = useAvatarStore();
const { impactMedium, notifySuccess, notifyError } = useAppHaptics();

const generatingAvatar = ref(false);

// canonical "has a custom avatar" signal: mantle2 always emits the profile_photo
// endpoint url, so the truth is whether the avatar actually loaded bytes (a 404
// default placeholder lands in the store's failedUrls, never in the cache)
const avatarUrl = computed(() => user.value?.account?.avatar_url);
const hasCustomAvatar = computed(() => {
	const url = avatarUrl.value;
	if (!url || !(url.startsWith('http://') || url.startsWith('https://'))) return false;
	return avatarStore.has(url);
});

onMounted(() => {
	if (user.value) onboarding.fetchState();
});

watch(user, (u) => {
	if (u) onboarding.fetchState();
});

// same auto-detection watchers crust uses; the composable + checklist data
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
// persist generate_avatar server-side once the user actually has a custom avatar;
// the row's done-state is still derived from hasCustomAvatar so it re-opens if lost
watch(
	hasCustomAvatar,
	(has) => {
		if (
			has &&
			onboarding.state.value &&
			!onboarding.state.value.completed_steps.includes('generate_avatar')
		) {
			onboarding.completeStep('generate_avatar');
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

// wait for the first fetch before rendering; `state` is null on mount, which
// makes isDismissed/isComplete read false and produces a one-frame flash on
// users who have already dismissed or finished the checklist
const show = computed(() => {
	if (!user.value) return false;
	if (!onboarding.state.value) return false;
	if (onboarding.isDismissed.value) return false;
	if (onboarding.isComplete.value) return false;
	return true;
});

// surface a retry instead of silently vanishing when the first fetch fails
const showError = computed(
	() =>
		Boolean(user.value) &&
		onboarding.error.value &&
		!onboarding.state.value &&
		!onboarding.isDismissed.value
);

function retry() {
	void onboarding.fetchState(true);
}

function stepCompleted(id: string) {
	return onboarding.state.value?.completed_steps.includes(id as any) ?? false;
}

function isDone(id: string) {
	// generate_avatar is done only while the user actually has a custom avatar, so it
	// stays an outstanding to-do (and re-opens if the avatar is ever lost); a skip
	// still records server-side for overall progress but does not mark the row done
	if (id === 'generate_avatar') return hasCustomAvatar.value;
	return stepCompleted(id);
}

function isBusy(step: (typeof ONBOARDING_CHECKLIST)[number]) {
	return step.id === 'generate_avatar' && generatingAvatar.value;
}

// generate_avatar keeps its CTA after completion so users can freely re-roll;
// every other step hides its action once done
function showActions(step: (typeof ONBOARDING_CHECKLIST)[number]) {
	return !isDone(step.id) || step.id === 'generate_avatar';
}

function ctaLabel(step: (typeof ONBOARDING_CHECKLIST)[number]) {
	if (step.id === 'generate_avatar' && isDone(step.id)) return 'Regenerate Avatar';
	return step.cta;
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
	if (step.id === 'generate_avatar') {
		void generateAvatar();
		return;
	}
	if (step.completeOnClick) {
		void onboarding.completeStep(step.id);
	}
	// sky routes live under /tabs/*; prefer the mobile-specific link when set
	const target = step.mLink ?? step.link;
	if (target) router.navigate(target, 'forward');
}

async function skipStep(step: (typeof ONBOARDING_CHECKLIST)[number]) {
	if (isBusy(step)) return;
	const ok = await onboarding.completeStep(step.id);
	// only confirm when the server actually recorded the skip
	if (ok) await Toast.show({ text: 'Step Skipped.', duration: 'short' });
}

async function generateAvatar() {
	if (generatingAvatar.value) return;

	generatingAvatar.value = true;
	await impactMedium();

	try {
		const res = await regenerateAvatar();
		if (valid(res) && res.data instanceof Blob) {
			const remoteUrl = user.value?.account?.avatar_url;
			if (remoteUrl && (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://'))) {
				avatarStore.clear(remoteUrl);
				// cache-bust for fresh bytes on profile surfaces, plus reprime the base
				// url so the has-avatar signal flips and the step auto-completes
				avatarStore.preloadAvatar(
					`${remoteUrl}${remoteUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
				);
				avatarStore.preloadAvatar(remoteUrl);
			}
			// refresh the auth-store user so the new avatar propagates app-wide
			await fetchUser(true);
			notifySuccess();
			await showInfoToast('Avatar Generated.', { duration: 'long' });
			// completion is now derived: the hasCustomAvatar watcher persists the step
		} else {
			notifyError();
			await showErrorToast(res.message, {
				fallback: 'Avatar Generation Failed.',
				duration: 'long'
			});
		}
	} finally {
		// belt-and-suspenders: clear the spinner even if the app is backgrounded mid-call
		generatingAvatar.value = false;
	}
}

const emit = defineEmits<{
	(event: 'open-persona'): void;
}>();

async function dismiss() {
	const ok = await onboarding.dismiss();
	if (ok) {
		notifySuccess();
		await Toast.show({ text: 'Checklist Dismissed.', duration: 'long' });
	} else {
		notifyError();
		await Toast.show({ text: 'Could Not Hide Checklist.', duration: 'long' });
	}
}
</script>
