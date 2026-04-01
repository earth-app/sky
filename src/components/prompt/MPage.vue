<template>
	<div class="flex flex-col w-full px-2">
		<IonRefresher
			slot="fixed"
			:disabled="isOfflineMode"
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
						:placeholder="
							isOfflineMode
								? 'Responses are unavailable offline'
								: user
									? `Write your response...`
									: 'Please log in to respond'
						"
						auto-grow
						:disabled="posting || !user || isOfflineMode"
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
					:disabled="posting || newResponse.trim().length === 0 || isOfflineMode"
					@click="postResponse"
					>Post</IonButton
				>
			</div>
		</div>
		<div
			v-if="!isOfflineMode"
			class="flex flex-col items-center justify-center"
		>
			<div
				v-for="response in responses"
				:key="response.id"
				class="w-full my-2"
			>
				<PromptMResponse
					:response="response"
					@deleted="removeResponse(response.id)"
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
		<p
			v-else
			class="text-gray-500 text-sm text-center my-4"
		>
			Prompt responses are unavailable offline.
		</p>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { type Prompt } from 'types/prompts';

const { user, avatar128 } = useAuth();

const page = ref(1);
const isLoading = ref(false);
const hasMore = ref(true);
const props = defineProps<{
	prompt: Prompt;
	offlineMode?: boolean;
}>();
const isOfflineMode = computed(() => Boolean(props.offlineMode));

let promptResponses: ReturnType<typeof usePromptResponses> | null = null;
const responses = computed(() => promptResponses?.responses.value || []);

function ensurePromptResponses() {
	if (!promptResponses) {
		promptResponses = usePromptResponses(props.prompt.id);
	}

	return promptResponses;
}

async function loadResponses() {
	if (isOfflineMode.value) {
		return { success: true } as const;
	}

	const promptResponses = ensurePromptResponses();
	return await promptResponses.fetch();
}

async function createResponse(content: string) {
	if (isOfflineMode.value) {
		return {
			success: false,
			message: 'Prompt responses are unavailable offline.'
		};
	}

	const promptResponses = ensurePromptResponses();
	return await promptResponses.createResponse(content);
}

function removeResponse(id: string) {
	if (isOfflineMode.value) return;

	// Keep UI consistent with store-backed responses after a child delete action.
	void loadResponses();
}

const posting = ref(false);
const newResponse = ref('');

async function postResponse() {
	if (posting.value || isOfflineMode.value) return;

	posting.value = true;

	const res = await createResponse(newResponse.value);
	if (res.success && res.data) {
		if ('message' in res.data) {
			await Toast.show({
				text: res.data.message || 'An unknown error occurred.',
				duration: 'long'
			});

			posting.value = false;
			return;
		}

		await loadResponses();
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
	if (isOfflineMode.value) {
		event.detail.complete();
		return;
	}

	page.value = 1;
	hasMore.value = true;
	await loadResponses();

	event.detail.complete();
}

async function onInfinite(event: CustomEvent) {
	if (isOfflineMode.value) {
		(event.target as any).complete();
		return;
	}

	await loadResponses();
	(event.target as any).complete();
}

onMounted(async () => {
	if (isOfflineMode.value) {
		return;
	}

	// Clear any existing responses to ensure fresh data on page load
	page.value = 1;
	hasMore.value = true;

	await loadResponses();
});
</script>

<style>
textarea {
	padding-top: 0 !important;
}
</style>
