<template>
	<div class="flex flex-col items-center w-full pt-8">
		<div class="flex justify-end w-full pr-4">
			<MTourButton tour-id="event-profile" />
		</div>
		<div class="flex items-start justify-center w-full px-4">
			<div class="flex flex-col w-full">
				<IonImg
					v-if="thumbnail"
					:src="thumbnail"
					:title="`${event.name} Thumbnail | Photo by ${thumbnailAuthor || 'Unknown'}`"
					alt="Event Thumbnail"
					class="w-full max-h-96 rounded-lg shadow-md object-cover"
					@click="thumbnail && openPreview()"
				/>
				<EventMCard
					id="event-profile-card"
					:event="event"
					no-link
					full
					class="w-full"
				/>
				<UserMCard
					id="event-host-card"
					:user="event.host"
					class="my-2"
				/>
				<USeparator class="my-2" />
				<div class="flex flex-col justify-center px-2">
					<IonButton
						v-if="event.fields?.link"
						:router-link="event.fields.link"
						target="_blank"
						class="text-blue-600 hover:underline border-blue-600 inline-flex items-center w-fit"
					>
						<UIcon
							name="mdi:link-variant"
							class="inline-block mr-1"
						/>
						{{ event.fields.link }}
					</IonButton>
					<IonButton
						v-if="event.fields?.info"
						variant="soft"
						color="neutral"
						class="w-fit mt-2"
						@click="openInfo"
					>
						<UIcon
							name="mdi:information-outline"
							class="inline-block mr-1"
						/>
						About Event
					</IonButton>
					<IonModal
						v-if="event.fields?.info"
						:is-open="infoOpen"
						:title="`About ${event.name}`"
						name="event-info"
						@did-dismiss="closeInfo"
					>
						<IonHeader>
							<IonToolbar>
								<IonTitle>
									<span class="font-semibold text-base! ml-2">About {{ event.name }}</span>
								</IonTitle>
								<IonButtons slot="end">
									<IonButton
										color="danger"
										aria-label="Close"
										@click="closeInfo"
									>
										<UIcon
											name="mdi:close"
											class="min-h-6 min-w-6"
										/>
									</IonButton>
								</IonButtons>
							</IonToolbar>
						</IonHeader>
						<IonContent>
							<div class="prose max-w-none p-4">
								<p v-html="event.fields.info"></p>
							</div>
						</IonContent>
					</IonModal>
				</div>
				<div
					id="event-submissions"
					class="flex flex-col items-center justify-stretch my-4 gap-8"
				>
					<!-- only display up until 3 days after event has ended (expires in KV) -->
					<EventSubmissionMPreview
						v-if="(event.end_date || 0) + 1000 * 60 * 60 * 24 * 3 > Date.now()"
						:submissions="submissions || []"
					/>
					<EventSubmissionMUpload
						:event-id="event.id"
						@submission="fetchSubmissions"
					/>
				</div>
			</div>
		</div>
	</div>
	<IonModal
		name="image-viewer"
		:is-open="previewOpen"
		@did-dismiss="closePreview"
	>
		<IonHeader>
			<IonToolbar>
				<IonTitle>
					<span class="font-semibold text-base! ml-2">{{ event.name }}</span>
				</IonTitle>
				<IonButtons slot="end">
					<IonButton
						color="danger"
						aria-label="Close"
						@click="closePreview"
					>
						<UIcon
							name="mdi:close"
							class="min-h-6 min-w-6"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent>
			<div class="flex flex-col h-full">
				<div
					data-testid="image-zoom-viewport"
					class="relative flex-1 flex items-center justify-center overflow-hidden bg-black/90 touch-none select-none"
					@pointerdown="onPointerDown"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
					@pointerleave="onPointerUp"
				>
					<img
						:src="thumbnail || '/cloud.png'"
						alt="Event Thumbnail"
						draggable="false"
						class="max-w-full max-h-full object-contain will-change-transform"
						:style="imageTransform"
					/>
				</div>
				<div class="flex flex-col items-center gap-1 px-4 py-3 text-center">
					<h2 class="font-semibold text-lg! m-0!">{{ event.name }}</h2>
					<p
						v-if="eventWhen"
						class="text-sm! opacity-80 m-0!"
					>
						<UIcon
							name="mdi:calendar-clock"
							class="inline-block mr-1 align-text-bottom"
						/>
						{{ eventWhen }}
					</p>
					<p
						v-if="eventWhere"
						class="text-sm! opacity-80 m-0!"
					>
						<UIcon
							name="mdi:map-marker"
							class="inline-block mr-1 align-text-bottom"
						/>
						{{ eventWhere }}
					</p>
					<p
						v-if="thumbnailAuthor"
						class="text-xs! opacity-60 m-0!"
					>
						Photo by {{ thumbnailAuthor }}
					</p>
				</div>
			</div>
		</IonContent>
	</IonModal>

	<ClientOnly>
		<MSiteTour
			:steps="eventTour"
			name="Event Tour"
			tour-id="event-profile"
		/>
	</ClientOnly>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';
import type { Event } from 'types/event';

const props = defineProps<{
	event: Event;
}>();

const {
	submissions,
	fetchSubmissions,
	thumbnail,
	thumbnailAuthor,
	fetchThumbnail,
	fetchThumbnailMetadata
} = useEvent(props.event.id, makeMServerRequest);

onMounted(() => {
	if (!thumbnail.value) {
		fetchThumbnail();
	}

	// separate metadata=true request populates the "Photo by" caption
	if (!thumbnailAuthor.value) {
		fetchThumbnailMetadata();
	}

	if (!submissions.value) {
		fetchSubmissions();
	}
});

const previewOpen = ref(false);
function openPreview() {
	resetZoom();
	previewOpen.value = true;
}

// pairs with :is-open so a swipe-down dismiss can't wedge the modal shut
function closePreview() {
	previewOpen.value = false;
	resetZoom();
}

const i18n = useI18n();

const eventWhen = computed(() => {
	const start = props.event.date;
	if (!start) return '';
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const startDt = DateTime.fromMillis(start, { zone }).setLocale(i18n.locale.value);
	let label = startDt.toLocaleString(DateTime.DATETIME_MED);
	const end = props.event.end_date;
	if (end && end > start) {
		const endDt = DateTime.fromMillis(end, { zone }).setLocale(i18n.locale.value);
		const sameDay = startDt.hasSame(endDt, 'day');
		label += ` - ${endDt.toLocaleString(sameDay ? DateTime.TIME_SIMPLE : DateTime.DATETIME_MED)}`;
	}
	return label;
});

const eventWhere = computed(() => {
	if (props.event.type === 'ONLINE') return '';
	const loc = props.event.location;
	if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return '';
	if (loc.latitude === 0 && loc.longitude === 0) return '';
	return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
});

// minimal pinch + double-tap zoom; not gated on the image overflowing so landscape zooms too
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const isGesturing = ref(false);

const imageTransform = computed(() => ({
	transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
	transition: isGesturing.value ? 'none' : 'transform 0.2s ease',
	transformOrigin: 'center center',
	cursor: scale.value > 1 ? 'grab' : 'zoom-in'
}));

const pointers = new Map<number, { x: number; y: number }>();
let startDistance = 0;
let startScale = 1;
let lastPan = { x: 0, y: 0 };
let downPoint = { x: 0, y: 0 };
let moved = false;
let lastTapTime = 0;

const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

function resetZoom() {
	scale.value = 1;
	translateX.value = 0;
	translateY.value = 0;
	isGesturing.value = false;
	pointers.clear();
	startDistance = 0;
}

function toggleZoom() {
	if (scale.value > 1.02) {
		resetZoom();
	} else {
		scale.value = 2.5;
	}
}

function onPointerDown(e: PointerEvent) {
	(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	if (pointers.size === 2) {
		const pts = [...pointers.values()];
		startDistance = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
		startScale = scale.value;
		isGesturing.value = true;
	} else if (pointers.size === 1) {
		downPoint = { x: e.clientX, y: e.clientY };
		lastPan = { x: e.clientX, y: e.clientY };
		moved = false;
	}
}

function onPointerMove(e: PointerEvent) {
	if (!pointers.has(e.pointerId)) return;
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

	if (pointers.size === 2 && startDistance > 0) {
		const pts = [...pointers.values()];
		const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
		scale.value = clampScale((dist / startDistance) * startScale);
		moved = true;
		if (scale.value <= 1.02) {
			translateX.value = 0;
			translateY.value = 0;
		}
	} else if (pointers.size === 1 && scale.value > 1) {
		isGesturing.value = true;
		translateX.value += e.clientX - lastPan.x;
		translateY.value += e.clientY - lastPan.y;
		lastPan = { x: e.clientX, y: e.clientY };
		if (Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y) > 10) moved = true;
	}
}

function onPointerUp(e: PointerEvent) {
	if (!pointers.has(e.pointerId)) return;
	pointers.delete(e.pointerId);

	if (pointers.size >= 2) return;
	if (pointers.size === 1) {
		startDistance = 0;
		const pt = [...pointers.values()][0]!;
		lastPan = { x: pt.x, y: pt.y };
		return;
	}

	isGesturing.value = false;
	startDistance = 0;

	if (!moved) {
		const now = Date.now();
		if (now - lastTapTime < 300) {
			toggleZoom();
			lastTapTime = 0;
			return;
		}
		lastTapTime = now;
	}

	if (scale.value <= 1.02) resetZoom();
}

const infoOpen = ref(false);
function openInfo() {
	if (!props.event.fields?.info) return;
	infoOpen.value = true;
}
// pairs with :is-open so a swipe-down / backdrop dismiss can't wedge the modal shut
function closeInfo() {
	infoOpen.value = false;
}

// event tour

const eventTour: SiteTourStep[] = [
	{
		id: 'event-profile-card',
		title: 'Event Overview',
		description:
			'Everything you need at a glance: name, date, location, sign-up status, attendee count, and a description. The Sign Up button appears here if registration is open.',
		footer: 'Live status banners show ongoing, starting soon, or concluded events.',
		icon: 'mdi:calendar-star',
		highlightPadding: 12
	},
	{
		id: 'event-host-card',
		title: 'Meet the Host',
		description:
			"This card shows who's running the event. Tap the host's name or avatar to visit their profile, see their other events, and add them as a friend.",
		footer: 'Pro tip: hosts often share extra context on their profile bio.',
		icon: 'mdi:account-tie-outline'
	},
	{
		id: 'event-submissions',
		title: 'Event Submissions & Gallery',
		description:
			'During and shortly after the event, attendees can upload photos to share their experience. Submissions earn Impact Points and can be featured in the public gallery.',
		footer: 'Submissions are open from the event start through 3 days after it ends.',
		icon: 'mdi:image-multiple-outline'
	}
];
</script>
