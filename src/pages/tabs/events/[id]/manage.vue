<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Manage Event</IonTitle>
				<IonButtons slot="start">
					<IonBackButton :default-href="`/tabs/events/${route.params.id}`" />
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div
				v-if="event && user"
				class="flex flex-col items-center w-full gap-3 px-4 py-3"
			>
				<MSurface class="w-full gap-2">
					<p class="m-eyebrow">{{ event.name }}</p>
					<IonButton
						expand="block"
						fill="outline"
						@click="attendeesDrawerRef?.open()"
					>
						<IonIcon
							slot="start"
							:icon="peopleOutline"
						/>
						View Attendees ({{ comma(event.attendee_count) }})
					</IonButton>
					<IonButton
						v-if="!event.fields?.cancelled"
						expand="block"
						fill="outline"
						color="warning"
						:disabled="event.timing.has_passed"
						@click="cancel"
					>
						<IonIcon
							slot="start"
							:icon="calendarClearOutline"
						/>
						Cancel Event
					</IonButton>
					<IonButton
						v-else
						expand="block"
						fill="outline"
						color="warning"
						@click="uncancel"
					>
						<IonIcon
							slot="start"
							:icon="calendarOutline"
						/>
						Uncancel Event
					</IonButton>
					<IonButton
						expand="block"
						fill="outline"
						color="danger"
						:disabled="event.timing.is_ongoing || event.timing.has_passed"
						@click="removeEvent"
					>
						<IonIcon
							slot="start"
							:icon="trashOutline"
						/>
						Delete Event
					</IonButton>
				</MSurface>

				<EventMForm
					:event="event"
					mode="edit"
					@submitted="fetch"
				/>

				<MContentDrawer
					ref="attendeesDrawerRef"
					:title="`Event Attendees (${comma(event.attendee_count)})`"
				>
					<LazyUserMCard
						v-for="attendee in allAttendees"
						:key="attendee.id"
						:user="attendee"
						hydrate-on-visible
					/>
				</MContentDrawer>
			</div>
			<MEmptyState
				v-else-if="event === null"
				icon="mdi:calendar-remove"
				title="Event Not Found"
				description="This event does not exist, or it was deleted."
			/>
			<Loading v-else />
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { calendarClearOutline, calendarOutline, peopleOutline, trashOutline } from 'ionicons/icons';
import type { User } from 'types/user';
import { comma } from 'utils';
import type MContentDrawer from '~/components/MContentDrawer.vue';

const route = useRoute();
const ionRouter = useIonRouter();
const { user } = useAuth();
const { notifySuccess, notifyError } = useAppHaptics();
const eventStore = useEventStore();

// ionic runs setup before the route params settle on a deep link, so reading them here binds
// `undefined` for the life of the page
const eventId = computed(() => (route.params.id as string | undefined) ?? '');
const event = computed(() => (eventId.value ? eventStore.get(eventId.value) : undefined));
const attendees = ref<User[] | null>(null);

const attendeesDrawerRef = ref<InstanceType<typeof MContentDrawer>>();
const allAttendees = computed(() => {
	if (!event.value) return [];
	return [event.value.host, ...(attendees.value || [])];
});

async function load() {
	if (!eventId.value) return;
	await eventStore.fetchEvent(eventId.value);
	attendees.value = await eventStore.fetchAttendees(eventId.value);
}

watch(eventId, () => void load(), { immediate: true });

// the host check is server-authoritative; this only keeps a non-host from staring at a form
// they cannot submit
watch(
	() => event.value,
	(current) => {
		if (current && !current.can_edit) {
			void notifyError();
			ionRouter.replace(`/tabs/events/${current.id}`);
		}
	},
	{ immediate: true }
);

async function confirmed(message: string): Promise<boolean> {
	const { value } = await Dialog.confirm({ message });
	return value;
}

async function cancel() {
	if (!(await confirmed('Cancel this event? Attendees will be notified.'))) return;

	await eventStore.cancelEvent(eventId.value);
	await load();
	await notifySuccess();
	ionRouter.replace(`/tabs/events/${event.value?.id ?? ''}`);
}

async function uncancel() {
	if (!(await confirmed('Uncancel this event?'))) return;

	await eventStore.uncancelEvent(eventId.value);
	await load();
	await notifySuccess();
	ionRouter.replace(`/tabs/events/${event.value?.id ?? ''}`);
}

async function removeEvent() {
	if (!event.value) return;
	if (!(await confirmed('Delete this event? This cannot be undone.'))) return;

	await eventStore.deleteEvent(eventId.value);
	await notifySuccess();
	ionRouter.replace('/tabs/discover');
}
</script>
