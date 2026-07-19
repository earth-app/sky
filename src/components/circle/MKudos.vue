<template>
	<Transition
		name="kudos-swap"
		mode="out-in"
	>
		<div
			v-if="sent"
			key="sent"
			class="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2"
		>
			<UIcon
				name="mdi:heart"
				class="size-5 text-success shrink-0"
			/>
			<div class="min-w-0">
				<p class="text-sm font-medium m-0!">{{ sentLabel }}</p>
				<p class="text-xs opacity-60 m-0!">{{ giverNote }}</p>
			</div>
		</div>
		<div
			v-else
			key="pick"
		>
			<p class="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">{{ heading }}</p>
			<div class="flex flex-wrap gap-2">
				<IonButton
					v-for="p in kudosPhrases"
					:key="p.phrase"
					size="small"
					fill="outline"
					color="primary"
					:disabled="pending !== null"
					@click="onSend(p.phrase)"
				>
					<IonSpinner
						v-if="pending === p.phrase"
						name="crescent"
						class="size-4 mr-1"
					/>
					<UIcon
						v-else
						:name="p.icon"
						class="size-4 mr-1"
					/>
					{{ p.label }}
				</IonButton>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import type { KudosContextType, KudosPhrase } from 'types/circles';

const props = withDefaults(
	defineProps<{
		toUid: string;
		contextType: KudosContextType;
		contextRef?: string;
		username?: string;
		heading?: string;
	}>(),
	{ contextRef: undefined, username: '', heading: 'Send Kudos' }
);

const { phrases: kudosPhrases, giverNote, send: sendKudos, hasSent: hasSentKudos } = useKudos();
const { notifySuccess } = useAppHaptics();

const pending = ref<KudosPhrase | null>(null);

const sent = computed(() =>
	hasSentKudos({ toUid: props.toUid, contextType: props.contextType, contextRef: props.contextRef })
);
const who = computed(() => props.username || 'Them');
const sentLabel = computed(() => `You Cheered ${who.value} On`);

async function onSend(phrase: KudosPhrase) {
	if (pending.value || sent.value) return;
	pending.value = phrase;
	try {
		const res = await sendKudos({
			toUid: props.toUid,
			contextType: props.contextType,
			contextRef: props.contextRef,
			phrase
		});
		if (res.success) {
			void notifySuccess();
			void showInfoToast(`${sentLabel.value}. ${giverNote}`);
		} else {
			void showErrorToast(res.error ?? 'Could not send kudos.', {
				fallback: 'Could not send kudos.'
			});
		}
	} finally {
		pending.value = null;
	}
}
</script>

<style scoped>
.kudos-swap-enter-active,
.kudos-swap-leave-active {
	transition:
		opacity 0.18s ease,
		transform 0.18s ease;
}
.kudos-swap-enter-from,
.kudos-swap-leave-to {
	opacity: 0;
	transform: translateY(4px);
}
@media (prefers-reduced-motion: reduce) {
	.kudos-swap-enter-active,
	.kudos-swap-leave-active {
		transition: none;
	}
}
</style>
