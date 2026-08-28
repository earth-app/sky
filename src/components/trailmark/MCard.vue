<template>
	<MSurface class="gap-2">
		<div class="flex items-start gap-2">
			<UIcon
				name="mdi:map-marker-radius-outline"
				class="size-5 m-text-brand shrink-0 mt-0.5"
			/>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold m-0! truncate">{{ placeLabel }}</p>
				<p class="text-2xs opacity-60 m-0!">{{ relativeTime }}</p>
			</div>
			<div class="flex items-center gap-1 shrink-0">
				<UBadge
					v-if="mark.shared_activity"
					color="primary"
					variant="subtle"
					size="sm"
					icon="mdi:handshake-outline"
					>Also Yours</UBadge
				>
				<UBadge
					v-if="distanceLabel"
					color="neutral"
					variant="soft"
					size="sm"
					>{{ distanceLabel }} Away</UBadge
				>
			</div>
		</div>

		<p
			v-if="activityLabel"
			class="text-2xs opacity-70 m-0!"
		>
			Left while {{ activityLabel }}
		</p>

		<p class="text-sm whitespace-pre-line wrap-break-word opacity-90">{{ mark.note }}</p>

		<div class="flex items-center justify-between gap-2 pt-1">
			<span class="text-2xs opacity-60">by {{ mark.author_username }}</span>
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
	</MSurface>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';
import type { Trailmark } from 'types/trailmarks';

// activity_id / shared_activity ship in crust 0.6.x; sky vendors crust as a tarball, so widen the
// prop locally until the dep bump lands rather than block the surface on a republish
type ActivityAwareTrailmark = Trailmark & { activity_id?: string; shared_activity?: boolean };

const props = defineProps<{ mark: ActivityAwareTrailmark; distanceMeters?: number }>();

const { user } = useAuth();

const isMine = computed(() => user.value?.id === props.mark.author_uid);
const placeLabel = computed(() => props.mark.geo.place_label?.trim() || 'A Spot Nearby');
const relativeTime = computed(() => DateTime.fromISO(props.mark.created_at).toRelative() ?? '');
const distanceLabel = computed(() => formatDistanceLabel(props.distanceMeters));

// slug made readable; no fetch, the id is the label
const activityLabel = computed(() => props.mark.activity_id?.trim().replace(/_/g, ' ') || '');
const thanksLabel = computed(() => {
	const n = props.mark.thanks_for_author;
	return typeof n === 'number' ? `${n} Quiet Thanks` : 'Your Note';
});
</script>
