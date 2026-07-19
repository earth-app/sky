<template>
	<div
		class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-default p-4 flex flex-col gap-2"
	>
		<div class="flex items-start gap-2">
			<UIcon
				name="mdi:map-marker-radius-outline"
				class="size-5 text-primary shrink-0 mt-0.5"
			/>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold m-0! truncate">{{ placeLabel }}</p>
				<p class="text-[11px] opacity-60 m-0!">{{ relativeTime }}</p>
			</div>
			<UBadge
				v-if="distanceLabel"
				color="neutral"
				variant="soft"
				size="sm"
				>{{ distanceLabel }} Away</UBadge
			>
		</div>

		<p class="text-sm whitespace-pre-line wrap-break-word opacity-90">{{ mark.note }}</p>

		<div class="flex items-center justify-between gap-2 pt-1">
			<span class="text-[11px] opacity-60">by {{ mark.author_username }}</span>
			<div
				v-if="isMine"
				class="flex items-center gap-1 text-xs text-success"
			>
				<UIcon
					name="mdi:hand-heart"
					class="size-4"
				/>
				<span>{{ thanksLabel }}</span>
			</div>
			<TrailmarkMThankButton
				v-else
				:id="mark.id"
				:thanked="mark.thanked_by_me"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';
import type { Trailmark } from 'types/trailmarks';

const props = defineProps<{ mark: Trailmark; distanceMeters?: number }>();

const { user } = useAuth();

const isMine = computed(() => user.value?.id === props.mark.author_uid);
const placeLabel = computed(() => props.mark.geo.place_label?.trim() || 'A Spot Nearby');
const relativeTime = computed(() => DateTime.fromISO(props.mark.created_at).toRelative() ?? '');
const distanceLabel = computed(() => formatDistanceLabel(props.distanceMeters));
const thanksLabel = computed(() => {
	const n = props.mark.thanks_for_author;
	return typeof n === 'number' ? `${n} Quiet Thanks` : 'Your Note';
});
</script>
