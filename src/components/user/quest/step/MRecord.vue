<template>
	<div
		class="relative flex flex-col items-center w-full! min-h-80! rounded-2xl! overflow-hidden! bg-neutral-950 border-4! border-neutral-900/50!"
	>
		<div
			v-if="stage === 'permission'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5! p-8! text-center!"
		>
			<div
				class="w-20 h-20 rounded-full border-2 border-primary flex items-center justify-center animate-mic-pulse"
			>
				<UIcon
					name="i-lucide-mic"
					class="text-3xl text-primary"
				/>
			</div>
			<p class="text-xs! font-semibold! tracking-[0.12em] uppercase text-neutral-100!">
				Record Audio
			</p>
			<p class="text-2xs! text-neutral-500! leading-[1.65]!">
				Direct microphone only.<br />No file uploads permitted.
			</p>
			<UserQuestStepMChromeButton
				class="mt-2!"
				aria-label="Continue to the Microphone"
				@click="requestPermission"
			>
				Continue
			</UserQuestStepMChromeButton>
		</div>

		<div
			v-else-if="stage === 'error'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5! p-8! text-center!"
		>
			<UIcon
				name="i-lucide-mic-off"
				class="size-14 text-red-400"
			/>
			<p class="text-sm! font-medium! text-red-400!">Microphone Unavailable</p>
			<p class="text-xs! text-neutral-500! leading-relaxed!">{{ errorMsg }}</p>
			<UserQuestStepMChromeButton
				variant="outline"
				class="mt-2!"
				aria-label="Try the Microphone Again"
				@click="requestPermission"
			>
				Try Again
			</UserQuestStepMChromeButton>
		</div>

		<div
			v-else-if="stage === 'ready' || stage === 'recording'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
		>
			<div class="flex items-end gap-1 h-14">
				<span
					v-for="i in BAR_COUNT"
					:key="i"
					class="w-1 rounded-full bg-primary transition-all duration-75"
					:style="{
						height: stage === 'recording' ? `${bars[i - 1] || MIN_BAR_PX}px` : '5px',
						opacity: stage === 'recording' ? 1 : 0.25
					}"
				/>
			</div>

			<span
				v-if="stage === 'recording'"
				class="text-3xl! font-mono! text-white! tabular-nums!"
				>{{ formatTime(elapsed) }}</span
			>
			<span
				v-else
				class="text-sm! text-neutral-500!"
				>Tap to Start</span
			>

			<span
				v-if="stage === 'recording' && !canStop"
				class="-mt-4! text-2xs! text-neutral-500! tabular-nums!"
				>Keep Recording - {{ stopCountdown }}s left</span
			>

			<button
				v-if="stage === 'recording'"
				class="size-16! rounded-full! border-4! flex items-center justify-center! transition-all!"
				:class="
					canStop
						? 'border-red-500! active:scale-90 cursor-pointer'
						: 'border-red-500/30 opacity-40 cursor-not-allowed'
				"
				:disabled="!canStop"
				aria-label="Stop Recording"
				@click="stopRecording"
			>
				<span class="w-5 h-5 bg-red-500 rounded-sm" />
			</button>
			<button
				v-else
				class="size-16! rounded-full! border-4! flex items-center justify-center! transition-all!"
				:class="
					props.disabled
						? 'border-primary/30 opacity-40 cursor-not-allowed'
						: 'border-primary active:scale-90 cursor-pointer'
				"
				:disabled="props.disabled"
				aria-label="Start Recording"
				@click="startRecording"
			>
				<span class="w-5 h-5 bg-primary rounded-full" />
			</button>
		</div>

		<div
			v-else-if="stage === 'preview'"
			class="absolute inset-0 flex flex-col items-center justify-center gap-5! p-8!"
		>
			<UIcon
				name="i-lucide-audio-waveform"
				class="size-12 text-primary"
			/>
			<span class="text-sm! text-neutral-300!">{{ formatTime(elapsed) }} recorded</span>
			<audio
				:src="previewUrl"
				controls
				class="w-full! rounded-lg!"
			/>
			<div class="flex gap-4! mt-1!">
				<button
					class="px-5! py-2! rounded-xl! border border-red-500/50 text-red-400 text-sm! active:scale-95 transition-transform!"
					@click="retake"
				>
					Retake
				</button>
				<button
					class="px-5! py-2! rounded-xl! font-semibold! text-sm! transition-all!"
					:class="
						props.disabled
							? 'bg-success/30 text-neutral-600 cursor-not-allowed'
							: 'bg-success text-neutral-900 active:scale-95 cursor-pointer'
					"
					:disabled="props.disabled"
					@click="confirm"
				>
					Confirm
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ disabled?: boolean; minLength?: number }>(), {
	minLength: 10
});
const emit = defineEmits<{ capture: [file: File] }>();

const BAR_COUNT = AUDIO_RECORDER.BAR_COUNT;
const MIN_BAR_PX = AUDIO_RECORDER.MIN_BAR_PX;

const {
	stage,
	errorMsg,
	elapsed,
	bars,
	previewUrl,
	canStop,
	stopCountdown,
	init,
	dispose,
	requestPermission,
	startRecording,
	stopRecording,
	retake,
	confirm,
	formatTime
} = useAudioRecorder({
	minLength: () => props.minLength,
	disabled: () => props.disabled === true,
	onCapture: (file) => emit('capture', file)
});

onMounted(init);
onBeforeUnmount(dispose);
</script>

<style scoped>
@keyframes mic-pulse {
	0%,
	100% {
		box-shadow: 0 0 0 0 rgb(var(--color-primary) / 0.3);
	}
	50% {
		box-shadow: 0 0 0 14px rgb(var(--color-primary) / 0);
	}
}
.animate-mic-pulse {
	animation: mic-pulse 2s ease-in-out infinite;
}
</style>
