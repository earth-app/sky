<template>
	<div class="flex flex-col w-full h-full">
		<div class="flex flex-col items-center justify-between w-full px-4 gap-2">
			<h2 class="text-xl! font-bold! text-center flex items-center gap-2">
				<UIcon
					name="mdi:earth"
					class="min-w-8 min-h-8"
				/>
				Welcome to The Earth App!
			</h2>

			<IonButton
				color="success"
				fill="outline"
				class="self-center text-center w-full"
				@click="next"
			>
				{{
					currentIndex === -1
						? 'Click Me!'
						: currentIndex >= steps.length - 1
							? 'Exit Tutorial'
							: 'Next'
				}}
			</IonButton>
		</div>

		<div class="flex flex-col items-start p-4 w-full mt-8">
			<div
				v-for="(item, index) in items"
				:key="index"
				class="flex flex-col items-center w-full"
			>
				<div class="flex gap-2 items-stretch justify-center my-2">
					<div class="flex flex-col items-center gap-2 min-h-full mr-4">
						<div
							:id="`tile-${index}`"
							class="flex flex-col gap-2 items-center"
						>
							<LazyUBadge
								:icon="item.icon"
								:color="isCurrentStep(index) ? 'primary' : item.completed ? 'warning' : 'secondary'"
								:variant="item.completed ? 'solid' : 'subtle'"
								size="xl"
								hydrate-on-visible
							/>

							<span
								v-if="item.reward"
								class="text-xs opacity-70"
								>+{{ item.reward }}</span
							>
						</div>

						<div
							v-if="index < items.length - 1"
							:class="[
								'w-2 min-h-16 h-full rounded-full transition-colors duration-200',
								item.completed ? 'bg-primary' : 'bg-gray-300'
							]"
						></div>
					</div>

					<div
						class="flex flex-col items-start gap-1 transition-opacity duration-200"
						:class="
							item.completed ? 'opacity-70' : isCurrentStep(index) ? 'opacity-100' : 'opacity-0'
						"
					>
						<span class="text-sm font-medium">{{ item.title }}</span>
						<p class="text-xs opacity-70 max-w-xs">{{ item.description }}</p>

						<div class="flex gap-2 mt-2">
							<IonButton
								v-if="isCurrentStep(index)"
								color="primary"
								size="small"
								@click="next"
							>
								{{ currentIndex >= steps.length - 1 ? 'Finish' : 'Next' }}
							</IonButton>

							<IonButton
								v-if="item.type.startsWith('take_photo')"
								color="secondary"
								size="small"
								:disabled="!isCurrentStep(index)"
								@click="openStepModal(index)"
							>
								<UIcon
									name="mdi:camera"
									class="min-h-4 min-w-4 mr-2"
								/>
								Snap a Picture
							</IonButton>

							<IonButton
								v-else-if="item.type === 'draw_picture'"
								color="secondary"
								size="small"
								:disabled="!isCurrentStep(index)"
								@click="openStepModal(index)"
							>
								<UIcon
									name="mdi:brush"
									class="min-h-4 min-w-4 mr-2"
								/>
								Draw a Picture
							</IonButton>

							<IonButton
								v-else-if="item.type === 'match_terms'"
								color="secondary"
								size="small"
								:disabled="!isCurrentStep(index)"
								@click="openStepModal(index)"
							>
								<UIcon
									name="mdi:cards"
									class="min-h-4 min-w-4"
								/>
								Match the Terms
							</IonButton>

							<IonButton
								v-else-if="item.type === 'order_items'"
								color="secondary"
								size="small"
								:disabled="!isCurrentStep(index)"
								@click="openStepModal(index)"
							>
								<UIcon
									name="mdi:sort"
									class="min-h-4 min-w-4"
								/>
								Order the Items
							</IonButton>

							<IonButton
								v-else-if="item.type === 'scan_barcode'"
								color="secondary"
								size="small"
								:disabled="!isCurrentStep(index)"
								@click="openStepModal(index)"
							>
								<UIcon
									name="mdi:barcode-scan"
									class="min-h-4 min-w-4 mr-2"
								/>
								Scan a Barcode
							</IonButton>
						</div>

						<textarea
							v-if="item.type === 'describe_text' && isCurrentStep(index)"
							type="text"
							placeholder="I'm currently feeling..."
							wrap="hard"
							class="w-full h-full text-sm min-w-60 my-2 p-2 border border-gray-300 rounded-md resize-none"
						/>

						<img
							v-if="
								(item.type.startsWith('take_photo') || item.type === 'draw_picture') &&
								currentImages[index]
							"
							:src="currentImages[index]"
							:alt="item.title"
							class="mt-2 w-full max-h-48 object-cover rounded-lg border border-gray-200"
						/>
					</div>
				</div>
			</div>
		</div>

		<IonModal
			:is-open="stepOpen"
			class="m-8 rounded-md object-contain!"
			@didDismiss="stepOpen = false"
			style="--max-height: 80%"
		>
			<IonContent
				id="onboarding-step-modal-content"
				class="dark:border-2 dark:rounded-md"
				:scroll-y="true"
				:scroll-x="true"
			>
				<div
					class="flex items-center justify-center p-4 min-w-full min-h-full border-4 border-neutral-900/40 rounded-2xl bg-neutral-800 light:bg-neutral-500 light:border-white/10"
				>
					<template v-if="activeStepIndex !== null && activeStep">
						<UserQuestStepMCapture
							v-if="activeStep.type.startsWith('take_photo')"
							@capture="onCapture"
						/>

						<UserQuestStepDrawing
							v-else-if="activeStep.type === 'draw_picture'"
							@capture="onCapture"
						/>

						<UserQuestStepMatcher
							v-else-if="activeStep.type === 'match_terms'"
							:step="{
								type: activeStep.type,
								description: activeStep.description,
								parameters: activeStep.parameters!,
								index: activeStepIndex,
								icon: getStepIcon(activeStep.type),
								altIndex: 0,
								isCurrentQuest: true,
								completed: false
							}"
							:submit="false"
							@submitted="onModalSubmitted"
						/>

						<UserQuestStepOrderer
							v-else-if="activeStep.type === 'order_items'"
							:step="{
								type: activeStep.type,
								description: activeStep.description,
								parameters: activeStep.parameters!,
								index: activeStepIndex,
								icon: getStepIcon(activeStep.type),
								altIndex: 0,
								isCurrentQuest: true,
								completed: false
							}"
							:submit="false"
							@submitted="onModalSubmitted"
						/>

						<UserQuestStepMBarcode
							v-else-if="activeStep.type === 'scan_barcode'"
							:submit="false"
							@submitted="onModalSubmitted"
						/>
					</template>
				</div>
			</IonContent>
		</IonModal>
	</div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
	(event: 'next', step: OnboardingQuestStep): void;
	(event: 'done'): void;
}>();

type OnboardingQuestStep = Omit<QuestStep, 'parameters'> & {
	title: string;
	parameters?: any[];
};

const steps: OnboardingQuestStep[] = [
	{
		type: 'take_photo_classification',
		title: 'Take a Photo',
		description:
			'First thing to do is to capture the moment. When you see something interesting, take a photo of it to start your quest!'
	},
	{
		type: 'activity_read_time',
		title: 'Explore an Interest',
		description:
			'Need a new sport, hobby, or something to talk about? Check out the activities section to find something that sparks your interest!',
		reward: 10
	},
	{
		type: 'respond_to_prompt',
		title: 'Answer a Question',
		description:
			"Ask and talk about questions! Answer life's big questions or ask your own to connect with others and share your perspective. Prompts only last 2 days — jump on a hot one before it disappears."
	},
	{
		type: 'draw_picture',
		title: 'Draw a Picture',
		description:
			"Express yourself through art! Draw a picture of something that inspires you or represents your journey so far. Don't worry about being perfect - it's all about having fun and sharing your creativity!"
	},
	{
		type: 'describe_text',
		title: 'Share your Thoughts',
		description:
			'As you complete the quest, share your thoughts and experiences in the app to connect with others.',
		reward: 25
	},
	{
		type: 'order_items',
		title: 'Put in Order',
		description:
			"Arrange items in the correct order related to the Quest. It's a fun way to test your understanding and see how well you've grasped the concepts on your journey!",
		parameters: [['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']]
	},
	{
		type: 'article_quiz',
		title: 'Read an Article',
		description:
			'Expand your horizons by reading an article in the app. It could be about anything - nature, science, philosophy, or even a story from another user! New articles publish every few hours and old ones auto-archive after 2 weeks, so the catalog stays fresh.',
		reward: 50
	},
	{
		type: 'attend_event',
		title: 'Join an Event',
		description:
			'Participate in an event to meet other explorers and share your passion for the Earth. It could be a local cleanup, a virtual discussion, or anything in between! Events stay listed for 30 days after they end, so RSVP early to lock your spot.'
	},
	{
		type: 'take_photo_objects',
		title: 'Take another Photo',
		description:
			"Now that you've explored a bit, take a photo of something that represents your journey so far!",
		reward: 25
	},
	{
		type: 'scan_barcode',
		title: 'Scan a Barcode',
		description:
			"Scan a barcode from the world around you. Quests can ask for books, music, food, beauty or pet items, a household product, a vehicle's VIN, or a boarding pass — a quick way to turn everyday objects and trips into part of your journey.",
		reward: 25
	},
	{
		type: 'match_terms',
		title: 'Match the Terms',
		description:
			"Test your knowledge by matching terms related to the Quest and its wonders. It's a fun way to learn and see how much you've discovered on your journey!",
		parameters: [
			'Match these words to their definitions!',
			[
				['Biodiversity', 'The variety of life in the world or in a particular habitat.'],
				['Ecosystem', 'A community of interacting organisms and their physical environment.'],
				[
					'Sustainability',
					'Meeting our own needs without compromising the ability of future generations to meet theirs.'
				],
				[
					'Climate Change',
					"A long-term change in the earth's climate, especially a change due to an increase in the average atmospheric temperature."
				],
				['Leadership', 'The action of leading a group of people or an organization.'],
				[
					'Community',
					'A group of people living in the same place or having a particular characteristic in common.'
				],
				['Environment', 'The natural world and the conditions that affect it.'],
				[
					'Conservation',
					'The action of conserving something, in particular, the environment or natural resources.'
				],
				['Service', 'The action of helping or doing work for someone.']
			]
		],
		reward: 75
	},
	{
		type: 'other' as any,
		title: 'Create an Account',
		description:
			'The Earth App compiles all of these activities into Quests that you can complete to earn rewards and show off your achievements. Sign up for an account to start your quest and track your progress!'
	}
];

const { getStepIcon } = useQuests();

function isCurrentStep(index: number) {
	return currentIndex.value === index;
}

const items = computed(() => {
	return steps.map((step, index) => ({
		...step,
		icon: getStepIcon(step.type),
		index,
		completed: currentIndex.value > index
	}));
});

// Start at -1 so the top button correctly shows "Click Me!" on first render
const currentIndex = ref(-1);
const stepOpen = ref(false);
// Tracks which step index the modal is showing content for
const activeStepIndex = ref<number | null>(null);
const activeStep = computed(() =>
	activeStepIndex.value !== null ? steps[activeStepIndex.value] : null
);

function openStepModal(index: number) {
	if (!isCurrentStep(index)) return;
	activeStepIndex.value = index;
	stepOpen.value = true;
}

function onCapture(file: File) {
	if (activeStepIndex.value === null) return;
	currentBlobs.value[activeStepIndex.value] = file;

	currentBlobs.value = [...currentBlobs.value];
	stepOpen.value = false;
	activeStepIndex.value = null;
	next();
}

function onModalSubmitted() {
	stepOpen.value = false;
	activeStepIndex.value = null;
	next();
}

function scrollToCurrentStep(index: number) {
	const stepEl = document.getElementById(`tile-${index}`);
	if (!stepEl) return;

	// Try the parent-provided modal scroll container first, then fall back to scrollIntoView
	const onboardingModalContent = document.getElementById('onboarding-modal-content');
	const modalContent = onboardingModalContent?.shadowRoot?.querySelector<HTMLElement>(
		'div.inner-scroll.scroll-y'
	);

	if (modalContent) {
		modalContent.scrollTo({
			top: stepEl.offsetTop - modalContent.offsetTop - 80,
			behavior: 'smooth'
		});
	} else {
		window.scrollTo({
			top: stepEl.offsetTop - 80,
			behavior: 'smooth'
		});
	}
}

function next() {
	stepOpen.value = false;

	if (currentIndex.value >= steps.length - 1) {
		emit('done');
		return;
	}

	currentIndex.value++;
	emit('next', steps[currentIndex.value]!);

	// Defer scroll until after the DOM updates for the new active step
	nextTick(() => {
		scrollToCurrentStep(currentIndex.value);
	});
}

const currentBlobs = ref<(File | undefined)[]>(Array(steps.length).fill(undefined));
const currentImages = ref<(string | undefined)[]>(Array(steps.length).fill(undefined));

watch(
	currentBlobs,
	(blobs) => {
		// Revoke previous object URLs to avoid memory leaks
		currentImages.value.forEach((url) => {
			if (url) URL.revokeObjectURL(url);
		});
		currentImages.value = blobs.map((file) => (file ? URL.createObjectURL(file) : undefined));
	},
	{ deep: true }
);

onUnmounted(() => {
	currentImages.value.forEach((url) => {
		if (url) URL.revokeObjectURL(url);
	});
});
</script>
