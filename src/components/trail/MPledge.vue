<template>
	<div class="rounded-xl border border-primary/30 bg-primary/5 p-4 mx-auto max-w-xl">
		<div class="flex items-center gap-2">
			<UIcon
				name="mdi:hand-heart-outline"
				class="size-6 text-primary"
			/>
			<h3 class="text-base! font-semibold m-0!">Make Your Pledge</h3>
		</div>
		<p class="text-xs opacity-70 mt-1">
			A plan for when you'll set out makes it far more likely you actually will.
		</p>

		<IonItem
			class="mt-4"
			lines="none"
		>
			<IonInput
				v-model="whenText"
				label="When"
				label-placement="stacked"
				placeholder="I finish my morning coffee"
				:maxlength="120"
			/>
		</IonItem>
		<IonItem lines="none">
			<IonInput
				v-model="whereText"
				label="Where (Optional)"
				label-placement="stacked"
				placeholder="the park by my house"
				:maxlength="120"
			/>
		</IonItem>

		<p
			v-if="whenText.trim()"
			class="text-sm italic opacity-80 mt-3 px-1"
		>
			When {{ whenText.trim() }}{{ whereText.trim() ? ` at ${whereText.trim()}` : '' }}, I'll set
			out on {{ trailTitle }}.
		</p>

		<IonButton
			class="mt-4"
			color="primary"
			expand="block"
			:disabled="!whenText.trim()"
			@click="submit"
		>
			<UIcon
				name="mdi:map-marker-path"
				class="size-5 mr-2"
			/>
			Accept & Begin
		</IonButton>
	</div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ trailTitle?: string }>(), { trailTitle: 'this trail' });
const emit = defineEmits<{ accept: [pledge: { when: string; where?: string }] }>();

const whenText = ref('');
const whereText = ref('');

function submit() {
	const when = whenText.value.trim();
	if (!when) return;
	const where = whereText.value.trim();
	emit('accept', { when, ...(where ? { where } : {}) });
}
</script>
