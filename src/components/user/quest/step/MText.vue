<template>
	<UserQuestStepText
		:step="props.step"
		:disabled="props.disabled"
		:submit="props.submit"
		:server-request="props.serverRequest"
		:native-stt="sttTransport"
		@submitted="emit('submitted')"
		@capture="(t: string) => emit('capture', t)"
	/>
</template>

<script setup lang="ts">
const props = defineProps<{
	step: QuestStep & { index: number; altIndex?: number };
	disabled?: boolean;
	submit?: boolean;
	serverRequest?: typeof makeServerRequest;
}>();

const emit = defineEmits<{
	submitted: [];
	capture: [text: string];
}>();

// Constructed once per mount — the transport closes over a single listener pair
// so it must not be shared across components.
const sttTransport = useNativeSpeechToText();
</script>
