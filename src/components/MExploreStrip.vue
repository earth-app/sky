<template>
	<div class="w-full max-w-2xl mx-auto px-4 mb-4">
		<div class="grid grid-cols-3 gap-2">
			<button
				v-for="tile in tiles"
				:key="tile.route"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-primary/5! active:bg-primary/15! transition-colors"
				:aria-label="tile.label"
				@click="go(tile.route)"
			>
				<UIcon
					:name="tile.icon"
					class="size-6 text-primary"
				/>
				<span class="text-xs font-medium">{{ tile.label }}</span>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
const ionRouter = useIonRouter();
const { selection } = useAppHaptics();

const tiles = [
	{ label: 'Trails', icon: 'mdi:map-marker-path', route: '/tabs/trails' },
	{ label: 'Your Circle', icon: 'mdi:account-group-outline', route: '/tabs/circle' },
	{ label: 'Trailmarks', icon: 'mdi:map-marker-radius-outline', route: '/tabs/trailmarks' }
];

function go(route: string) {
	void selection();
	ionRouter.navigate(route, 'forward', 'push');
}
</script>
