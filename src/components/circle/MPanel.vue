<template>
	<div class="max-w-3xl mx-auto px-4 pb-8 w-full">
		<div
			id="shared-garden"
			class="flex items-center gap-2 mb-4"
		>
			<UIcon
				name="mdi:flower-tulip-outline"
				class="size-7 text-primary"
			/>
			<div class="min-w-0">
				<h2 class="text-xl! font-bold m-0!">My Shared Garden</h2>
				<p class="text-xs opacity-70">
					A garden you grow together with your circle of friends. Share one outdoor goal and cheer
					each other on.
				</p>
			</div>
			<MTourButton
				v-if="currentUid"
				tour-id="shared-garden"
				class="ml-auto shrink-0"
			/>
		</div>

		<div
			v-if="!currentUid"
			class="flex flex-col items-center text-center rounded-xl border border-neutral-200 dark:border-neutral-800 py-10"
		>
			<UIcon
				name="mdi:login-variant"
				class="size-10 mb-2 opacity-70"
			/>
			<p class="text-sm opacity-70 mb-3">Sign in to join your circle.</p>
			<IonButton
				color="primary"
				@click="goToLogin"
				>Sign In</IonButton
			>
		</div>

		<template v-else>
			<section
				id="garden-canvas"
				class="mb-6"
			>
				<div class="flex items-center justify-between mb-2">
					<h3 class="text-sm! font-semibold m-0! opacity-80">Shared Garden</h3>
					<UTooltip
						v-if="gardenData"
						:text="gardenData.animated ? livingHelp : restingHelp"
						:ui="{ text: 'whitespace-normal max-w-xs' }"
					>
						<UBadge
							:icon="gardenData.animated ? 'mdi:sparkles' : 'mdi:sprout-outline'"
							:color="gardenData.animated ? 'success' : 'neutral'"
							variant="soft"
							size="sm"
							class="cursor-help"
							>{{ gardenData.animated ? 'Living Garden' : 'Resting Garden' }}</UBadge
						>
					</UTooltip>
				</div>
				<CircleMGarden
					v-if="gardenData"
					:garden="gardenData"
					:height="280"
				/>
				<div
					v-else-if="gardenLoaded"
					class="flex flex-col items-center text-center rounded-2xl bg-primary/5 py-10"
				>
					<UIcon
						name="mdi:sprout-outline"
						class="size-10 mb-2 text-success"
					/>
					<p class="text-sm opacity-70">Your garden grows as the circle spends time outside.</p>
				</div>
				<div
					v-else
					class="rounded-2xl bg-primary/5 flex items-center justify-center h-[280px]"
				>
					<IonSpinner name="crescent" />
				</div>
			</section>

			<section
				id="circle-members"
				class="mb-6"
			>
				<CircleMMembers />
			</section>

			<section id="circle-expedition">
				<CircleMExpedition
					:expedition="expedition"
					:current-uid="currentUid"
					:can-start="true"
					@started="onStarted"
				/>
			</section>
		</template>

		<ClientOnly>
			<MSiteTour
				:steps="sharedGardenTour"
				tour-id="shared-garden"
				name="Shared Garden Tour"
				:pulse="true"
			/>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import type { CircleGarden } from 'types/circles';

const { user, fetchUser } = useAuth();
const circles = useCircles();
const { expedition } = circles;
const { startTourIfNew } = useSiteTour();

const currentUid = computed(() => user.value?.id ?? '');
const gardenLoaded = ref(false);

// #region tour
// expedition-ring + circle-kudos only exist once an expedition is running, so gate those steps
const sharedGardenTour = computed<SiteTourStep[]>(() => [
	{
		id: 'shared-garden',
		title: 'Your Shared Garden',
		description:
			'A garden you tend together with your circle. It grows from the time you all spend outside, so every walk quietly adds to something bigger than any one person.',
		footer: 'Grown together, never a competition.',
		icon: 'mdi:flower-tulip-outline',
		waitFor: 'shared-garden'
	},
	{
		id: 'garden-canvas',
		title: 'Watch It Grow',
		description:
			'Trees, flowers, and little creatures appear as your circle logs Nature Minutes. A living garden means everyone has been getting outside; a resting one is a gentle nudge to take a walk.',
		footer: 'The garden is a reflection of real time spent outdoors.',
		icon: 'mdi:sprout-outline',
		waitFor: 'garden-canvas',
		placement: 'bottom'
	},
	{
		id: 'circle-members',
		title: 'Your Circle',
		description:
			'The friends growing this garden alongside you. Add a few people and the garden fills in faster, together.',
		footer: 'A garden needs at least one other person to share it.',
		icon: 'mdi:account-group-outline',
		waitFor: 'circle-members'
	},
	{
		id: 'circle-expedition',
		title: 'Set a Shared Goal',
		description:
			'An expedition is one outdoor goal your circle reaches for as a team - so many minutes outside, so many trails walked. You are all working with each other toward it, never against.',
		footer: 'The circle versus the challenge, never each other.',
		icon: 'mdi:tent',
		waitFor: 'circle-expedition',
		placement: 'top'
	},
	{
		id: 'expedition-ring',
		title: 'Track Your Progress',
		description:
			'This ring shows how far the circle has come toward the goal. Every contribution from anyone nudges it forward.',
		footer: 'Small efforts add up when a whole circle chips in.',
		icon: 'mdi:progress-check',
		waitFor: 'expedition-ring',
		condition: () => !!expedition.value
	},
	{
		id: 'circle-kudos',
		title: 'Cheer Each Other On',
		description:
			'Send a little encouragement to a teammate. Kindness here is quiet and pressure-free; you are celebrating the effort, not ranking it.',
		footer: 'A quiet cheer means more than a leaderboard.',
		icon: 'mdi:hand-heart-outline',
		waitFor: 'circle-kudos',
		condition: () => !!expedition.value
	}
]);
// #endregion

// tooltip copy explaining how the shared garden is cared for + what "Living" means
const livingHelp =
	'Living Garden: it animates because your circle keeps getting outside. It grows with your combined Nature Minutes - run trails, contribute to your expedition, and spend time outdoors together. A quiet garden is a gentle nudge to take a walk.';
const restingHelp =
	"Resting Garden: it grows with your circle's combined Nature Minutes - more time outside means more trees, flowers, and life. Animations (the Living variant) turn on for active, growing circles.";

const gardenData = computed<CircleGarden | null>(() => {
	const uid = currentUid.value;
	if (!uid) return null;
	return circles.garden(uid).value ?? null;
});

// one-shot so the tour never restarts when the user id watcher re-fires
let tourStarted = false;
function maybeStartTour() {
	if (tourStarted || !currentUid.value) return;
	tourStarted = true;
	startTourIfNew('shared-garden');
}

async function load() {
	if (!user.value) await fetchUser().catch(() => null);
	const uid = user.value?.id;
	if (!uid) return;
	await Promise.all([
		circles.fetchExpedition(),
		circles.fetchGarden(uid).finally(() => {
			gardenLoaded.value = true;
		})
	]);
	maybeStartTour();
}

function onStarted() {
	void circles.fetchExpedition(true);
}

function goToLogin() {
	void navigateTo('/login');
}

onMounted(() => void load());
watch(
	() => user.value?.id,
	(id) => {
		if (id) void load();
	}
);
</script>
