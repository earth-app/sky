<template>
	<div
		id="user-plan"
		class="flex flex-col gap-3 min-w-85 w-4/5 mt-6"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h3 class="text-base! font-bold m-0!">Make One Plan</h3>
				<p class="text-xs opacity-70 mt-1">
					Pick when it happens and what you'll do. One plan, kept in your head, not a list.
				</p>
			</div>
			<UIcon
				name="mdi:map-marker-path"
				class="size-6 shrink-0 opacity-70"
			/>
		</div>

		<MSkeleton
			v-if="loading && stage === 'idle'"
			:height="44"
			width="100%"
		/>

		<MSurface
			v-else-if="stage === 'active'"
			id="plan-active"
			class="gap-1"
		>
			<p class="text-sm font-semibold m-0!">One Plan Running</p>
			<p class="text-2xs opacity-70 m-0!">
				You know what it is. Nothing to check back on<template v-if="expiresLabel">
					- it rests {{ expiresLabel }}</template
				>.
			</p>
		</MSurface>

		<template v-else-if="stage === 'formed'">
			<MSurface
				id="plan-sentence"
				class="gap-1"
			>
				<p class="text-sm font-semibold m-0!">{{ sentence }}</p>
			</MSurface>
			<p class="text-2xs opacity-70 m-0!">
				Read it once more, then close this. It is not saved anywhere you can look it up.
			</p>
			<IonButton
				id="plan-rehearse"
				expand="block"
				size="small"
				:disabled="loading"
				@click="rehearse"
			>
				I've Got It
			</IonButton>
		</template>

		<template v-else-if="stage === 'menu' && menu">
			<p class="text-xs font-semibold m-0! mt-1">When</p>
			<IonRadioGroup
				class="w-full"
				:value="cueId"
				@ion-change="cueId = String($event.detail.value ?? '')"
			>
				<IonItem
					v-for="cue in menu.cues"
					:key="cue.id"
					class="p-0! my-1"
				>
					<IonRadio
						:value="cue.id"
						label-placement="end"
						justify="start"
					>
						<span class="text-xs wrap-break-word">{{ cue.text }}</span>
					</IonRadio>
				</IonItem>
			</IonRadioGroup>

			<p class="text-xs font-semibold m-0! mt-1">Then I Will</p>
			<IonRadioGroup
				class="w-full"
				:value="responseId"
				@ion-change="responseId = String($event.detail.value ?? '')"
			>
				<IonItem
					v-for="response in menu.responses"
					:key="response.id"
					class="p-0! my-1"
				>
					<IonRadio
						:value="response.id"
						label-placement="end"
						justify="start"
					>
						<span class="text-xs wrap-break-word">{{ response.text }}</span>
					</IonRadio>
				</IonItem>
			</IonRadioGroup>

			<IonButton
				id="plan-submit"
				expand="block"
				size="small"
				:disabled="loading || !cueId || !responseId"
				@click="submit"
			>
				That's My Plan
			</IonButton>
		</template>

		<p
			v-if="error"
			class="text-2xs opacity-70 m-0!"
		>
			{{ error }}
		</p>

		<IonButton
			v-if="stage === 'idle'"
			id="plan-start"
			expand="block"
			size="small"
			fill="outline"
			:disabled="loading"
			@click="start"
		>
			Make a Plan
		</IonButton>
	</div>
</template>

<script setup lang="ts">
import { makeClientAPIRequest } from 'utils';

type PlanCue = { id: string; kind: 'time_place' | 'juncture'; text: string; place?: string };
type PlanResponse = { id: string; text: string; activity_id?: string };
type PlanMenu = { goal: string; cues: PlanCue[]; responses: PlanResponse[] };

const props = defineProps<{ places?: string[] }>();

// called straight against mantle2: the crust composable that wraps this ships in 0.6.x and sky
// vendors crust as a tarball
const authStore = useAuthStore();

type Stage = 'idle' | 'menu' | 'formed' | 'active';

const stage = ref<Stage>('idle');
const menu = ref<PlanMenu | null>(null);
const sentence = ref('');
const cueId = ref('');
const responseId = ref('');
const expiresAt = ref<number | null>(null);
const loading = ref(false);
const error = ref('');

const expiresLabel = computed(() => {
	if (!expiresAt.value) return '';
	const days = Math.ceil((expiresAt.value - Date.now()) / (24 * 60 * 60 * 1000));
	if (days <= 0) return 'today';
	return days === 1 ? 'tomorrow' : `in ${days} days`;
});

async function start() {
	loading.value = true;
	error.value = '';
	try {
		const res = await makeClientAPIRequest<PlanMenu>(
			'/v2/users/current/plan/menu',
			authStore.sessionToken,
			{ method: 'POST', body: { places: props.places ?? [] } }
		);

		if (!res.success || !res.data?.cues?.length) {
			error.value = 'Add a few activities first, then come back.';
			return;
		}

		menu.value = res.data;
		// the app writes the wording; the user does the linking, which is what keeps it theirs
		cueId.value = res.data.cues[0]?.id ?? '';
		responseId.value = res.data.responses[0]?.id ?? '';
		stage.value = 'menu';
	} catch {
		error.value = 'Could not load a plan right now.';
	} finally {
		loading.value = false;
	}
}

async function submit() {
	if (!cueId.value || !responseId.value) return;

	loading.value = true;
	error.value = '';
	try {
		const res = await makeClientAPIRequest<{ sentence: string; expires_at: number }>(
			'/v2/users/current/plan',
			authStore.sessionToken,
			{ method: 'POST', body: { cue_id: cueId.value, response_id: responseId.value } }
		);

		if (!res.success || !res.data?.sentence) {
			error.value = 'That plan could not be saved. Try once more.';
			return;
		}

		sentence.value = res.data.sentence;
		expiresAt.value = res.data.expires_at;
		menu.value = null;
		stage.value = 'formed';
	} catch {
		error.value = 'That plan could not be saved. Try once more.';
	} finally {
		loading.value = false;
	}
}

async function rehearse() {
	loading.value = true;
	try {
		await makeClientAPIRequest('/v2/users/current/plan/rehearsed', authStore.sessionToken, {
			method: 'POST'
		});
	} catch {
		// best-effort telemetry; a failed mark must never keep the sentence on screen
	} finally {
		// the sentence is dropped either way: it was shown once and that is the whole design
		sentence.value = '';
		stage.value = 'active';
		loading.value = false;
	}
}

onMounted(async () => {
	loading.value = true;
	try {
		const res = await makeClientAPIRequest<{
			active: boolean;
			expires_at?: number | null;
		}>('/v2/users/current/plan/status', authStore.sessionToken);

		if (res.success && res.data?.active) {
			expiresAt.value = res.data.expires_at ?? null;
			stage.value = 'active';
		}
	} catch {
		stage.value = 'idle';
	} finally {
		loading.value = false;
	}
});
</script>
