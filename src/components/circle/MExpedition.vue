<template>
	<div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-default p-4">
		<template v-if="expedition">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-base! font-semibold m-0! min-w-0 truncate">{{ expedition.title }}</h3>
				<div class="flex items-center gap-1">
					<UBadge
						:icon="goalMeta.icon"
						color="primary"
						variant="soft"
						size="sm"
						>{{ goalMeta.label }}</UBadge
					>
					<UBadge
						:color="timeLeft.expired ? 'error' : 'neutral'"
						variant="soft"
						size="sm"
						>{{ timeLabel }}</UBadge
					>
				</div>
			</div>

			<div class="grid sm:grid-cols-[auto_1fr] gap-4 items-center mt-4">
				<CircleMRing :expedition="expedition" />
				<div>
					<p class="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">
						The Circle's Contribution
					</p>
					<ul class="flex flex-col gap-3">
						<li
							v-for="c in contributors"
							:key="c.uid"
							class="flex flex-col gap-1"
						>
							<div class="flex items-center gap-2">
								<span
									class="size-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
									:style="{ backgroundColor: color(c.uid) }"
									>{{ initial(c.username) }}</span
								>
								<span class="text-sm min-w-0 truncate">
									{{ c.username }}
									<span
										v-if="c.uid === currentUid"
										class="opacity-50"
										>(You)</span
									>
								</span>
								<span class="text-xs opacity-70 ml-auto tabular-nums">
									{{ c.contribution }} {{ goalMeta.unit }}
								</span>
							</div>
							<div class="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
								<div
									class="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
									:style="{ width: `${barWidth(c.contribution)}%`, backgroundColor: color(c.uid) }"
								/>
							</div>
							<CircleMKudos
								v-if="c.uid !== currentUid && currentUid"
								:to-uid="c.uid"
								context-type="expedition"
								:context-ref="expedition.id"
								:username="c.username"
								heading="Cheer On"
							/>
						</li>
					</ul>
					<p class="text-[11px] opacity-50 mt-3">
						The circle versus the challenge, never each other.
					</p>
				</div>
			</div>
		</template>

		<template v-else-if="canStart">
			<div class="flex items-center gap-2">
				<UIcon
					name="mdi:tent"
					class="size-6 text-primary"
				/>
				<h3 class="text-base! font-semibold m-0!">Start an Expedition</h3>
			</div>
			<p class="text-xs opacity-70 mt-1">
				Set a shared outdoor goal your circle grows toward together.
			</p>

			<div class="flex flex-col gap-3 mt-4">
				<IonInput
					v-model="form.title"
					label="Title"
					label-placement="stacked"
					placeholder="Weekend in the Wild"
					:maxlength="80"
					fill="outline"
				/>
				<IonItem lines="none">
					<IonSelect
						v-model="form.goal"
						label="Goal"
						label-placement="stacked"
						interface="popover"
					>
						<IonSelectOption
							v-for="g in goalOptions"
							:key="g"
							:value="g"
							>{{ goalLabel(g) }}</IonSelectOption
						>
					</IonSelect>
				</IonItem>
				<div class="grid grid-cols-2 gap-3">
					<UFormField :label="`Target (${targetUnit})`">
						<UInputNumber
							v-model="form.target"
							:min="1"
							class="w-full"
						/>
					</UFormField>
					<UFormField label="Days">
						<UInputNumber
							v-model="form.days"
							:min="1"
							:max="90"
							class="w-full"
						/>
					</UFormField>
				</div>

				<div
					v-if="guidance.level !== 'ok'"
					class="flex items-start gap-2 text-xs"
					:class="guidance.color === 'warning' ? 'text-warning' : 'text-info'"
				>
					<UIcon
						:name="guidance.icon"
						class="size-4 mt-0.5 shrink-0"
					/>
					<span class="min-w-10 text-wrap">
						<span class="font-semibold">{{ guidance.title }}</span>
						<span class="opacity-80 ml-1"> {{ guidance.message }}</span>
					</span>
				</div>

				<IonButton
					color="primary"
					expand="block"
					:disabled="starting || (hasCircleMembers && !form.title.trim())"
					@click="onStart"
				>
					<IonSpinner
						v-if="starting"
						name="crescent"
						class="size-4 mr-2"
					/>
					<UIcon
						v-else
						:name="hasCircleMembers ? 'mdi:rocket-launch-outline' : 'mdi:account-plus-outline'"
						class="size-5 mr-2"
					/>
					{{ hasCircleMembers ? 'Start Expedition' : 'Invite Friends to Start' }}
				</IonButton>
			</div>
		</template>

		<div
			v-else
			class="flex flex-col items-center text-center py-8 opacity-70"
		>
			<UIcon
				name="mdi:tent"
				class="size-10 mb-2"
			/>
			<p class="text-sm">No Expedition Yet.</p>
		</div>

		<IonModal
			:is-open="showInviteModal"
			@did-dismiss="showInviteModal = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Invite Your Circle First</IonTitle>
					<IonButtons slot="end">
						<IonButton
							aria-label="Close"
							@click="showInviteModal = false"
						>
							<UIcon
								slot="icon-only"
								name="mdi:close"
								class="size-6"
							/>
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent class="ion-padding">
				<div class="flex flex-col gap-4">
					<p class="text-sm opacity-70">
						An expedition is a shared goal. Add a friend or two to your circle, then grow a garden
						together.
					</p>
					<UserMInviteFriend />
					<IonButton
						color="medium"
						fill="outline"
						expand="block"
						@click="openDiscover"
					>
						<UIcon
							name="mdi:compass-outline"
							class="size-5 mr-2"
						/>
						Find People to Follow
					</IonButton>
				</div>
			</IonContent>
		</IonModal>
	</div>
</template>

<script setup lang="ts">
import { useIonRouter } from '@ionic/vue';
import type { Expedition, ExpeditionContributor, ExpeditionGoal } from 'types/circles';

const props = withDefaults(
	defineProps<{
		expedition?: Expedition | null;
		currentUid?: string;
		canStart?: boolean;
		// circle member count (you + others); when omitted we size from the fetched circle
		// so the goal guidance scales to the group
		circleSize?: number;
	}>(),
	{ expedition: null, currentUid: '', canStart: true, circleSize: 0 }
);
const emit = defineEmits<{ started: [Expedition] }>();

const { startExpedition } = useCircles();
const { circle, fetchCircle } = useFriends();
const router = useIonRouter();

// a shared garden needs at least one other person; gate the start behind an invite prompt.
// honor the circleSize prop (you + others) as a hint before the circle fetch resolves
const showInviteModal = ref(false);
const hasCircleMembers = computed(() => circle.value.length > 0 || (props.circleSize ?? 0) > 1);

function openDiscover() {
	showInviteModal.value = false;
	router.push('/tabs/discover?tab=user');
}

// prefer an explicit prop; otherwise size from the fetched circle (self + members)
const effectiveCircleSize = computed(() =>
	props.circleSize && props.circleSize > 0 ? props.circleSize : Math.max(1, circle.value.length + 1)
);

// reuse inherited crust helpers for goal meta, ordering, time-left, and contributor color
const goalMeta = computed(
	() =>
		EXPEDITION_GOAL_META[props.expedition?.goal ?? 'nature_minutes'] ??
		EXPEDITION_GOAL_META.nature_minutes
);
const goalOptions = EXPEDITION_GOALS;
// script-local wrappers so the template never references the auto-imported map directly
const goalLabel = (g: ExpeditionGoal) => EXPEDITION_GOAL_META[g].label;
const targetUnit = computed(() => EXPEDITION_GOAL_META[form.goal].unit);

const contributors = computed<ExpeditionContributor[]>(() =>
	props.expedition ? orderedContributors(props.expedition) : []
);
const topContribution = computed(() =>
	Math.max(1, ...contributors.value.map((c) => c.contribution), 1)
);
function barWidth(contribution: number): number {
	return Math.round(Math.min(1, Math.max(0, contribution / topContribution.value)) * 100);
}
const color = (uid: string) => contributorColor(uid);
const initial = (name: string) => name?.trim()?.[0]?.toUpperCase() ?? '?';

const timeLeft = computed(() =>
	props.expedition ? expeditionTimeLeft(props.expedition) : { expired: false, days: 0, hours: 0 }
);
const timeLabel = computed(() => {
	if (props.expedition?.status === 'complete') return 'Complete';
	const t = timeLeft.value;
	if (t.expired) return 'Ended';
	if (t.days > 0) return `${t.days}d ${t.hours}h Left`;
	return `${t.hours}h Left`;
});

const form = reactive<{ title: string; goal: ExpeditionGoal; target: number; days: number }>({
	title: '',
	goal: 'nature_minutes',
	target: 600,
	days: 7
});
const starting = ref(false);

// fun, non-blocking nudge when the target is very high or very low for the circle
const guidance = computed(() =>
	expeditionGoalGuidance({
		goal: form.goal,
		target: form.target,
		circleSize: effectiveCircleSize.value,
		days: form.days
	})
);

// client-only; sizes the guidance to the real circle without blocking hydration
onMounted(() => {
	if (props.currentUid) void fetchCircle();
});

async function onStart() {
	if (starting.value) return;
	// an expedition is a shared goal - block it when the circle is empty and offer to invite
	if (!hasCircleMembers.value) {
		showInviteModal.value = true;
		return;
	}
	if (!form.title.trim()) return;
	starting.value = true;
	try {
		const res = await startExpedition({
			title: form.title.trim(),
			goal: form.goal,
			target: form.target,
			days: form.days
		});
		if (res.success && res.data) {
			void showInfoToast('Expedition started. The circle sets out together.');
			emit('started', res.data);
		} else {
			void showErrorToast(res.error ?? 'Could not start the expedition.', {
				fallback: 'Could not start the expedition.'
			});
		}
	} finally {
		starting.value = false;
	}
}
</script>
