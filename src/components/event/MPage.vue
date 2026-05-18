<template>
	<div class="flex flex-col items-center w-full pt-8">
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
					:event="event"
					no-link
					full
					class="w-full"
				/>
				<UserMCard
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
					>
						<IonContent>
							<div class="prose max-w-none">
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
	>
		<IonContent>
			<div class="flex flex-col items-center justify-center p-4">
				<img
					:src="thumbnail || '/cloud.png'"
					alt="Event Thumbnail"
					class="max-h-screen max-w-screen rounded-lg shadow-md object-contain"
				/>
				<h2 class="text-center font-semibold">
					{{ thumbnailAuthor ? `Photo by ${thumbnailAuthor}` : '' }}
				</h2>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import type { Event } from 'types/event';

const props = defineProps<{
	event: Event;
}>();

const { submissions, fetchSubmissions, thumbnail, thumbnailAuthor, fetchThumbnail } = useEvent(
	props.event.id,
	makeMServerRequest
);

onMounted(() => {
	if (!thumbnail.value) {
		fetchThumbnail();
	}

	if (!submissions.value) {
		fetchSubmissions();
	}
});

const previewOpen = ref(false);
function openPreview() {
	previewOpen.value = true;
}

const infoOpen = ref(false);
function openInfo() {
	if (!props.event.fields?.info) return;
	infoOpen.value = true;
}
</script>
