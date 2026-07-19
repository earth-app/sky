<template>
	<div class="flex flex-col w-full px-2">
		<IonRefresher
			slot="fixed"
			:disabled="isOfflineMode"
			@ionRefresh="handleRefresh"
		>
			<IonRefresherContent />
		</IonRefresher>
		<div class="flex justify-end w-full pr-2 mt-2">
			<MTourButton tour-id="prompt-profile" />
		</div>
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
						id="response-input"
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
					id="post-button"
					color="secondary"
					:disabled="posting || newResponse.trim().length === 0 || isOfflineMode"
					@click="postResponse"
					>Post</IonButton
				>
			</div>
		</div>
		<div
			v-if="!isOfflineMode"
			class="flex flex-col gap-2 w-full px-2 my-2"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<UIcon
						name="mdi:map-marker-radius-outline"
						class="size-5 text-primary"
					/>
					<h3 class="font-semibold m-0!">From Outside</h3>
					<UBadge
						v-if="promptTrailmarks.length"
						color="primary"
						variant="subtle"
						size="sm"
						>{{ promptTrailmarks.length }}</UBadge
					>
				</div>
				<IonButton
					size="small"
					fill="outline"
					color="primary"
					:disabled="!user"
					@click="outsideOpen = true"
				>
					<UIcon
						name="mdi:map-marker-plus-outline"
						class="size-4 mr-1"
					/>
					Answer From Outside
				</IonButton>
			</div>
			<p
				v-if="!promptTrailmarks.length"
				class="text-sm opacity-60"
			>
				No one has answered this from a trail yet. Head outside and leave the first.
			</p>
			<div
				v-else
				class="flex flex-col gap-2"
			>
				<TrailmarkMCard
					v-for="m in promptTrailmarks"
					:key="m.id"
					:mark="m"
				/>
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

		<IonModal
			:is-open="outsideOpen"
			@did-dismiss="outsideOpen = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>
						<span class="font-semibold text-base!">Answer From Outside</span>
					</IonTitle>
					<IonButtons slot="end">
						<IonButton
							color="medium"
							aria-label="Close"
							@click="outsideOpen = false"
						>
							<UIcon
								name="mdi:close"
								class="min-h-6 min-w-6"
							/>
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent :scroll-y="true">
				<div class="px-4 py-4">
					<TrailmarkMComposer
						:prompt-id="prompt.id"
						@created="onOutsideCreated"
					/>
				</div>
			</IonContent>
		</IonModal>

		<ClientOnly>
			<MSiteTour
				:steps="promptTour"
				name="Prompt Tour"
				tour-id="prompt-profile"
			/>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { type Prompt } from 'types/prompts';
import { shouldShowJourneyToast } from '~/utils/journey';

const { user, avatar128, tapCurrentJourney } = useAuth(makeMServerRequest);

const page = ref(1);
const isLoading = ref(false);
const hasMore = ref(true);
const props = defineProps<{
	prompt: Prompt;
	offlineMode?: boolean;
}>();
const isOfflineMode = computed(() => Boolean(props.offlineMode));

const promptResponses = shallowRef<ReturnType<typeof usePromptResponses> | null>(null);
const responses = computed(() => promptResponses.value?.responses.value || []);

function ensurePromptResponses() {
	if (!promptResponses.value) {
		promptResponses.value = usePromptResponses(props.prompt.id);
	}

	return promptResponses.value;
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

// #region from-outside trailmarks
// trailmark answers left for this prompt from outside (a distinct 'from outside' section)
const { fetchForPrompt, forPrompt } = useTrailmarks();
const outsideOpen = ref(false);
const promptTrailmarks = computed(() => forPrompt(props.prompt.id));

function onOutsideCreated() {
	outsideOpen.value = false;
	void fetchForPrompt(props.prompt.id, true);
	void showInfoToast('Answer left outside. It now shows under this prompt.');
}
// #endregion

const emailGate = useEmailGate();
const { checkText } = useClientModeration();

async function postResponse() {
	if (posting.value || isOfflineMode.value) return;
	if (!emailGate.requireVerified('post a prompt response')) return;

	// preventive client pre-check; server stays authoritative
	const verdict = await checkText(newResponse.value);
	if (!verdict.allowed) {
		const reason =
			verdict.category === 'spam'
				? 'This looks like spam.'
				: 'Please remove inappropriate language.';
		await showErrorToast(undefined, { fallback: reason });
		return;
	}

	posting.value = true;

	const res = await createResponse(newResponse.value);
	if (valid(res)) {
		await loadResponses();
		newResponse.value = '';

		// Tap Prompts Journey
		const journeyRes = await tapCurrentJourney('prompt');
		// toast only on a real server-side increment with a usable count (never on unchanged)
		if (shouldShowJourneyToast(journeyRes)) {
			await Toast.show({
				text: `Your prompts streak is now at ${journeyRes.data.count} prompts on your journey!`,
				duration: 'long'
			});
		} else if (!valid(journeyRes)) {
			await Toast.show({
				text: journeyRes.message || 'An unknown error occurred.',
				duration: 'long'
			});
		}
	} else {
		posting.value = false;
		if (emailGate.handleServerError(res, 'post a prompt response')) return;
		await Toast.show({
			text: res.message || 'An unknown error occurred while posting your response.',
			duration: 'long'
		});
		return;
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
	void fetchForPrompt(props.prompt.id);
});

// prompt tour

const promptTour: SiteTourStep[] = [
	{
		title: 'Welcome to Prompts',
		description:
			'Prompts are short, creative or thoughtful questions designed to make you think and to spark conversation. Read the prompt above, then scroll to see what the community wrote.',
		footer: "There's no right answer. The best responses are honest and specific.",
		icon: 'mdi:lightbulb-on-outline',
		placement: 'center',
		dim: true
	},
	{
		id: 'response-input',
		title: 'Write Your Response',
		description:
			'Tap here to share your thoughts. Keep it as short or as long as you like: a sentence is fine, an essay is fine.',
		footer: 'You must be signed in to post. Responses inherit your account privacy settings.',
		icon: 'mdi:text-box-edit-outline',
		actions: user.value ? [{ type: 'focus', target: 'response-input', delay: 300 }] : undefined
	},
	{
		id: 'post-button',
		title: 'Post & Join the Conversation',
		description:
			'Tap Post to share your response. It joins the feed below where others can read, react, and reply. You can edit or delete it later from your own profile.',
		footer: 'Posting a thoughtful prompt response earns Impact Points.',
		icon: 'mdi:send'
	}
];
</script>

<style>
textarea {
	padding-top: 0 !important;
}
</style>
