<template>
	<div
		class="relative min-w-32 max-w-64 min-h-32 max-h-64 border-2 border-info rounded-xl hover:cursor-pointer *:hover:opacity-90 *:transition-opacity *:duration-300"
		@click="open = true"
	>
		<div
			v-if="submissions.length === 1"
			class="flex items-center justify-center size-full"
		>
			<img
				:src="submissions[0]!.image"
				alt="Submission Preview"
				class="size-full rounded-lg shadow-md object-contain"
			/>
		</div>
		<div
			v-else-if="submissions.length > 1"
			class="grid grid-cols-2 grid-rows-2"
		>
			<img
				v-for="(submission, index) in submissions.slice(0, 4)"
				:key="index"
				:src="submission.image"
				alt="Submission Preview"
				class="max-h-full w-auto rounded-lg shadow-md object-contain"
			/>
		</div>
		<span
			v-else
			class="text-center text-wrap italic opacity-80 px-2"
			>Be the first to submit a photo!</span
		>

		<h3 class="absolute left-4 bottom-2 text-center font-bold text-lg bg-black/50 px-2 rounded-lg">
			{{ submissions.length }} submissions
		</h3>
		<IonModal
			v-if="submissions && submissions.length > 0"
			title="Submissions"
			:is-open="open"
		>
			<IonHeader>
				<IonToolbar class="px-2">
					<IonTitle>Submissions ({{ comma(submissions.length) }})</IonTitle>
					<IonButtons slot="end">
						<IonButton
							color="danger"
							@click="open = false"
						>
							<UIcon
								name="mdi:close"
								class="size-5"
							/>
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<EventSubmissionMGallery :submissions="submissions" />
		</IonModal>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	submissions: EventImageSubmission[];
}>();

const open = ref(false);
</script>
