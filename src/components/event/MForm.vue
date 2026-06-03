<template>
	<IonCard class="p-4 w-full">
		<ContentTTLNotice
			v-if="props.mode === 'create'"
			kind="event"
			variant="banner"
			color="info"
		/>
		<UForm
			:state="state"
			class="space-y-2"
			@submit="handleSubmit"
		>
			<div
				v-if="error"
				class="p-4 bg-red-100 border border-red-400 text-red-700 rounded"
			>
				{{ error }}
			</div>

			<UFormField
				label="Name"
				name="name"
				help="Maximum 50 characters"
				required
			>
				<IonInput
					v-model="state.name"
					placeholder="Enter event name"
					class="w-full"
					:disabled="loading"
					:maxlength="50"
				/>
			</UFormField>

			<UFormField
				label="Description"
				name="description"
				help="Maximum 3000 characters"
			>
				<IonTextarea
					v-model="state.description"
					placeholder="Enter event description"
					class="w-full"
					:rows="4"
					:disabled="loading"
					:maxlength="3000"
					counter
				/>
			</UFormField>

			<UFormField
				label="Type"
				name="type"
				help="Select the type of event"
				required
			>
				<IonSelect
					v-model="state.type"
					class="w-full"
					:disabled="loading"
				>
					<IonSelectOption value="IN_PERSON">In Person</IonSelectOption>
					<IonSelectOption value="ONLINE">Online</IonSelectOption>
					<IonSelectOption value="HYBRID">Hybrid</IonSelectOption>
				</IonSelect>
			</UFormField>

			<UFormField
				label="Activities"
				name="activities"
				help="Select activities for this event to improve recommendations"
			>
				<ActivityMSelector
					v-model="state.activities"
					class="w-full"
					:include-activity-types="true"
				/>
			</UFormField>

			<div class="grid gap-4 grid-cols-1 sm:grid-cols-2">
				<UFormField
					label="Start Date & Time"
					name="date"
					help="When the event starts"
					required
				>
					<IonInput
						type="datetime-local"
						:modelValue="dateInputValue"
						@update:modelValue="updateDate"
						class="w-full"
						:disabled="loading"
					/>
				</UFormField>

				<UFormField
					label="End Date & Time"
					name="end_date"
					help="When the event ends"
					required
				>
					<IonInput
						type="datetime-local"
						:modelValue="endDateInputValue"
						@update:modelValue="updateEndDate"
						class="w-full"
						:disabled="loading"
					/>
				</UFormField>
			</div>

			<EventMLocation
				v-if="state.type !== 'ONLINE'"
				v-model="state.location"
				:fields="state.fields"
				@update:fields="state.fields = $event"
			/>

			<EventMThumbnailEditor
				:thumbnail-url-prop="thumbnail || undefined"
				@update:thumbnail="thumbnailUrlFromEditor = $event"
				@update:thumbnailFile="thumbnailFile = $event"
			/>

			<UFormField
				label="Additional Event Details"
				name="fields"
				help="Configure additional event settings"
			>
				<div class="space-y-4">
					<UFormField
						v-if="state.type !== 'ONLINE'"
						label="Address"
						name="address"
						help="Auto-populated from location selection (max 255 characters)"
					>
						<IonInput
							:modelValue="state.fields?.['address'] || ''"
							disabled
							placeholder="Select a location above to populate"
							:maxlength="255"
							class="w-full"
						/>
					</UFormField>

					<UFormField
						label="Event Link"
						name="link"
						help="Optional URL for event information or registration"
					>
						<IonInput
							v-model="eventLink"
							placeholder="https://example.com/event"
							type="url"
							@update:modelValue="updateField('link', $event)"
							class="w-full"
							:disabled="loading"
						/>
					</UFormField>

					<UFormField
						label="Additional Information"
						name="info"
						help="Extra details about the event (max 1000 characters)"
					>
						<IonTextarea
							v-model="eventInfo"
							placeholder="Enter additional event information..."
							:rows="4"
							:maxlength="1000"
							@update:modelValue="updateField('info', $event)"
							class="w-full"
							:disabled="loading"
							counter
						/>
					</UFormField>

					<div class="grid gap-4 grid-cols-1 sm:grid-cols-2">
						<UFormField
							label="Max In-Person Attendees"
							name="max_in_person"
							:help="`Maximum in-person attendees (limit: ${maxEventAttendees.toLocaleString()})`"
						>
							<IonInput
								v-model.number="maxInPerson"
								type="number"
								:min="0"
								:max="maxEventAttendees"
								placeholder="Enter maximum in-person attendees"
								@update:modelValue="updateField('max_in_person', $event)"
								class="w-full"
								:disabled="loading"
							/>
						</UFormField>

						<UFormField
							label="Max Online Attendees"
							name="max_online"
							:help="`Maximum online attendees (limit: ${maxEventAttendees.toLocaleString()})`"
						>
							<IonInput
								v-model.number="maxOnline"
								type="number"
								:min="0"
								:max="maxEventAttendees"
								placeholder="Enter maximum online attendees"
								@update:modelValue="updateField('max_online', $event)"
								class="w-full"
								:disabled="loading"
							/>
						</UFormField>
					</div>

					<UFormField
						label="Event Icon"
						name="icon"
						help="Optional custom icon name for this event"
					>
						<IonInput
							v-model="eventIcon"
							placeholder="e.g., mdi:calendar-star"
							@update:modelValue="updateField('icon', $event)"
							class="w-full"
							:disabled="loading"
						/>
					</UFormField>
				</div>
			</UFormField>

			<IonButton
				type="submit"
				color="success"
				class="mt-4 w-full"
				:disabled="loading"
			>
				<UIcon
					:name="mode === 'create' ? 'mdi:content-save-plus' : 'mdi:content-save-edit'"
					class="size-5 mr-2"
				/>
				{{ mode === 'create' ? 'Create Event' : 'Save Event Settings' }}
			</IonButton>
		</UForm>
	</IonCard>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import type { FormSubmitEvent } from '@nuxt/ui';
import type { Event } from 'types/event';

const props = defineProps<{
	mode: 'create' | 'edit';
	event?: (Partial<EventData> & { id?: string }) | (Partial<Event> & { id?: string });
}>();

const emit = defineEmits<{
	submitted: [];
}>();

const { createEvent } = useEvents();
const { thumbnail, updateEvent, uploadThumbnail, deleteThumbnail } = useEvent(
	props.event?.id || ''
);
const { user } = useAuth();
const { notifyError, notifySuccess } = useAppHaptics();

const loading = ref(false);
const error = ref('');

const thumbnailFile = ref<File | null>(null);
const thumbnailUrlFromEditor = ref<string>('');

const state = reactive<EventData>({
	name: props.event?.name || '',
	description: props.event?.description || '',
	type: props.event?.type || 'IN_PERSON',
	activities: (() => {
		try {
			if (!Array.isArray(props.event?.activities)) return [];

			return props.event.activities
				.map((activity: EventActivity | string) => {
					try {
						if (typeof activity === 'string') {
							// Legacy string format or already a string ID/type
							return activity;
						} else if (
							'type' in activity &&
							activity.type === 'activity_type' &&
							'value' in activity
						) {
							// Activity type
							return activity.value;
						} else if ('id' in activity) {
							// Actual activity
							return activity.id;
						}
					} catch (e) {
						console.warn('Error processing activity:', activity, e);
					}
					// Fallback - return nothing for unknown formats
					return null;
				})
				.filter((id): id is string => id !== null && id !== '');
		} catch (e) {
			console.error('Error initializing activities:', e);
			return [];
		}
	})(),
	location: {
		latitude: props.event?.location?.latitude || 0,
		longitude: props.event?.location?.longitude || 0
	},
	date: props.event?.date || Date.now(),
	end_date: props.event?.end_date || Date.now() + 3600000, // Default to 1 hour later
	visibility: props.event?.visibility || 'PUBLIC',
	fields: props.event?.fields || {}
});

// draft autosave for the create flow only — edit drafts get confusing
const userId = computed(() => user.value?.id);
const draft =
	props.mode === 'create' ? useMFormDraft(state, { kind: 'event', userId, scope: 'create' }) : null;

// Field validation
const eventLink = ref(state.fields?.['link'] || '');
const eventLinkValid = ref<boolean | null>(null);

const eventInfo = ref(state.fields?.['info'] || '');

const maxInPerson = ref(state.fields?.['max_in_person'] || 0);
const maxInPersonValid = ref<boolean | null>(null);

const maxOnline = ref(state.fields?.['max_online'] || 0);
const maxOnlineValid = ref<boolean | null>(null);

const eventIcon = ref(state.fields?.['icon'] || '');

const dateInputValue = computed(() => {
	const date = new Date(state.date);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
});

const endDateInputValue = computed(() => {
	if (!state.end_date) return '';

	const date = new Date(state.end_date);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
});

function updateDate(value: string) {
	state.date = new Date(value).getTime();
}

function updateEndDate(value: string) {
	state.end_date = new Date(value).getTime();
}

// Get max event attendees from user account
const maxEventAttendees = computed(() => {
	if (!user.value) return 1000;

	switch (user.value.account?.account_type) {
		case 'PRO':
		case 'WRITER':
			return 5000;
		case 'ORGANIZER':
			return 1_000_000;
		case 'ADMINISTRATOR':
			return Infinity;
		default:
			return 1000;
	}
});

// Validate link
watch(eventLink, (newValue) => {
	if (!newValue || newValue.trim() === '') {
		eventLinkValid.value = null;
		return;
	}

	try {
		new URL(newValue);
		eventLinkValid.value = true;
	} catch {
		eventLinkValid.value = false;
	}
});

// Validate max in person
watch(maxInPerson, (newValue) => {
	if (!newValue || newValue === 0) {
		maxInPersonValid.value = null;
		return;
	}

	maxInPersonValid.value = newValue <= maxEventAttendees.value;
});

// Validate max online
watch(maxOnline, (newValue) => {
	if (!newValue || newValue === 0) {
		maxOnlineValid.value = null;
		return;
	}

	maxOnlineValid.value = newValue <= maxEventAttendees.value;
});

function updateField(key: string, value: any) {
	if (!state.fields) {
		state.fields = {};
	}

	// Only set non-empty values
	if (value !== undefined && value !== null && value !== '') {
		state.fields[key] = value;
	} else {
		delete state.fields[key];
	}
}

const emailGate = useEmailGate();

async function handleSubmit(event: FormSubmitEvent<EventData>) {
	if (props.mode === 'create' && !emailGate.requireVerified('create events')) return;
	loading.value = true;
	error.value = '';

	// Validate before submitting
	if (eventLinkValid.value === false) {
		notifyError();
		error.value = 'Please enter a valid URL for the event link';
		loading.value = false;
		await Toast.show({
			text: error.value,
			duration: 'long'
		});
		return;
	}

	if (maxInPersonValid.value === false || maxOnlineValid.value === false) {
		notifyError();
		error.value = 'Attendee limits cannot exceed your account maximum';
		loading.value = false;
		await Toast.show({
			text: error.value,
			duration: 'long'
		});
		return;
	}

	try {
		if (props.mode === 'create') {
			await createEvent(event.data);
		} else {
			await updateEvent(event.data);
		}

		if (thumbnailFile.value) {
			const uploadRes = await uploadThumbnail(thumbnailFile.value);
			if (!uploadRes.success) {
				throw new Error(uploadRes.message || 'Failed to upload thumbnail');
			}
		} else if (thumbnailUrlFromEditor.value === '' && thumbnail.value) {
			const deleteRes = await deleteThumbnail();
			if (!deleteRes.success) {
				throw new Error(deleteRes.message || 'Failed to delete thumbnail');
			}
		}

		notifySuccess();
		await Toast.show({
			text: `${event.data.name} has been ${props.mode === 'create' ? 'created' : 'saved'} successfully.`,
			duration: 'long'
		});

		await draft?.clear();
		emit('submitted');
	} catch (err: any) {
		if (emailGate.handleServerError(err, 'create events')) {
			loading.value = false;
			return;
		}
		notifyError();
		error.value = err.message || 'An error occurred while saving settings';

		await Toast.show({
			text: error.value,
			duration: 'long'
		});
	} finally {
		loading.value = false;
	}
}
</script>
