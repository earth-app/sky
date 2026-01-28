<template>
	<MInfoCard
		v-bind="$attrs"
		:title="event.name"
		:content="full ? event.description : trimString(event.description, 350)"
		:link="noLink ? undefined : `/tabs/events/${event.id}`"
		:avatar="{
			src: authorAvatar,
			size: 'lg',
			chip: authorAvatarChipColor
				? {
						color: authorAvatarChipColor,
						size: 'lg'
					}
				: undefined
		}"
		:badges="badges"
		:image="full ? undefined : thumbnail || undefined"
		:buttons="buttons"
		:avatar-group="{
			avatars: attendeeAvatars,
			max: 5
		}"
		:footer="footer"
	/>
</template>

<script setup lang="ts">
defineOptions({
	inheritAttrs: false
});
import { Toast } from '@capacitor/toast';
import type { Event } from '@earth-app/crust/src/shared/types/event';
import { capitalizeFully, trimString } from '@earth-app/crust/src/shared/util';
import { DateTime } from 'luxon';

const props = defineProps<{
	event: Event;
	noLink?: boolean;
	full?: boolean;
}>();

const { user } = useAuth();
const { attendees, signUpForEvent, leaveEvent, deleteEvent } = useEvent(props.event.id || '');
const { thumbnail, unloadThumbnail } = useEventThumbnailM(props.event.id || '');

const allAttendees = computed(() => {
	// Filter out host from attendees to avoid duplicates
	const filteredAttendees = (attendees.value || []).filter(
		(attendee) => attendee.id !== props.event.hostId
	);
	return [props.event.host, ...filteredAttendees];
});

const attendeeAvatars = computed(() => {
	return allAttendees.value.map((attendee) => {
		const { avatar128, chipColor } = useUser(attendee.id);

		return {
			src: avatar128.value || undefined,
			alt: attendee.username,
			chip: chipColor.value ? { color: chipColor.value as any } : undefined
		};
	});
});

const badges = computed(() => {
	const array: {
		text: string;
		color?:
			| 'primary'
			| 'secondary'
			| 'success'
			| 'info'
			| 'warning'
			| 'danger'
			| 'tertiary'
			| 'light';
		icon: string;
		size: 'small' | 'default' | 'large';
		link?: string;
	}[] = [];

	let typeIcon: string;
	switch (props.event.type) {
		case 'HYBRID':
			typeIcon = 'mdi:human-greeting-variant';
			break;
		case 'IN_PERSON':
			typeIcon = 'mdi:office-building';
			break;
		case 'ONLINE':
			typeIcon = 'mdi:laptop-account';
			break;
	}
	array.push({
		text: capitalizeFully(props.event.type.replace('_', '')),
		icon: typeIcon,
		color: 'light',
		size: 'small'
	});

	props.event.activities.forEach((activity) => {
		if (typeof activity === 'string') {
			// legacy string format (activity type name)
			const activityStr: string = activity;
			array.push({
				text: capitalizeFully(activityStr.replace(/_/g, ' ')),
				icon: 'mdi:tag-outline',
				color: 'warning',
				size: 'small'
			});
		} else if ('type' in activity && activity.type === 'activity_type' && 'value' in activity) {
			// actual activity type
			const activityType = activity as { type: 'activity_type'; value: string };
			array.push({
				text: capitalizeFully(activityType.value.replace(/_/g, ' ')),
				icon: 'mdi:tag-outline',
				color: 'warning',
				size: 'small'
			});
		} else if (
			'type' in activity &&
			activity.type === 'activity' &&
			'name' in activity &&
			'id' in activity
		) {
			// actual activity
			const actualActivity = activity as {
				type: 'activity';
				id: string;
				name: string;
				fields?: Record<string, any>;
			};
			array.push({
				text: actualActivity.name,
				icon: actualActivity.fields?.['icon'] || 'material-symbols:activity-zone',
				color: 'primary',
				size: 'small',
				link: `/tabs/activities/${actualActivity.id}`
			});
		}
	});

	return array;
});

const buttons = computed(() => {
	const array: {
		text: string;
		color?:
			| 'primary'
			| 'secondary'
			| 'success'
			| 'info'
			| 'warning'
			| 'danger'
			| 'neutral'
			| 'light'
			| 'medium'
			| 'dark'
			| 'tertiary';
		size: 'small' | 'default' | 'large';
		onClick?: () => void;
		disabled?: boolean;
	}[] = [];

	const isAtCapacity = computed(() => {
		const maxInPerson = props.event.fields?.['max_in_person'] as number | undefined;
		const maxOnline = props.event.fields?.['max_online'] as number | undefined;

		if (props.event.type === 'IN_PERSON' && maxInPerson) {
			// skips undefined or 0
			return props.event.attendee_count >= maxInPerson;
		} else if (props.event.type === 'ONLINE' && maxOnline) {
			// skips undefined or 0
			return props.event.attendee_count >= maxOnline;
		} else if (props.event.type === 'HYBRID') {
			const totalMax = (maxInPerson || 0) + (maxOnline || 0);
			if (totalMax > 0) {
				return props.event.attendee_count >= totalMax;
			}
		}

		const { user: hostUser, maxEventAttendees } = useUser(props.event.hostId);
		if (hostUser.value) {
			return props.event.attendee_count >= maxEventAttendees.value;
		}

		return false;
	});

	if (props.event.hostId !== user.value?.id) {
		if (props.event.is_attending) {
			array.push({
				text: 'Leave Event',
				color: 'danger',
				size: 'small',
				onClick: async () => {
					await leaveEvent();
				}
			});
		} else {
			array.push({
				text: isAtCapacity.value ? 'Event Full' : 'Sign Up',
				color: isAtCapacity.value ? 'light' : 'primary',
				size: 'small',
				disabled: isAtCapacity.value,
				onClick: async () => {
					if (isAtCapacity.value) {
						await Toast.show({
							text: 'This event has reached its maximum capacity.',
							duration: 'long'
						});
						return;
					}

					await signUpForEvent();
				}
			});
		}
	}

	if (props.event.can_edit) {
		array.push({
			text: 'Manage',
			color: 'secondary',
			size: 'small',
			onClick: () => {
				navigateTo(`/tabs/events/${props.event.id}/manage`);
			}
		});

		array.push({
			text: 'Delete',
			color: 'danger',
			size: 'small',
			onClick: () => {
				const yes = confirm(
					'Are you sure you want to delete this event? This action cannot be undone.'
				);
				if (yes) {
					deleteEvent();
					navigateTo('/tabs/events');
				}
			}
		});
	}

	return array;
});

const footer = computed(() => `Created by @${props.event.host.username} - ${time.value}`);

const { avatar128: authorAvatar, chipColor: authorAvatarChipColor } = useUser(props.event.hostId);

const i18n = useI18n();
const time = computed(() => {
	if (!props.event.created_at) return 'sometime';
	const created = DateTime.fromISO(props.event.created_at, {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});

	return created.setLocale(i18n.locale.value).toLocaleString(DateTime.DATETIME_MED);
});

onBeforeUnmount(() => {
	unloadThumbnail();
});
</script>
