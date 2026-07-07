<template>
	<div class="relative">
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
			:report="canReport ? { contentType: 'event', contentId: event.id } : undefined"
		/>
	</div>
	<MContentDrawer
		ref="attendeesDrawerRef"
		:title="`Event Attendees (${comma(attendeeCount)})`"
		:is-loading="false"
	>
		<template #default="{ search }">
			<div class="flex flex-col w-full px-4 gap-3">
				<UserMCard
					v-for="attendee in filteredAttendees(search)"
					:key="attendee.id"
					:user="attendee"
				/>
			</div>
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
import type { User } from 'types/user';
import { capitalizeFully, comma, trimString } from 'utils';
import MContentDrawer from '~/components/MContentDrawer.vue';
import {
	attendeeCount as computeAttendeeCount,
	distinctAttendees as computeDistinctAttendees,
	isEventPast
} from '~/utils/event';

const props = defineProps<{
	event: Event;
	noLink?: boolean;
	full?: boolean;
}>();

const { user } = useAuth();
const eventStore = useEventStore();
const {
	event: eventState,
	attendees,
	fetchAttendees,
	signUpForEvent,
	leaveEvent,
	deleteEvent,
	thumbnail,
	fetchThumbnail,
	unloadThumbnail
} = useEvent(props.event.id || '', makeMServerRequest);

function afterRsvp(attending: boolean) {
	const id = props.event.id;
	if (!id) return;
	// count is refetched authoritatively by the composable (and derived from the
	// deduped attendee list); only flip attendance here so we don't stack a second
	// optimistic increment on top of that refetch (was inflating the count by one)
	eventStore.updateEvent(id, { is_attending: attending });
}

onMounted(() => {
	if (!isDataConstrained.value && !isOffline.value) {
		fetchThumbnail();
	}
});

const reactiveEvent = computed(() => eventState.value || props.event);

const isPast = computed(() => isEventPast(reactiveEvent.value));

const canReport = computed(() => Boolean(user.value) && !isOffline.value);

const attendeesDrawerRef = ref<InstanceType<typeof MContentDrawer>>();

const openAttendeesDrawer = () => {
	if (!attendees.value) {
		fetchAttendees();
	}
	attendeesDrawerRef.value?.open();
};

const distinctAttendees = computed<User[] | null>(() =>
	computeDistinctAttendees(reactiveEvent.value.host, attendees.value)
);

// fall back to just the host until the attendee list has loaded
const allAttendees = computed(() => distinctAttendees.value ?? [reactiveEvent.value.host]);

// prefer the deduped list length so the count can never drift from the rendered cards
const attendeeCount = computed(() =>
	computeAttendeeCount(
		reactiveEvent.value.host,
		attendees.value,
		reactiveEvent.value.attendee_count ?? 0
	)
);

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
		const avatar = avatarStore.safeUrl(url, 'avatar128');
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
			'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'danger' | 'tertiary' | 'light';
		icon: string;
		size: 'small' | 'default' | 'large';
		link?: string;
	}[] = [];

	if (isPast.value) {
		array.push({
			text: 'Event Ended',
			icon: 'mdi:calendar-remove',
			color: 'danger',
			size: 'small'
		});
	}

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

	const ev = reactiveEvent.value;
	const isAtCapacity = computed(() => {
		const maxInPerson = ev.fields?.['max_in_person'] as number | undefined;
		const maxOnline = ev.fields?.['max_online'] as number | undefined;

		if (ev.type === 'IN_PERSON' && maxInPerson) {
			// skips undefined or 0
			return ev.attendee_count >= maxInPerson;
		} else if (ev.type === 'ONLINE' && maxOnline) {
			// skips undefined or 0
			return ev.attendee_count >= maxOnline;
		} else if (ev.type === 'HYBRID') {
			const totalMax = (maxInPerson || 0) + (maxOnline || 0);
			if (totalMax > 0) {
				return ev.attendee_count >= totalMax;
			}
		}

		const { user: hostUser, maxEventAttendees } = useUser(ev.hostId);
		if (hostUser.value) {
			return ev.attendee_count >= maxEventAttendees.value;
		}

		return false;
	});

	if (ev.hostId !== user.value?.id) {
		if (ev.is_attending) {
			array.push({
				text: 'Leave Event',
				color: 'danger',
				size: 'small',
				onClick: async () => {
					const res = await leaveEvent();
					if (res?.success) afterRsvp(false);
				}
			});
		} else {
			const past = isPast.value;
			const full = isAtCapacity.value;
			array.push({
				text: past ? 'Event Ended' : full ? 'Event Full' : 'Sign Up',
				color: past || full ? 'light' : 'primary',
				size: 'small',
				disabled: past || full,
				onClick: async () => {
					if (past) {
						await Toast.show({
							text: 'This event has already ended.',
							duration: 'long'
						});
						return;
					}

					if (full) {
						await Toast.show({
							text: 'This event has reached its maximum capacity.',
							duration: 'long'
						});
						return;
					}

					const res = await signUpForEvent();
					if (res?.success) afterRsvp(true);
				}
			});
		}
	}

	if (ev.can_edit || ev.is_attending) {
		array.push({
			text: `Attendees (${withSuffix(attendeeCount.value)})`,
			color: 'medium',
			size: 'small',
			onClick: openAttendeesDrawer
		});
	}

	if (ev.can_edit) {
		array.push({
			text: 'Manage',
			color: 'secondary',
			size: 'small',
			onClick: () => {
				navigateTo(`/tabs/events/${ev.id}/manage`);
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
const shouldPreloadAvatars = computed(() => !isDataConstrained.value);

// Use host avatar for event card
const authorAvatarUrl = computed(() => reactiveEvent.value.host.account?.avatar_url);
const authorAvatar = computed(() => avatarStore.safeUrl(authorAvatarUrl.value, 'avatar128'));
const authorAvatarChipColor = computed(() => userStore.getChipColor(reactiveEvent.value.host));

watch(
	[authorAvatarUrl, shouldPreloadAvatars],
	([url, shouldPreload]) => {
		if (shouldPreload && url && url.startsWith('http')) {
			avatarStore.preloadAvatar(url);
		}
	},
	{ immediate: true }
);

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
