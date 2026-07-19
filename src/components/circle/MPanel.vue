<template>
	<div class="max-w-3xl mx-auto px-4 pb-8 w-full">
		<div class="flex items-center gap-2 mb-4">
			<UIcon
				name="mdi:flower-tulip-outline"
				class="size-7 text-primary"
			/>
			<div>
				<h2 class="text-xl! font-bold m-0!">My Shared Garden</h2>
				<p class="text-xs opacity-70">
					A garden you grow together with your circle of friends. Share one outdoor goal and cheer
					each other on.
				</p>
			</div>
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
			<section class="mb-6">
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

			<section class="mb-6">
				<CircleMMembers />
			</section>

			<section>
				<CircleMExpedition
					:expedition="expedition"
					:current-uid="currentUid"
					:can-start="true"
					@started="onStarted"
				/>
			</section>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { CircleGarden } from 'types/circles';

const { user, fetchUser } = useAuth();
const circles = useCircles();
const { expedition } = circles;

const currentUid = computed(() => user.value?.id ?? '');
const gardenLoaded = ref(false);

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
