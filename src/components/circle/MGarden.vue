<template>
	<div class="relative">
		<ClientOnly>
			<!-- reuse the engine-agnostic crust canvas; reduced-motion + parallax handled inside it -->
			<CircleGarden
				:garden="garden"
				:height="height"
				:caption="caption"
				:interactive="interactive"
			/>
			<template #fallback>
				<div
					class="rounded-2xl bg-primary/5 flex items-center justify-center"
					:style="{ height: typeof height === 'number' ? `${height}px` : height }"
				>
					<IonSpinner name="crescent" />
				</div>
			</template>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import type { CircleGarden } from 'types/circles';

withDefaults(
	defineProps<{
		garden: CircleGarden;
		height?: number | string;
		caption?: string;
		interactive?: boolean;
	}>(),
	{ height: 300, caption: 'Grown Together', interactive: true }
);
</script>
