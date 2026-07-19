<template>
	<span class="relative inline-flex">
		<IonButton
			:color="isThanked ? 'success' : 'primary'"
			:fill="isThanked ? 'solid' : 'outline'"
			size="small"
			:disabled="isThanked || busy"
			@click="onThank"
		>
			<IonSpinner
				v-if="busy"
				name="crescent"
				class="size-4 mr-1"
			/>
			<UIcon
				v-else
				:name="isThanked ? 'mdi:hand-heart' : 'mdi:hand-heart-outline'"
				class="size-4 mr-1"
			/>
			{{ isThanked ? 'Thanked' : 'Thank This Note' }}
		</IonButton>
		<UiSparkleBurst
			:trigger="burst"
			:count="18"
			color="success"
		/>
	</span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ id: string; thanked?: boolean }>(), { thanked: false });
const emit = defineEmits<{ thanked: [] }>();

const { thank, hasThanked } = useTrailmarks();
const { notifySuccess } = useAppHaptics();

const isThanked = ref(props.thanked || hasThanked(props.id));
const busy = ref(false);
const burst = ref(0);

async function onThank() {
	if (isThanked.value || busy.value) return;
	busy.value = true;
	try {
		const res = await thank(props.id);
		if (res.success) {
			isThanked.value = true;
			burst.value++;
			void notifySuccess();
			emit('thanked');
			void showInfoToast(res.alreadyThanked ? 'You already thanked this note.' : 'Thanks sent.');
		} else {
			void showErrorToast(res.error ?? 'Could not send thanks.', {
				fallback: 'Could not send thanks.'
			});
		}
	} finally {
		busy.value = false;
	}
}

watch(
	() => props.thanked,
	(t) => {
		if (t) isThanked.value = true;
	}
);
</script>
