<template>
	<UserBadgeDisplay
		v-bind="$attrs"
		:badge="badge"
		:is-granted="isGranted"
		:is-mastered="isMastered"
		:size="size"
		@clicked="noModal || (showDetails = true)"
	/>
	<IonModal
		v-if="!noModal"
		:is-open="showDetails"
		:backdrop-dismiss="!masteryLoading"
		:can-dismiss="!masteryLoading"
		@did-dismiss="showDetails = false"
	>
		<IonHeader>
			<IonToolbar class="pl-4">
				<IonTitle>Badge Details</IonTitle>
				<IonButtons slot="end">
					<IonButton
						:disabled="masteryLoading"
						@click="showDetails = false"
						>Close</IonButton
					>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent>
			<div class="flex flex-col items-center gap-4 mt-12">
				<Transition
					appear
					enter-active-class="badge-header-enter"
				>
					<div
						v-if="showDetails"
						class="flex flex-col items-center"
					>
						<UserBadgeDetailsHeader v-bind="badgeHeaderProps" />
					</div>
				</Transition>
				<span
					v-if="'granted' in badge && badge.granted"
					class="text-sm text-center opacity-90 mt-2 mx-10"
				>
					You earned this badge on
					{{ grantedAt }}.
				</span>
				<span
					v-if="badge.mastered && masteredAtFormatted"
					class="text-sm text-center opacity-90 mx-10"
				>
					Mastered on {{ masteredAtFormatted }}.
				</span>
				<div
					v-else-if="'progress' in badge"
					class="flex flex-col w-full px-8"
				>
					<span class="text-sm! font-semibold opacity-90 self-center"
						>{{ Math.round(badge.progress * 100) }}%</span
					>
					<div :class="['progress-flow-wrap', isProgressActive ? 'progress-flow-active' : '']">
						<IonProgressBar
							:value="badge.progress"
							class="w-full mt-1"
							:color="ionRarityColor"
							status
						/>
					</div>
				</div>

				<div
					v-if="canShowMastery"
					class="flex flex-col items-center gap-2 w-full mt-2 px-6"
				>
					<div class="flex items-center gap-2">
						<IonButton
							id="badge-mastery-cta"
							size="small"
							:color="masteryButton.color"
							:fill="masteryButton.outlined ? 'outline' : 'solid'"
							:disabled="masteryButton.disabled"
							@click="handleMasteryClick"
						>
							<IonSpinner
								v-if="masteryButton.loading"
								name="crescent"
								class="mr-2 size-4"
							/>
							<UIcon
								v-else
								:name="masteryButton.icon"
								class="mr-2 size-5"
							/>
							<span>{{ masteryButton.label }}</span>
						</IonButton>
						<IonButton
							id="badge-mastery-help"
							fill="outline"
							color="secondary"
							size="small"
							@click="startTour('badge-mastery')"
						>
							<UIcon
								name="mdi:progress-question"
								class="min-h-5 min-w-5"
							/>
						</IonButton>
					</div>
					<UserBadgeMasteryStatusText v-bind="masteryStatusProps" />

					<!-- rotating reassurance while ai inference runs -->
					<div
						v-if="masteryLoading && !masteryQuestReady"
						class="flex flex-col items-center gap-1 mt-2 text-sm opacity-90"
					>
						<span>{{ generatingMessage }}</span>
						<span class="text-xs opacity-70">this may take up to two minutes</span>
					</div>
				</div>

				<UserBadgeIdFooter :badge="badge" />
			</div>
		</IonContent>

		<ClientOnly v-if="showDetails && canShowMastery">
			<MSiteTour
				:steps="masteryTour"
				name="Badge Mastery Tour"
				tour-id="badge-mastery"
			/>
		</ClientOnly>
	</IonModal>
</template>
<script setup lang="ts">
defineOptions({
	inheritAttrs: false
});

import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { BadgeMasteryGenerationError } from 'types/user';
import { BADGES_DRAWER_CLOSE } from '~/utils/injection';

const props = withDefaults(
	defineProps<{
		badge: Badge | UserBadge;
		size?: 'small' | 'medium' | 'full';
		noModal?: boolean;
	}>(),
	{
		noModal: false,
		size: 'full'
	}
);

const userStore = useUserStore();
const { user: authUser } = useAuth();
const { startTour } = useSiteTour();
const router = useIonRouter();

const showDetails = ref(false);

// provided by MProfile's badges drawer; absent when MCard renders outside that drawer
const closeBadgesDrawer = inject(BADGES_DRAWER_CLOSE, () => Promise.resolve());

// await the drawer's dismiss before letting the caller router.push; otherwise the
// route change preempts the IonModal animation and the teleported drawer can orphan
// onto the destination page (which reads as "the close fix doesn't work")
async function dismissForNavigation() {
	showDetails.value = false;
	await closeBadgesDrawer();
}

const SKY_MASTERY_BUTTON_THEME = {
	labels: {
		loading: (ctx: MasteryLabelContext) => (ctx.questReady ? 'Opening...' : 'Generating...'),
		locked: 'Mastery Locked',
		completed: 'View Completed Mastery',
		ready: 'Continue Mastery Quest',
		cap_reached: 'Mastery cap reached',
		default: 'Master This Badge'
	},
	colors: {
		loading: 'primary',
		locked: 'medium',
		completed: 'tertiary',
		ready: 'warning',
		cap_reached: 'medium',
		default: 'primary'
	}
} as const satisfies MasteryButtonTheme;

const {
	masteryLoading,
	masteryStatusFetched,
	masteryLocked,
	masteryQuestReady,
	canShowMastery,
	generatingMessage,
	isGranted,
	isMastered,
	isCompletedMastery,
	grantedAt,
	masteredAtFormatted,
	masteryDisabled,
	masteryButton,
	badgeHeaderProps,
	masteryStatusProps,
	loadMasteryStatus,
	ensureMasteryListFetched
} = useBadgeMastery(() => props.badge, SKY_MASTERY_BUTTON_THEME);

// gradient flow only animates while progress is in motion; at 100% the bar stays solid
const isProgressActive = computed(() => {
	if (!('progress' in props.badge)) return false;
	if ('granted' in props.badge && props.badge.granted) return false;
	const p = (props.badge.progress ?? 0) * 100;
	return p > 0 && p < 100;
});

const ionRarityColor = computed(() => {
	switch (props.badge.rarity) {
		case 'normal':
			return 'medium';
		case 'rare':
			return 'secondary';
		case 'amazing':
			return 'warning';
		case 'green':
			return 'primary';
	}
});

// hardware back button is swallowed while generating; bailing mid-call burns the slot with no quest
let backHandle: PluginListenerHandle | null = null;
watch(masteryLoading, async (loading) => {
	if (loading) {
		backHandle = await CapacitorApp.addListener('backButton', () => {
			// intentional no-op while generation is in flight
		});
	} else if (backHandle) {
		await backHandle.remove();
		backHandle = null;
	}
});
onBeforeUnmount(() => {
	if (backHandle) backHandle.remove();
});

watch(showDetails, async (open) => {
	if (!open) return;
	if (!canShowMastery.value) return;

	ensureMasteryListFetched();

	// mastered badges short-circuit the status fetch
	if (isCompletedMastery.value) {
		masteryStatusFetched.value = true;
		return;
	}

	if (masteryStatusFetched.value) return;
	await loadMasteryStatus();
});

async function handleMasteryClick() {
	if (masteryDisabled.value) return;

	if (isCompletedMastery.value || masteryQuestReady.value) {
		await openExistingMasteryQuest();
		return;
	}

	const confirmed = await Dialog.confirm({
		title: 'Start Badge Mastery?',
		message:
			"Once you start this Badge Mastery quest, abandoning it or starting a different quest will permanently lock this badge's mastery. You will not be able to retry. Are you sure?",
		okButtonTitle: 'Start',
		cancelButtonTitle: 'Cancel'
	});

	if (!confirmed.value) return;

	await generateAndOpen();
}

async function openExistingMasteryQuest() {
	await dismissForNavigation();
	router.push(`/tabs/quests/badge_mastery_${props.badge.id}`);
}

async function generateAndOpen() {
	const userId = authUser.value?.id;
	if (!userId) return;

	masteryLoading.value = true;
	try {
		await userStore.generateMastery(userId, props.badge.id);
		masteryQuestReady.value = true;
		await dismissForNavigation();
		await showInfoToast('Your Badge Mastery quest is ready. Complete it without abandoning it!', {
			duration: 'long'
		});

		router.push(`/tabs/quests/badge_mastery_${props.badge.id}`);
	} catch (error) {
		if (error instanceof BadgeMasteryGenerationError) {
			switch (error.code) {
				case 'exempt':
					await showInfoToast('This badge does not support mastery quests.', {
						duration: 'short'
					});
					break;
				case 'locked':
					masteryLocked.value = true;
					userStore.lockedMasteries.add(props.badge.id);
					await showErrorToast(new Error("This badge's mastery is permanently locked."), {
						duration: 'long'
					});
					break;
				case 'conflict':
					masteryQuestReady.value = true;
					await showInfoToast('Mastery already exists for this badge; opening it instead...', {
						duration: 'short'
					});
					await dismissForNavigation();
					router.push(`/tabs/quests/badge_mastery_${props.badge.id}`);
					break;
				case 'cap_reached':
					// don't mark badge as exempt: the slot is just temporarily full. store
					// already refreshed the list, so the disabled state will catch up on next open
					await showInfoToast(
						extractServerMessage(
							error,
							'Mastery cap reached. Complete or let one expire before generating another.'
						),
						{ duration: 'long' }
					);
					break;
				case 'ai_failed':
					await showErrorToast(new Error('Generation failed. Please try again.'), {
						duration: 'short'
					});
					break;
				default:
					await showErrorToast(error, { duration: 'long' });
			}
		} else {
			await showErrorToast(error, { duration: 'long' });
		}
	} finally {
		masteryLoading.value = false;
	}
}

const masteryTour = buildBadgeMasteryTour({
	masteryQuestReady,
	isInteractive: () => !masteryLocked.value && !masteryDisabled.value,
	onMasteryCtaClick: () => handleMasteryClick()
});
</script>

<style scoped>
/* easeOutBack float-in for the badge header, parity with crust modal */
@keyframes badge-header-enter {
	0% {
		opacity: 0.4;
		transform: translateY(18px) scale(0.85);
	}
	60% {
		opacity: 1;
		transform: translateY(-2px) scale(1.03);
	}
	100% {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}
.badge-header-enter {
	animation: badge-header-enter 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* moving sheen on the in-progress badge bar, stops at 100% via class gate */
.progress-flow-wrap {
	position: relative;
	border-radius: 9999px;
	overflow: hidden;
}
.progress-flow-active::after {
	content: '';
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: linear-gradient(
		90deg,
		rgba(255, 255, 255, 0) 0%,
		rgba(255, 255, 255, 0.18) 50%,
		rgba(255, 255, 255, 0) 100%
	);
	background-size: 200% 100%;
	animation: badge-progress-flow 2.5s linear infinite;
	mix-blend-mode: overlay;
}
@keyframes badge-progress-flow {
	0% {
		background-position: 200% 0;
	}
	100% {
		background-position: -200% 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.badge-header-enter,
	.progress-flow-active::after {
		animation: none !important;
	}
}
</style>
