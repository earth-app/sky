<template>
	<IonModal
		:is-open="isOpen"
		:can-dismiss="dismissible"
		@did-dismiss="isOpen = false"
	>
		<IonHeader>
			<IonToolbar>
				<IonTitle>
					<div class="flex items-center gap-2 ml-1 min-w-0">
						<UIcon
							:name="trail.icon || 'mdi:map-marker-path'"
							class="size-6 text-primary shrink-0"
						/>
						<span class="font-semibold text-base! truncate">{{ trail.title }}</span>
					</div>
				</IonTitle>
				<IonButtons slot="end">
					<IonButton
						color="danger"
						aria-label="Close trail"
						@click="isOpen = false"
					>
						<UIcon
							name="mdi:exit-to-app"
							class="min-h-6 min-w-6"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col items-center px-4 py-4 max-w-2xl mx-auto w-full">
				<div class="flex flex-wrap items-center justify-center gap-1 mb-1">
					<UBadge
						v-if="isPreview"
						color="neutral"
						variant="subtle"
						size="sm"
						icon="mdi:eye-outline"
						>Preview</UBadge
					>
					<UBadge
						color="primary"
						variant="soft"
						size="sm"
						>{{ themeLabel }}</UBadge
					>
					<UBadge
						v-if="trail.seasonal"
						color="warning"
						variant="soft"
						size="sm"
						icon="mdi:calendar-star"
						>Seasonal</UBadge
					>
				</div>
				<p class="text-xs text-center opacity-70 line-clamp-2 mb-3">{{ trail.description }}</p>
				<TrailMNatureRing
					v-if="natureMinutes"
					:minutes="natureMinutes.minutes"
					:target="natureMinutes.target"
					:best="natureMinutes.best"
					:size="56"
					compact
					class="mb-4"
				/>

				<!-- read-only walkthrough; no pledge, no writes -->
				<div
					v-if="isPreview"
					class="flex flex-col gap-4 w-full"
				>
					<div class="flex items-start gap-2 p-3 rounded-lg border border-primary/25 bg-primary/5">
						<UIcon
							name="mdi:eye-outline"
							class="size-5 text-primary shrink-0 mt-0.5"
						/>
						<p class="text-sm opacity-90 wrap-break-word">
							You're previewing this trail. Begin it to make your pledge and head out.
						</p>
					</div>

					<section class="flex flex-col gap-1">
						<span class="text-xs uppercase tracking-widest opacity-60">The Invitation</span>
						<p class="text-base opacity-90 whitespace-pre-line">{{ trail.curiosity }}</p>
					</section>

					<section class="flex items-center gap-3 text-sm opacity-80">
						<span class="flex items-center gap-1">
							<UIcon
								:name="practiceMeta.icon"
								class="size-4"
							/>
							{{ practiceMeta.label }}
						</span>
						<span class="flex items-center gap-1">
							<UIcon
								name="mdi:timer-sand"
								class="size-4"
							/>
							~{{ targetMinutes }} min
						</span>
					</section>

					<section class="flex flex-col gap-1">
						<span class="text-xs uppercase tracking-widest opacity-60">You'll Reflect On</span>
						<p class="text-sm opacity-80">{{ trail.reflectionPrompt }}</p>
					</section>

					<IonButton
						color="primary"
						expand="block"
						@click="onBegin"
					>
						<UIcon
							name="mdi:map-marker-path"
							class="size-5 mr-2"
						/>
						Begin This Trail
					</IonButton>
				</div>

				<div
					v-else
					class="w-full"
				>
					<TrailMClue
						v-if="phase === 'intro'"
						:curiosity="trail.curiosity"
						:practice="trail.practice"
						:target-minutes="targetMinutes"
						@continue="phase = 'pledge'"
					/>

					<TrailMPledge
						v-else-if="phase === 'pledge'"
						:trail-title="trail.title"
						@accept="onAccept"
					/>

					<TrailMPresence
						v-else-if="phase === 'presence'"
						:practice="trail.practice"
						:target-minutes="targetMinutes"
						@finish="onPresenceFinish"
					/>

					<TrailMReflect
						v-else-if="phase === 'reflect'"
						:reflection-prompt="trail.reflectionPrompt"
						:practice="trail.practice"
						:photo-count="photoCount"
						@save="onReflectSave"
					/>

					<TrailMReveal
						v-else-if="phase === 'reveal'"
						:reveal="trail.reveal"
						:minutes="loggedMinutes"
						:personal-best="personalBest"
						@finish="isOpen = false"
					/>

					<Loading v-else />
				</div>
			</div>
		</IonContent>

		<UiSparkleBurst
			:trigger="finaleBurst"
			:count="48"
			color="success"
		/>
	</IonModal>
</template>

<script setup lang="ts">
import { useTrailsStore } from 'stores/trails';
import type { Trail, TrailReflection } from 'types/trails';

const props = withDefaults(
	defineProps<{
		trail: Trail;
		open: boolean;
		// read-only walkthrough: no pledge gate, no completion writes
		preview?: boolean;
	}>(),
	{ preview: false }
);

const emit = defineEmits<{
	'update:open': [boolean];
	complete: [];
	// user chose to start the real run from the preview
	begin: [];
}>();

const isPreview = computed(() => props.preview);

const store = useTrailsStore();
// seed the store so the run is available without an extra fetch
store.upsertTrail(props.trail);

const { start, addPresence, complete } = useTrail(props.trail.id);
const { user } = useAuth();
const userId = computed(() => user.value?.id);
const { natureMinutes, fetchNatureMinutes } = useTrails();
const { notifySuccess, impactMedium } = useAppHaptics();

type Phase = 'intro' | 'pledge' | 'presence' | 'reflect' | 'reveal';
const phase = ref<Phase>('intro');
const loggedMinutes = ref(0);
const photoCount = ref(0);
const personalBest = ref(false);
const bestBefore = ref(0);
const finaleBurst = ref(0);

const isOpen = computed({
	get: () => props.open,
	set: (v) => emit('update:open', v)
});

// stay dismissible only when nothing is mid-practice, so a stray swipe can't drop the run
const dismissible = computed(
	() => isPreview.value || phase.value === 'intro' || phase.value === 'reveal'
);

const practiceMeta = computed(() => trailPracticeMeta(props.trail.practice));
const targetMinutes = computed(() => trailTargetMinutes(props.trail));

const THEME_LABEL: Record<string, string> = {
	nature: 'Nature',
	curiosity: 'Curiosity',
	creative: 'Creative',
	reflective: 'Reflective',
	mixed: 'Mixed'
};
const themeLabel = computed(() => THEME_LABEL[props.trail.theme] ?? 'Mixed');

async function onAccept(pledge: { when: string; where?: string }) {
	bestBefore.value = natureMinutes.value?.best ?? 0;
	const res = await start(pledge);
	if (!res.success) {
		void showErrorToast(res.error ?? 'Add a "when" so your pledge has a trigger.', {
			fallback: 'Pledge incomplete.'
		});
		return;
	}
	void impactMedium();
	void showInfoToast('Pledge set. Your trail is now a promise to yourself.');
	phase.value = 'presence';
}

function onPresenceFinish(payload: { minutes: number; photoCount: number }) {
	loggedMinutes.value = payload.minutes;
	photoCount.value = payload.photoCount;
	addPresence(payload.minutes);
	phase.value = 'reflect';
}

async function onReflectSave(reflection: TrailReflection) {
	const res = await complete(reflection, loggedMinutes.value);
	if (!res.success) {
		void showInfoToast('Saved your reflection. We could not sync Nature Minutes just now.');
	}
	// a new weekly high once this credit lands (personal-best, never a rank)
	personalBest.value =
		(natureMinutes.value?.minutes ?? 0) > bestBefore.value && bestBefore.value > 0;
	finaleBurst.value++;
	void notifySuccess();
	emit('complete');
	phase.value = 'reveal';
}

// convert a preview into the real run; the parent flips preview off so the flow begins
function onBegin() {
	emit('begin');
	phase.value = 'intro';
}

watch(
	() => props.open,
	(open) => {
		if (!open) {
			phase.value = 'intro';
			loggedMinutes.value = 0;
			photoCount.value = 0;
			personalBest.value = false;
			return;
		}
		store.upsertTrail(props.trail);
		if (userId.value) void fetchNatureMinutes();
	},
	{ immediate: true }
);
</script>
