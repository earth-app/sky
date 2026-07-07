<template>
	<IonContent :scroll-y="true">
		<div class="flex flex-col mt-4 px-4">
			<div
				v-for="(item, index) in items"
				:key="`submission-${index}`"
				:id="`submission-${index}`"
				@click="openStates[index] = true"
				class="mb-6"
			>
				<div class="flex flex-col items-center">
					<img
						:src="item.image"
						:fetchpriority="index > 8 ? 'low' : 'high'"
						alt="Submission Image"
						:width="item.width"
						:height="item.height"
						class="rounded-lg shadow-md object-cover hover:cursor-pointer"
					/>

					<h2 class="font-bold! text-lg! mt-2 mb-0!">
						<UAvatar
							:src="item.avatar128.value || '/earth-app.png'"
							size="sm"
							class="mr-1"
						/>
						{{ item.user.value?.username || 'Anonymous' }}
					</h2>

					<span class="opacity-80 text-sm! mt-1">{{
						DateTime.fromMillis(item.timestamp).toLocaleString(DateTime.DATETIME_MED)
					}}</span>
				</div>

				<IonModal
					:title="`Submission by @${item.user.value?.username || 'anonymous'}`"
					:is-open="openStates[index]"
					@did-dismiss="openStates[index] = false"
				>
					<IonHeader>
						<IonToolbar class="px-2">
							<IonTitle>
								<UAvatar
									:src="item.avatar128.value || '/earth-app.png'"
									size="sm"
									class="mr-1"
								/>
								{{ item.user.value?.username || 'Anonymous' }}
							</IonTitle>
							<IonButtons slot="end">
								<IonButton
									color="danger"
									@click="openStates[index] = false"
								>
									<UIcon
										name="mdi:close"
										class="size-5"
									/>
								</IonButton>
							</IonButtons>
						</IonToolbar>
					</IonHeader>

					<IonContent>
						<div class="flex flex-col items-center gap-4 p-4">
							<img
								:src="item.image"
								alt="Submission Image"
								class="w-full rounded-lg shadow-md object-contain"
							/>

							<Score :score="item.score.score" />
							<Quote
								:text="item.caption"
								:timestamp="item.timestamp"
							/>
						</div>
					</IonContent>
				</IonModal>
			</div>
		</div>
	</IonContent>
</template>

<script setup lang="ts">
import { DateTime } from 'luxon';

const props = defineProps<{
	submissions: EventImageSubmission[];
}>();

const heights = [240, 320, 400, 480];

function getHeight(index: number) {
	const seed = (index * 11 + 7) % 17;
	return heights[seed % heights.length]!;
}

const items = computed(() => {
	return props.submissions.map((submission, i) => {
		const { user, fetchUser, avatar128, fetchAvatar } = useUser(submission.user_id);
		fetchUser();
		fetchAvatar();

		const height = getHeight(i);

		return {
			...submission,
			user,
			avatar128,
			width: Math.round((height * 16) / 9), // 16:9 aspect ratio
			height
		};
	});
});

const openStates = ref<boolean[]>(props.submissions.map(() => false));
</script>
