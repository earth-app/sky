<template>
	<UserBadgeDisplay
		:badge="badge"
		:is-granted="isGranted"
		:is-mastered="isMastered"
		@clicked="showDetails = true"
	/>
	<IonModal
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
				<UIcon
					:name="badge.icon"
					class="self-center min-h-12 min-w-12 sm:size-16 md:size-20 lg:size-24"
					:class="isMastered ? 'text-purple-400' : isGranted ? 'text-yellow-400' : ''"
				/>
				<div class="flex items-center justify-center gap-2 flex-wrap">
					<h2 class="font-bold text-2xl m-0!">{{ badge.name }}</h2>
					<UBadge
						:color="rarityColor"
						:trailing-icon="isMastered ? 'mdi:star-circle' : isGranted ? 'mdi:check' : ''"
						class="text-lg"
						>{{ capitalizeFully(badge.rarity) }}</UBadge
					>
				</div>
				<p class="text-center text-base px-8">{{ badge.description }}</p>
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
					<IonProgressBar
						:value="badge.progress"
						class="w-full mt-1"
						:color="ionRarityColor"
						status
					/>
				</div>

				<div
					v-if="canShowMastery"
					class="flex flex-col items-center gap-2 w-full mt-2 px-6"
				>
					<div class="flex items-center gap-2">
						<IonButton
							id="badge-mastery-cta"
							size="small"
							:color="masteryButtonColor"
							:fill="masteryLocked || masteryCapReached ? 'outline' : 'solid'"
							:disabled="masteryDisabled"
							@click="handleMasteryClick"
						>
							<IonSpinner
								v-if="masteryLoading"
								name="crescent"
								class="mr-2 size-4"
							/>
							<UIcon
								v-else
								:name="masteryButtonIcon"
								class="mr-2 size-5"
							/>
							<span>{{ masteryButtonLabel }}</span>
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
					<span
						v-if="masteryStatusLoading"
						class="text-xs opacity-70 flex items-center gap-1"
					>
						<IonSpinner
							name="dots"
							class="size-3"
						/>
						Checking mastery status...
					</span>
					<span
						v-else-if="isCompletedMastery"
						class="text-xs opacity-70 text-center max-w-72"
					>
						<template v-if="masteredAtFormatted">Mastered on {{ masteredAtFormatted }}.</template>
						Open the timeline to revisit your completed steps.
					</span>
					<span
						v-else-if="masteryLocked"
						class="text-xs opacity-80 text-center max-w-72"
					>
						This badge mastery has been permanently locked and cannot be regenerated.
					</span>
					<span
						v-else-if="masteryQuestReady && masteryExpiresInDays !== null"
						class="text-xs opacity-70 text-center max-w-72"
					>
						Pick up where you left off — expires in
						{{ masteryExpiresInDays }} day{{ masteryExpiresInDays === 1 ? '' : 's' }}. Resetting
						will permanently lock this mastery.
					</span>
					<span
						v-else-if="masteryQuestReady"
						class="text-xs opacity-70 text-center max-w-72"
					>
						Pick up where you left off. Resetting will permanently lock this mastery.
					</span>
					<span
						v-else-if="masteryCapReached"
						class="text-xs text-error text-center max-w-72"
					>
						You have {{ masteryList?.active }} / {{ masteryList?.cap }} active mastery quests.
						Complete or let one expire before generating another.
					</span>
					<span
						v-else-if="!masteryStatusFetched"
						class="text-xs opacity-60 text-center max-w-72"
					>
						Generate a personalised AI quest to deepen your mastery of this badge.
					</span>
					<span
						v-if="
							masteryList &&
							!masteryCapReached &&
							!masteryQuestReady &&
							!masteryLocked &&
							!isCompletedMastery
						"
						class="text-xs opacity-60 text-center"
					>
						{{ masteryList.active }} / {{ masteryList.cap }} active mastery slots used
					</span>

					<!-- rotating reassurance while ai inference runs -->
					<div
						v-if="masteryLoading && !masteryQuestReady"
						class="flex flex-col items-center gap-1 mt-2 text-sm opacity-90"
					>
						<span>{{ generatingMessage }}</span>
						<span class="text-xs opacity-70">this may take up to two minutes</span>
					</div>
				</div>

				<div class="flex items-center">
					<span class="text-gray-400 light:text-gray-700">id:{{ badge.id }}</span>
					<span
						v-if="badge.tracker_id"
						class="text-gray-400 light:text-gray-700"
					>
						&nbsp;| tracker:{{ badge.tracker_id }}</span
					>
				</div>
			</div>
		</IonContent>

		<ClientOnly v-if="canShowMastery">
			<MSiteTour
				:steps="masteryTour"
				name="Badge Mastery Tour"
				tour-id="badge-mastery"
			/>
		</ClientOnly>
	</IonModal>
</template>
<script setup lang="ts">
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';
import { DateTime } from 'luxon';
import { BadgeMasteryGenerationError } from 'types/user';
import { capitalizeFully } from 'utils';

const props = defineProps<{
	badge: Badge | UserBadge;
}>();

const userStore = useUserStore();
const { user: authUser } = useAuth();
const { startTour } = useSiteTour();
const router = useIonRouter();

const showDetails = ref(false);
const masteryLoading = ref(false);
const masteryStatusLoading = ref(false);
const masteryStatusFetched = ref(false);
const masteryLocked = ref(false);
const masteryQuestReady = ref(false);

// rotates while masteryLoading — ai inference can run 20-60s and a silent spinner reads as a hang
const generatingMessages = [
	'Loading...',
	'Generating your quest...',
	'Picking the perfect steps...',
	'Consulting the badge archives...',
	'Tuning difficulty to your profile...',
	'Polishing the timeline...',
	'Almost there...'
];
const generatingMessage = ref(generatingMessages[0]);
let generatingInterval: ReturnType<typeof setInterval> | null = null;

// hardware back button is swallowed while generating — bailing mid-call burns the slot with no quest
let backHandle: PluginListenerHandle | null = null;

watch(masteryLoading, async (loading) => {
	if (loading) {
		let i = 0;
		generatingMessage.value = generatingMessages[0];
		generatingInterval = setInterval(() => {
			i = (i + 1) % generatingMessages.length;
			generatingMessage.value = generatingMessages[i];
		}, 2500);
		backHandle = await CapacitorApp.addListener('backButton', () => {
			// intentional no-op while generation is in flight
		});
	} else {
		if (generatingInterval) {
			clearInterval(generatingInterval);
			generatingInterval = null;
		}
		if (backHandle) {
			await backHandle.remove();
			backHandle = null;
		}
	}
});

onBeforeUnmount(() => {
	if (generatingInterval) clearInterval(generatingInterval);
	if (backHandle) backHandle.remove();
});

const rarityColor = computed(() => {
	switch (props.badge.rarity) {
		case 'normal':
			return 'neutral';
		case 'rare':
			return 'info';
		case 'amazing':
			return 'warning';
		case 'green':
			return 'success';
	}
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

const grantedAt = computed(() =>
	DateTime.fromISO(
		'granted_at' in props.badge && props.badge.granted_at ? props.badge.granted_at : ''
	).toLocaleString(DateTime.DATETIME_MED)
);

const masteredAtFormatted = computed(() => {
	if (!props.badge.mastered_at) return null;
	const dt = DateTime.fromISO(String(props.badge.mastered_at));
	return dt.isValid ? dt.toLocaleString(DateTime.DATETIME_MED) : null;
});

const isCurrentUser = computed(() => {
	if (!('user_id' in props.badge)) return false;
	return authUser.value?.id === props.badge.user_id;
});

const canShowMastery = computed(() => {
	if (!isCurrentUser.value) return false;
	if (!('granted' in props.badge) || !props.badge.granted) return false;
	if (props.badge.mastery_exempt) return false;
	if (userStore.lockedMasteries.has(props.badge.id)) return false;
	// mastered badges still surface the cta — tapping re-opens the completed timeline
	return true;
});

const isCompletedMastery = computed(() => !!props.badge.mastered);

function isUserBadge(badge: Badge): badge is UserBadge {
	return 'user_id' in badge;
}

const isGranted = computed(() => isUserBadge(props.badge) && props.badge.granted);
const isMastered = computed(() => isGranted && props.badge.mastered);

// per-user cap snapshot — blocks NEW generation only; once a quest is ready, "continue" is always allowed
const masteryList = computed(() => {
	const uid = authUser.value?.id;
	if (!uid) return null;
	return userStore.masteryLists.get(uid) ?? null;
});
const masteryCapReached = computed(() => {
	const list = masteryList.value;
	if (!list) return false;
	return list.active >= list.cap;
});
const masteryExpiresInDays = computed(() => {
	const item = masteryList.value?.items.find((i) => i.badge_id === props.badge.id);
	if (!item) return null;
	const days = DateTime.fromMillis(item.expires_at).diffNow('days').days;
	return days > 0 ? Math.ceil(days) : 0;
});

const masteryDisabled = computed(
	() =>
		masteryLoading.value ||
		masteryStatusLoading.value ||
		masteryLocked.value ||
		(masteryCapReached.value && !masteryQuestReady.value && !isCompletedMastery.value)
);

const masteryButtonLabel = computed(() => {
	if (masteryLoading.value) return masteryQuestReady.value ? 'Opening...' : 'Generating...';
	if (masteryLocked.value) return 'Mastery Locked';
	if (isCompletedMastery.value) return 'View Completed Mastery';
	if (masteryQuestReady.value) return 'Continue Mastery Quest';
	if (masteryCapReached.value) return 'Mastery cap reached';
	return 'Master This Badge';
});

const masteryButtonIcon = computed(() => {
	if (masteryLocked.value) return 'mdi:lock';
	if (isCompletedMastery.value) return 'mdi:star-circle';
	if (masteryQuestReady.value) return 'mdi:play-circle-outline';
	if (masteryCapReached.value) return 'mdi:alert-octagon-outline';
	return 'mdi:medal-outline';
});

const masteryButtonColor = computed(() => {
	if (masteryLocked.value) return 'medium';
	if (isCompletedMastery.value) return 'tertiary';
	if (masteryQuestReady.value) return 'warning';
	if (masteryCapReached.value) return 'medium';
	return 'primary';
});

watch(showDetails, async (open) => {
	if (!open) return;
	if (!canShowMastery.value) return;
	const uid = authUser.value?.id;

	// cap snapshot — cached after first open, so re-opens are instant
	if (uid && !userStore.masteryLists.has(uid)) userStore.fetchMasteryList(uid);

	// mastered badges short-circuit the status fetch
	if (isCompletedMastery.value) {
		masteryStatusFetched.value = true;
		return;
	}

	if (masteryStatusFetched.value) return;
	await loadMasteryStatus();
});

async function loadMasteryStatus() {
	const userId = authUser.value?.id;
	if (!userId) return;
	if (isCompletedMastery.value) {
		masteryStatusFetched.value = true;
		return;
	}
	masteryStatusLoading.value = true;
	try {
		if (userStore.lockedMasteries.has(props.badge.id)) {
			masteryLocked.value = true;
		}
		const status = await userStore.getMasteryStatus(userId, props.badge.id);
		masteryStatusFetched.value = true;
		if (!status) {
			masteryLocked.value = userStore.lockedMasteries.has(props.badge.id);
			return;
		}
		masteryLocked.value = status.locked;
		masteryQuestReady.value = status.generated && !status.mastered && !status.locked;
	} catch (e) {
		console.warn('Failed to load badge mastery status', e);
	} finally {
		masteryStatusLoading.value = false;
	}
}

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
	showDetails.value = false;
	await nextTick();
	router.push(`/tabs/quests/badge_mastery_${props.badge.id}`);
}

async function generateAndOpen() {
	const userId = authUser.value?.id;
	if (!userId) return;

	masteryLoading.value = true;
	try {
		await userStore.generateMastery(userId, props.badge.id);
		masteryQuestReady.value = true;
		showDetails.value = false;
		await nextTick();
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
					showDetails.value = false;
					await nextTick();
					router.push(`/tabs/quests/badge_mastery_${props.badge.id}`);
					break;
				case 'cap_reached':
					// don't mark badge as exempt — the slot is just temporarily full. store
					// already refreshed the list, so the disabled state will catch up on next open
					await showInfoToast(
						error.message ||
							'Mastery cap reached. Complete or let one expire before generating another.',
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

const masteryTour = computed<SiteTourStep[]>(() => [
	{
		id: 'badge-mastery-cta',
		title: 'Badge Mastery',
		description:
			"After earning a badge, you can deepen it with a personalised AI quest tailored to your profile and activities. It's an optional way to turn a badge into a long-form challenge — drawings, photos, audio, reflection.",
		footer: 'Mastery is opt-in. Plenty of users skip it; plenty love the structure.',
		icon: 'mdi:medal-outline',
		highlightPadding: 8
	},
	{
		id: 'badge-mastery-cta',
		title: 'One-shot Commitment',
		description:
			'Each Badge Mastery is a single attempt. Resetting it, or starting a different mastery before finishing, will permanently lock this one — you cannot regenerate it.\n\nThere is also a hard cap on active mastery quests at any given time.',
		footer: "You'll see a clear confirmation prompt before generation starts.",
		icon: 'mdi:alert-octagon-outline',
		dim: true,
		condition: () => !masteryLocked.value && !masteryDisabled.value,
		cta: {
			label: masteryQuestReady.value ? 'Continue Mastery' : 'Start Mastery',
			icon: 'mdi:medal-outline',
			color: 'warning',
			advance: false,
			closeOnSuccess: true,
			handler: () => handleMasteryClick()
		}
	},
	{
		id: 'badge-mastery-help',
		title: 'Need a refresher?',
		description:
			'Tap this help button any time to revisit this tour. Once you finish the mastery, a "Mastered" chip appears next to the badge — visible on your profile too.',
		footer: 'Good luck — and have fun with it!',
		icon: 'mdi:progress-question'
	}
]);
</script>
