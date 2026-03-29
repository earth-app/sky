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
	<MContentDrawer
		ref="attendeesDrawerRef"
		:title="`Event Attendees (${comma(reactiveEvent.attendee_count)})`"
		:is-loading="false"
	>
		<template #default="{ search }">
			<UserMCard
				v-for="attendee in filteredAttendees(search)"
				:key="attendee.id"
				:user="attendee"
			/>
		</template>
	</MContentDrawer>
</template>

<script setup lang="ts">
defineOptions({
	inheritAttrs: false
});
import { Toast } from '@capacitor/toast';
import { DateTime } from 'luxon';
import type { Event } from 'types/event';
import { capitalizeFully, trimString } from 'utils';
import MContentDrawer from '~/components/MContentDrawer.vue';

const props = defineProps<{
	event: Event;
	noLink?: boolean;
	full?: boolean;
}>();

const { user } = useAuth();
const {
	event: eventState,
	attendees,
	fetchAttendees,
	signUpForEvent,
	leaveEvent,
	deleteEvent
} = useEvent(props.event.id || '');
const { thumbnail, fetchThumbnail, unloadThumbnail } = useEventThumbnailM(props.event.id || '');
onMounted(() => {
	fetchThumbnail();
});

const reactiveEvent = computed(() => eventState.value || props.event);

const attendeesDrawerRef = ref<InstanceType<typeof MContentDrawer>>();

const openAttendeesDrawer = () => {
	if (!attendees.value) {
		fetchAttendees();
	}
	attendeesDrawerRef.value?.open();
};

const allAttendees = computed(() => {
	const filteredAttendees = (attendees.value || []).filter(
		(attendee) => attendee.id !== reactiveEvent.value.hostId
	);
	return [reactiveEvent.value.host, ...filteredAttendees];
});

const normalizeSearch = (value?: string | null) => value?.trim().toLowerCase() || '';

const filteredAttendees = (search?: string) => {
	const normalizedSearch = normalizeSearch(search);
	if (!normalizedSearch) return allAttendees.value;

	return allAttendees.value.filter((attendee) => {
		const searchableValues = [
			attendee.username,
			attendee.full_name,
			attendee.account?.username,
			attendee.account?.first_name,
			attendee.account?.last_name
		].filter(Boolean) as string[];

		return searchableValues.some((value) => value.toLowerCase().includes(normalizedSearch));
	});
};

const attendeeAvatars = computed(() => {
	return allAttendees.value.map((attendee) => {
		const url = attendee.account?.avatar_url;

		// Preload avatar
		if (url && url.startsWith('http')) {
			avatarStore.preloadAvatar(url);
		}

		// Get avatar from store
		const avatar =
			url && url.startsWith('http')
				? avatarStore.get(url)?.avatar128 || '/favicon.png'
				: '/favicon.png';
		const chipColor = userStore.getChipColor(attendee);

		return {
			src: avatar,
			alt: attendee.username,
			link: `/tabs/profile/@${attendee.username}`,
			chip: chipColor ? { color: chipColor as any } : undefined
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

	if (props.event.can_edit || props.event.is_attending) {
		array.push({
			text: `Attendees (${withSuffix(reactiveEvent.value.attendee_count)})`,
			color: 'medium',
			size: 'small',
			onClick: openAttendeesDrawer
		});
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

const avatarStore = useAvatarStore();
const userStore = useUserStore();

// Use host avatar for event card
const authorAvatarUrl = computed(() => reactiveEvent.value.host.account?.avatar_url);
const authorAvatar = computed(() => {
	const url = authorAvatarUrl.value;
	if (!url || !url.startsWith('http')) return '/favicon.png';
	return avatarStore.get(url)?.avatar128 || '/favicon.png';
});
const authorAvatarChipColor = computed(() => userStore.getChipColor(reactiveEvent.value.host));

// Preload host avatar
if (authorAvatarUrl.value) {
	avatarStore.preloadAvatar(authorAvatarUrl.value);
}

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
