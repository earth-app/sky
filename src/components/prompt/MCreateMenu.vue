<template>
	<div class="flex flex-col size-full">
		<div class="flex flex-col items-center w-full p-4">
			<IonTextarea
				label="Prompt"
				label-placement="floating"
				required
				fill="solid"
				v-model="prompt"
				placeholder="What is the meaning of life?"
				:minlength="1"
				:maxlength="256"
			/>

			<IonSelect
				label="Visibility"
				label-placement="fixed"
				required
				fill="solid"
				placeholder="Select Prompt Visibility"
				justify="start"
				v-model="visibility"
			>
				<IonSelectOption
					v-for="option in visibilityOptions"
					:key="option.ordinal"
					:value="option.name"
				>
					{{ capitalizeFully(option.name) }}
				</IonSelectOption>
			</IonSelect>

			<IonButton
				class="mt-4"
				color="primary"
				@click="newPrompt"
				:disabled="
					disabled ||
					loading ||
					newDisabled ||
					prompt.trim().length < 10 ||
					prompt.trim().length > 256
				"
				:loading="loading"
			>
				<UIcon
					name="mdi:plus"
					class="size-5 mr-2"
				/>
				Create</IonButton
			>

			<span class="opacity-90 font-semibold! my-2 text-sm!">{{ leftCount }}</span>

			<div
				v-if="error"
				class="text-red-500 mt-2"
			>
				{{ error }}
			</div>
		</div>

		<IonModal
			:is-open="premiumOpen"
			@did-dismiss="premiumOpen = false"
		>
			<IonHeader>
				<IonToolbar class="px-2">
					<IonTitle>Upgrade to Submit more Prompts</IonTitle>
					<IonButtons slot="end">
						<IonButton
							fill="clear"
							color="danger"
							@click="premiumOpen = false"
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
				<div class="p-4">
					<MRanks highlighted="WRITER" />
				</div>
			</IonContent>
		</IonModal>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { com } from '@earth-app/ocean';

const emit = defineEmits<{
	(event: 'prompt-created', prompt: Prompt): void;
}>();

const { user, fetchUser } = useAuth();
const total = ref(0);
const premiumOpen = ref(false);

const limit = computed(() => {
	switch (user.value?.account.account_type) {
		case 'ADMINISTRATOR':
			return Infinity;
		case 'ORGANIZER':
		case 'WRITER':
			return 10;
		default:
			return 1;
	}
});

const leftCount = computed(() => {
	const left = limit.value - total.value;
	if (left <= 0) return 'None left';
	if (left === Infinity) return 'Unlimited left';
	return `${left} left`;
});

const newDisabled = computed(() => total.value >= limit.value);

onMounted(async () => {
	await fetchUser(); // ensure user is loaded
	if (!user.value) return;
	const { total: total0 } = useUserPrompts(user.value.id);
	total.value = total0.value;
});

const loading = ref(false);
const disabled = ref(true);
const prompt = ref<string>('');

const visibility = ref<typeof com.earthapp.Visibility.prototype.name>(
	com.earthapp.Visibility.PUBLIC.name
);
const visibilityOptions = com.earthapp.Visibility.values();

const error = ref('');

async function newPrompt() {
	if (!user) {
		await Toast.show({
			text: 'You must be logged in to create a prompt!',
			duration: 'long'
		});
		return;
	}

	const text = prompt.value.trim();

	if (!text) {
		await Toast.show({
			text: 'Prompt cannot be empty.',
			duration: 'long'
		});
		return;
	}

	if (text.length < 10 || text.length > 100) {
		await Toast.show({
			text: 'Prompt must be between 10 and 100 characters.',
			duration: 'long'
		});
		return;
	}

	try {
		loading.value = true;

		const promptStore = usePromptStore();
		const res = await promptStore.createPrompt({
			title: text,
			description: text,
			visibility: visibility.value
		});
		if (res.success && res.data) {
			if ('message' in res.data) {
				await Toast.show({
					text: res.data.message || 'Failed to create prompt.',
					duration: 'long'
				});
				return;
			}

			loading.value = false;

			await Toast.show({
				text: 'Prompt created successfully!',
				duration: 'long'
			});

			emit('prompt-created', res.data);
		} else {
			await Toast.show({
				text: res.message || 'Failed to create prompt.',
				duration: 'long'
			});
		}
	} catch (error) {
		await Toast.show({
			text: 'An error occurred while creating the prompt.',
			duration: 'long'
		});
	}
}
</script>
