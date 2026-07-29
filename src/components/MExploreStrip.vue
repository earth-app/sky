<template>
	<div
		id="explore-strip"
		class="w-full max-w-2xl mx-auto px-4 mb-4"
	>
		<div class="grid grid-cols-3 gap-2">
			<button
				id="explore"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-primary/5! active:bg-primary/15! transition-colors"
				aria-label="Explore"
				@click="go('/tabs/discover')"
			>
				<UIcon
					name="mdi:compass-outline"
					class="size-6 m-text-brand"
				/>
				<span class="text-xs font-medium">Explore</span>
			</button>
			<button
				id="explore-trails"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-primary/5! active:bg-primary/15! transition-colors"
				aria-label="Trails"
				@click="go('/tabs/trails')"
			>
				<UIcon
					name="mdi:map-marker-path"
					class="size-6 m-text-brand"
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
					class="size-6 m-text-brand"
				/>
				<span class="text-xs font-medium">Your Garden</span>
			</button>
			<button
				id="quests"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-primary/5! active:bg-primary/15! transition-colors"
				aria-label="Quests"
				@click="go('/tabs/quests')"
			>
				<UIcon
					name="mdi:map-search"
					class="size-6 m-text-brand"
				/>
				<span class="text-xs font-medium">Quests</span>
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
					class="size-6 m-text-brand"
				/>
				<span class="text-xs font-medium">Trailmarks</span>
			</button>
			<button
				id="downloads"
				type="button"
				class="flex flex-col items-center gap-1 py-3! rounded-xl! bg-error/5! active:bg-error/15! transition-colors"
				aria-label="Downloads"
				@click="go('/tabs/downloads')"
			>
				<UIcon
					name="mdi:download-outline"
					class="size-6 m-text-danger"
				/>
				<span class="text-xs font-medium">Downloads</span>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
const ionRouter = useIonRouter();
const { selection } = useAppHaptics();

const { user } = useAuth();

function go(route: string) {
	void selection();
	ionRouter.navigate(route, 'forward', 'push');
}
</script>
