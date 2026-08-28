<template>
	<div
		v-if="memories.length > 0"
		id="user-memories"
		class="w-full px-4 pb-4"
	>
		<MSurface class="gap-3">
			<div class="flex items-center gap-2">
				<UIcon
					name="mdi:calendar-heart"
					class="size-5 shrink-0 m-text-brand"
					aria-hidden="true"
				/>
				<h3 class="m-0! truncate text-sm! font-semibold">On This Day</h3>
			</div>

			<img
				v-if="photo"
				id="memory-photo"
				:src="photo"
				alt="A photo you took on this day"
				class="max-h-52 w-full rounded-lg object-cover"
				loading="lazy"
				decoding="async"
			/>

			<div class="flex flex-col gap-2">
				<div
					v-for="memory in memories"
					:key="`${memory.kind}-${memory.id}-${memory.completedAt}`"
					class="flex items-start gap-2"
				>
					<UIcon
						:name="memory.icon || fallbackIcon(memory)"
						class="mt-0.5 size-4 shrink-0 opacity-70"
						aria-hidden="true"
					/>
					<div class="min-w-0">
						<p class="m-0! text-xs font-semibold wrap-break-word">{{ memory.title }}</p>
						<p class="m-0! text-2xs opacity-70">{{ yearsLabel(memory.yearsAgo) }}</p>
						<p
							v-if="memory.note"
							class="m-0! mt-0.5 text-2xs italic opacity-70 wrap-break-word"
						>
							{{ memory.note }}
						</p>
					</div>
				</div>
			</div>
		</MSurface>
	</div>
</template>

<script setup lang="ts">
import { makeClientAPIRequest } from 'utils';

type Memory = {
	kind: 'quest' | 'trail';
	id: string;
	title: string;
	icon?: string;
	completedAt: number;
	yearsAgo: number;
	photo?: boolean;
	note?: string;
	mood?: string;
};

// called straight against mantle2: the crust composable that wraps this ships in 0.6.x and sky
// vendors crust as a tarball
const authStore = useAuthStore();
const userStore = useUserStore();
const { user } = useAuth();

const memories = ref<Memory[]>([]);
const photo = ref('');

function yearsLabel(years: number): string {
	return years === 1 ? '1 Year Ago Today' : `${years} Years Ago Today`;
}

function fallbackIcon(memory: Memory): string {
	return memory.kind === 'trail' ? 'mdi:map-marker-path' : 'mdi:sword-cross';
}

// the photo is whatever the existing quest history endpoint already serves; nothing new stores it
async function loadPhoto() {
	const uid = user.value?.id;
	const kept = memories.value.find((memory) => memory.kind === 'quest' && memory.photo);
	if (!uid || !kept) return;

	// one thumbnail is all this tile shows; the full entry inlines every image step as base64
	const entry = await userStore.fetchQuestHistoryEntry(uid, kept.id, { firstImageOnly: true });
	const flat = (entry?.progress ?? []).flat();
	photo.value =
		flat.find((step: { data?: string }) => step?.data?.startsWith('data:image'))?.data ?? '';
}

async function load() {
	try {
		const res = await makeClientAPIRequest<{ memories: Memory[] }>(
			'/v2/users/current/memories',
			authStore.sessionToken
		);
		if (!res.success || !res.data?.memories?.length) return;

		memories.value = res.data.memories;
		await loadPhoto();
	} catch {
		// a surface you find: if it cannot load, it is simply not there
	}
}

onMounted(async () => {
	if (!user.value?.id) return;
	await load();
});

watch(
	() => user.value?.id,
	async (id) => {
		if (!id || memories.value.length > 0) return;
		await load();
	}
);
</script>
