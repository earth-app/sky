<template>
	<IonModal
		:is-open="open"
		:can-dismiss="canDismiss"
		@did-dismiss="handleDidDismiss"
		:initial-breakpoint="1"
		:breakpoints="[0, 1]"
	>
		<IonContent class="ion-padding">
			<div class="flex flex-col items-center pt-4 gap-4 max-w-md mx-auto">
				<UIcon
					name="mdi:format-size"
					class="size-12 text-primary"
				/>
				<h2 class="text-xl font-semibold m-0! text-center">How does this Look?</h2>
				<p class="text-sm text-center text-gray-700 dark:text-gray-200">
					Pick a text size that's comfortable for you. You can change this anytime in Settings.
				</p>

				<div
					class="w-full flex flex-col gap-3 mt-2"
					role="radiogroup"
					aria-label="Text size"
				>
					<button
						v-for="option in options"
						:key="option.value"
						type="button"
						role="radio"
						:aria-checked="selected === option.value"
						class="w-full text-left p-4! rounded-xl! border-2! transition-colors"
						:class="
							selected === option.value
								? 'border-primary! bg-primary/10'
								: 'border-gray-300! dark:border-gray-600! active:bg-gray-100! dark:active:bg-gray-800!'
						"
						@click="select(option.value)"
					>
						<div
							class="font-semibold text-gray-900 dark:text-gray-100"
							:style="{ fontSize: previewSize(option.value) }"
						>
							{{ option.title }}
						</div>
						<div
							class="text-gray-700 dark:text-gray-300 mt-1"
							:style="{ fontSize: previewBodySize(option.value) }"
						>
							{{ option.preview }}
						</div>
					</button>
				</div>

				<IonButton
					expand="block"
					color="success"
					class="w-full mt-4"
					@click="confirm"
				>
					<UIcon
						name="mdi:check"
						class="size-5 mr-2"
					/>
					Looks Good
				</IonButton>
				<IonButton
					expand="block"
					fill="clear"
					color="medium"
					size="small"
					@click="skip"
				>
					Skip for Now
				</IonButton>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';

const PREF_KEY = 'sky:has-seen-text-size-prompt';

const props = defineProps<{
	autoOpen?: boolean;
}>();

const emit = defineEmits<{
	closed: [];
}>();

const open = ref(false);
const canDismiss = ref(true);

const { settings, setValue: setAppSetting } = useAppSettings();

type ScaleValue = '0.8' | '1.0' | '1.2' | '1.5';

const options: { value: ScaleValue; title: string; preview: string }[] = [
	{
		value: '0.8',
		title: 'Small',
		preview: 'Smaller text for a more compact view.'
	},
	{
		value: '1.0',
		title: 'Normal',
		preview: 'Default size. Best for most users.'
	},
	{
		value: '1.2',
		title: 'Large',
		preview: 'A bit bigger; easier on the eyes.'
	},
	{
		value: '1.5',
		title: 'Extra Large',
		preview: 'Maximum readability.'
	}
];

const selected = ref<ScaleValue>('1.0');

function previewSize(value: ScaleValue) {
	const base = 16;
	return `${base * Number(value)}px`;
}
function previewBodySize(value: ScaleValue) {
	const base = 13;
	return `${base * Number(value)}px`;
}

function select(value: ScaleValue) {
	selected.value = value;
	void setAppSetting('scale', value);
}

async function confirm() {
	await Preferences.set({ key: PREF_KEY, value: 'true' }).catch(() => {});
	open.value = false;
}

async function skip() {
	await Preferences.set({ key: PREF_KEY, value: 'true' }).catch(() => {});
	open.value = false;
}

let closedEmitted = false;
function handleDidDismiss() {
	open.value = false;
	if (closedEmitted) return;
	closedEmitted = true;
	emit('closed');
}

async function maybeOpen() {
	try {
		const { value } = await Preferences.get({ key: PREF_KEY });
		if (value === 'true') {
			emit('closed');
			return;
		}
	} catch {
		// preferences read failed, open anyway, the prompt is cheap to dismiss
	}

	// seed with whatever the user already has (or normal)
	const current = settings.value.scale;
	selected.value = current;

	open.value = true;
}

defineExpose({ maybeOpen });

onMounted(() => {
	if (props.autoOpen) void maybeOpen();
});
</script>
