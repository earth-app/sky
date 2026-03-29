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
			<UAvatar
				:src="url"
				:alt="props.cosmeticKey"
				size="xl"
			/>
			<h3 class="font-semibold text-xs! m-0! text-center line-clamp-2 min-h-8">
				{{ cosmeticName }}
			</h3>
		</div>
		<div class="flex justify-center gap-2">
			<UBadge
				v-if="props.rarity"
				:color="rarityColor"
				variant="soft"
				size="sm"
			>
				{{ capitalizeFully(props.rarity) }}
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
import { capitalizeFully } from 'utils';

const props = withDefaults(
	defineProps<{
		cosmeticKey: AvatarCosmetic['key'];
		price?: number;
		rarity?: AvatarCosmetic['rarity'];
		state?: 'selected' | 'available' | 'locked';
	}>(),
	{
		price: 0,
		state: 'locked'
	}
);

const avatarStore = useAvatarStore();
const url = ref<string>('/earth-app.png');

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
	const preview = await avatarStore.previewCosmetic(cosmeticKey);
	url.value = preview || '/earth-app.png';
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

onUnmounted(() => {
	if (url.value && url.value.startsWith('blob:')) {
		URL.revokeObjectURL(url.value);
	}
});
</script>
