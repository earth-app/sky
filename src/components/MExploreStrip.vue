<template>
	<div
		id="explore-strip"
		class="w-full max-w-2xl mx-auto px-4 mb-4"
	>
		<div class="grid grid-cols-3 gap-2">
			<button
				id="explore-trails"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-primary/5! active:bg-primary/15! transition-colors"
				aria-label="Trails"
				@click="go('/tabs/trails')"
			>
				<UIcon
					name="mdi:map-marker-path"
					class="size-6 text-primary"
				/>
				<span class="text-xs font-medium">Trails</span>
			</button>
			<button
				id="explore-garden"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-primary/5! active:bg-primary/15! transition-colors"
				aria-label="Your Garden"
				@click="go('/tabs/circle')"
			>
				<UIcon
					name="mdi:leaf-maple"
					class="size-6 text-primary"
				/>
				<span class="text-xs font-medium">Your Garden</span>
			</button>
			<button
				id="explore-trailmarks"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-primary/5! active:bg-primary/15! transition-colors"
				aria-label="Trailmarks"
				@click="go('/tabs/trailmarks')"
			>
				<UIcon
					name="mdi:map-marker-radius-outline"
					class="size-6 text-primary"
				/>
				<span class="text-xs font-medium">Trailmarks</span>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
const ionRouter = useIonRouter();
const { selection } = useAppHaptics();

function go(route: string) {
	void selection();
	ionRouter.navigate(route, 'forward', 'push');
}
</script>
