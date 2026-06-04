<template>
	<UCard
		variant="soft"
		class="flex flex-col items-center justify-center gap-2 w-full h-full max-h-40"
		:class="
			state === 'available'
				? 'border-secondary border-2'
				: state === 'selected'
					? 'border-primary border-2'
					: ''
		"
	>
		<div class="flex flex-col items-center gap-1 w-full">
			<div class="relative inline-flex items-center justify-center">
				<IonSkeletonText
					v-if="previewLoading"
					animated
					class="size-16 rounded-full m-0!"
				/>
				<UAvatar
					v-else
					:src="url"
					:alt="props.cosmeticKey"
					size="xl"
					:class="props.animated && !prefersReducedMotion ? 'cosmetic-animated' : ''"
				/>
			</div>
			<h3 class="font-semibold text-xs! m-0! text-center line-clamp-2 min-h-8">
				{{ cosmeticName }}
			</h3>
		</div>
		<div class="flex justify-center gap-1 flex-wrap">
			<UBadge
				v-if="props.rarity"
				:color="rarityColor"
				variant="soft"
				size="sm"
			>
				{{ capitalizeFully(props.rarity) }}
			</UBadge>

			<UBadge
				v-if="props.animated"
				color="warning"
				variant="soft"
				icon="mdi:auto-fix"
				size="sm"
			>
				Animated
			</UBadge>

			<UBadge
				v-if="props.state === 'selected'"
				color="success"
				variant="soft"
				icon="mdi:check"
				size="sm"
			>
				Selected
			</UBadge>
			<UBadge
				v-else-if="props.state === 'locked'"
				color="warning"
				variant="subtle"
				icon="mdi:lock"
				size="sm"
			>
				{{ formattedPrice }}
			</UBadge>
			<UBadge
				v-else
				color="info"
				variant="soft"
				icon="mdi:star"
				size="sm"
			>
				Owned
			</UBadge>
		</div>
	</UCard>
</template>

<script setup lang="ts">
import { IonSkeletonText } from '@ionic/vue';
import { capitalizeFully } from 'utils';

const props = withDefaults(
	defineProps<{
		cosmeticKey: AvatarCosmetic['key'];
		price?: number;
		rarity?: AvatarCosmetic['rarity'];
		state?: 'selected' | 'available' | 'locked';
		animated?: boolean;
		withSelf?: boolean;
	}>(),
	{
		price: 0,
		state: 'locked',
		animated: false,
		withSelf: false
	}
);

const avatarStore = useAvatarStore();
const url = ref<string>('/earth-app.png');
const previewLoading = ref(false);
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

const numberFormatter = new Intl.NumberFormat();

const cosmeticName = computed(() => capitalizeFully(props.cosmeticKey.replaceAll('_', ' ')));
const formattedPrice = computed(() => numberFormatter.format(Number(props.price || 0)));

const rarityColor = computed(() => {
	switch (props.rarity) {
		case 'normal':
			return 'neutral';
		case 'rare':
			return 'info';
		case 'amazing':
			return 'warning';
		case 'green':
			return 'primary';
	}

	return 'neutral';
});

async function updatePreview(cosmeticKey: AvatarCosmetic['key']) {
	if (!cosmeticKey) return;

	// belt-and-suspenders: never let the skeleton hang if either call throws
	previewLoading.value = true;
	try {
		const tasks: Promise<string | undefined>[] = [avatarStore.previewCosmetic(cosmeticKey)];

		if (props.withSelf) {
			tasks.push(avatarStore.previewCosmeticWithSelf(cosmeticKey));
		}

		const results = await Promise.allSettled(tasks);

		const selfResult = props.withSelf
			? results[1]?.status === 'fulfilled'
				? results[1].value
				: undefined
			: undefined;
		const baseResult = results[0]?.status === 'fulfilled' ? results[0].value : undefined;

		url.value = selfResult || baseResult || '/earth-app.png';
	} catch (error) {
		console.warn(`Failed to preview cosmetic ${cosmeticKey}:`, error);
		url.value = '/earth-app.png';
	} finally {
		previewLoading.value = false;
	}
}

onMounted(() => {
	void updatePreview(props.cosmeticKey);
});

watch(
	() => props.cosmeticKey,
	(newKey) => {
		void updatePreview(newKey);
	}
);

watch(
	() => props.withSelf,
	() => {
		// re-resolve when the parent flips withSelf on after mount
		void updatePreview(props.cosmeticKey);
	}
);

onUnmounted(() => {
	if (url.value && url.value.startsWith('blob:')) {
		URL.revokeObjectURL(url.value);
	}
});
</script>

<style scoped>
.cosmetic-animated {
	animation: cosmetic-spin 8s linear infinite;
	transform-origin: center;
	will-change: transform;
}

@keyframes cosmetic-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.cosmetic-animated {
		animation: none;
	}
}
</style>
