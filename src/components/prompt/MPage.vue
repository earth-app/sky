<template>
	<div class="flex flex-col w-full px-2">
		<IonRefresher
			slot="fixed"
			@ionRefresh="handleRefresh"
		>
			<IonRefresherContent />
		</IonRefresher>
		<div class="flex flex-col items-center justify-center">
			<PromptMCard
				:prompt="prompt"
				no-link
			/>
			<div class="flex flex-col justify-center items-center my-2 w-full">
				<div class="flex w-full px-2 mb-4">
					<UAvatar
						:src="avatar128"
						size="lg"
						class="self-center mr-4 shadow-md shadow-black/10 light:shadow-black/30"
					/>
					<IonTextarea
						:value="newResponse"
						class="w-full border-2 p-2 rounded-lg"
						:placeholder="user ? `Write your response...` : 'Please log in to respond'"
						auto-grow
						:disabled="posting || !user"
						:minlength="1"
						:maxlength="700"
						counter
						@ion-input="
							(event) => {
								newResponse = event.target.value || '';
							}
						"
					/>
				</div>
				<IonButton
					color="secondary"
					:disabled="posting || newResponse.trim().length === 0"
					@click="postResponse"
					>Post</IonButton
				>
			</div>
		</div>
		<div class="flex flex-col items-center justify-center">
			<div
				v-for="response in responses"
				:key="response.id"
				class="w-full my-2"
			>
				<PromptMResponse
					:response="response"
					@deleted="
						responses.splice(
							responses.findIndex((r) => r.id === response.id),
							1
						)
					"
				/>
			</div>
			<IonInfiniteScroll
				v-if="hasMore"
				@ionInfinite="onInfinite"
				threshold="75%"
			>
				<IonInfiniteScrollContent />
			</IonInfiniteScroll>
			<p
				v-if="isLoading"
				class="text-gray-500 my-4"
			>
				Loading more responses...
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { type Prompt } from '@earth-app/crust/src/shared/types/prompts';

const { user, avatar128 } = useAuth();
const { handle } = useDisplayName(user);

const page = ref(1);
const isLoading = ref(false);
const hasMore = ref(true);
const props = defineProps<{
	prompt: Prompt;
}>();

const { responses, fetch: loadResponses } = usePromptResponses(props.prompt.id);

const posting = ref(false);
const newResponse = ref('');

async function postResponse() {
	if (posting.value) return;

	posting.value = true;

	const res = await createPromptResponse(props.prompt.id, newResponse.value);
	if (res.success && res.data) {
		if ('message' in res.data) {
			await Toast.show({
				text: res.data.message || 'An unknown error occurred.',
				duration: 'long'
			});

			posting.value = false;
			return;
		}

		responses.value.unshift(res.data);
		newResponse.value = '';

		// Tap Prompts Journey
		const journeyRes = await tapCurrentJourneyM('prompt');
		if (journeyRes.success && journeyRes.data) {
			await Toast.show({
				text: `Your prompts streak is now at ${journeyRes.data.count} prompts on your journey!`,
				duration: 'long'
			});
		} else {
			await Toast.show({
				text: journeyRes.message || 'An unknown error occurred.',
				duration: 'long'
			});
		}
	} else {
		await Toast.show({
			text: res.message || 'An unknown error occurred while posting your response.',
			duration: 'long'
		});
	}

	posting.value = false;
}

async function handleRefresh(event: CustomEvent) {
	responses.value = [];
	page.value = 1;
	hasMore.value = true;
	await loadResponses();

	event.detail.complete();
}

async function onInfinite(event: CustomEvent) {
	await loadResponses();
	(event.target as any).complete();
}

onMounted(async () => {
	// Clear any existing responses to ensure fresh data on page load
	responses.value = [];
	page.value = 1;
	hasMore.value = true;

	await loadResponses();
});
</script>
