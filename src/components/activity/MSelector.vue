<template>
	<div :class="wrapperClass">
		<IonButton
			type="button"
			class="w-full"
			color="medium"
			expand="block"
			:disabled="disabled"
			@click="openModal"
		>
			<UIcon
				name="mdi:playlist-edit"
				class="size-5 mr-2"
			/>
			<span>{{ buttonText }}</span>
		</IonButton>

		<p
			v-if="selectedSummary"
			class="mt-2 text-sm text-gray-500"
		>
			{{ selectedSummary }}
		</p>

		<IonModal
			:is-open="modalOpen"
			@didDismiss="closeModal"
		>
			<IonHeader>
				<IonToolbar>
					<IonButtons slot="start">
						<IonButton @click="cancelChanges">Cancel</IonButton>
					</IonButtons>
					<IonTitle class="text-center">Select Activities</IonTitle>
					<IonButtons slot="end">
						<IonButton @click="confirmChanges">Done</IonButton>
					</IonButtons>
				</IonToolbar>
				<IonToolbar>
					<IonSearchbar @ionInput="handleSearch" />
				</IonToolbar>
			</IonHeader>

			<IonContent
				color="dark"
				class="ion-padding"
			>
				<IonList
					class="rounded-xl!"
					inset
				>
					<IonItem v-if="activitiesLoading">
						<IonSpinner
							name="crescent"
							class="mr-2"
						/>
						<IonLabel>Loading activities...</IonLabel>
					</IonItem>
					<IonItem
						v-for="activity in filteredActivities"
						:key="activity.value"
					>
						<IonCheckbox
							:value="activity.value"
							:checked="isChecked(activity.value)"
							@ionChange="handleCheckboxChange($event)"
						>
							<div class="flex items-center gap-2 mx-2">
								<UIcon
									:name="activity.icon"
									class="size-5"
								/>
								<span>{{ activity.label }}</span>
							</div>
						</IonCheckbox>
					</IonItem>
					<IonItem v-if="!activitiesLoading && filteredActivities.length === 0">
						<IonLabel>No activities found.</IonLabel>
					</IonItem>
				</IonList>
			</IonContent>
		</IonModal>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';
import { com } from '@earth-app/ocean';
import type { Activity } from 'types/activity';
import { capitalizeFully } from 'utils';

type ActivityItem = {
	label: string;
	value: string;
	icon: string;
	isActivityType?: boolean;
};

const props = defineProps<{
	modelValue: string[] | Activity[];
	class?: string;
	disabled?: boolean;
	maxActivities?: number;
	includeActivityTypes?: boolean;
	buttonText?: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string[]];
}>();

const { selection } = useAppHaptics();
const wrapperClass = computed(() => props.class || 'w-full');
const buttonText = computed(() => props.buttonText || 'Select activities');
const maxActivities = computed(() => props.maxActivities || 10);

const modalOpen = ref(false);
const activitiesLoading = ref(false);
const searchTerm = ref('');
const { user } = useAuth();
const allActivities = ref<ActivityItem[]>([]);
const committedSelection = ref<string[]>([]);
const workingSelection = ref<string[]>([]);

// populate allActivities with user's activities
onMounted(() => {
	if (user.value) {
		const userActivities = user.value.activities || [];
		const items = userActivities.map((activity) => toActivityItem(activity));
		mergeActivityItems(items, true);
	}
});

const activityTypes = computed<ActivityItem[]>(() => {
	if (!props.includeActivityTypes) return [];

	return com.earthapp.activity.ActivityType.values().map((type) => ({
		label: capitalizeFully(type.name.toString().replace(/_/g, ' ')),
		value: type.name.toString(),
		icon: 'mdi:tag-outline',
		isActivityType: true
	}));
});

const filteredActivities = computed(() => {
	const query = searchTerm.value.trim().toLowerCase();
	if (!query) return allActivities.value;

	return allActivities.value.filter((activity) => activity.label.toLowerCase().includes(query));
});

const selectedSummary = computed(() => {
	if (committedSelection.value.length === 0) return '';

	const labels = committedSelection.value
		.map((value) => allActivities.value.find((activity) => activity.value === value)?.label)
		.filter((label): label is string => Boolean(label));

	if (labels.length === 0) {
		return `${committedSelection.value.length} selected`;
	}

	if (labels.length <= 2) {
		return labels.join(', ');
	}

	return `${labels.slice(0, 2).join(', ')} + ${labels.length - 2} more`;
});

function normalizeSelection(value: string[] | Activity[]): string[] {
	if (!Array.isArray(value) || value.length === 0) return [];

	if (typeof value[0] === 'string') {
		return [...new Set(value as string[])].filter(Boolean);
	}

	return [...new Set((value as Activity[]).map((activity) => activity.id).filter(Boolean))];
}

function toActivityItem(activity: Activity): ActivityItem {
	return {
		label: activity.name,
		value: activity.id,
		icon: activity.fields?.['icon'] || 'material-symbols:activity-zone'
	};
}

function mergeActivityItems(items: ActivityItem[], beginning = false) {
	const merged = beginning
		? [...items, ...activityTypes.value, ...allActivities.value]
		: [...activityTypes.value, ...allActivities.value, ...items];
	allActivities.value = [...new Map(merged.map((activity) => [activity.value, activity])).values()];
}

async function loadActivities(search: string) {
	activitiesLoading.value = true;
	searchTerm.value = search;

	try {
		const { fetchAll } = useActivities();
		const res = await fetchAll(-1, search);

		if (res.success) {
			const fetched = (res.data || []).map((activity: Activity) => toActivityItem(activity));
			mergeActivityItems(fetched);
		} else {
			await Toast.show({
				text: res.message || 'Failed to fetch activities.',
				duration: 'long'
			});
		}
	} catch (error: any) {
		await Toast.show({
			text: error?.message || 'Failed to fetch activities.',
			duration: 'long'
		});
	} finally {
		activitiesLoading.value = false;
	}
}

function syncSelectionFromModel() {
	const selection = normalizeSelection(props.modelValue);
	committedSelection.value = selection;

	if (!modalOpen.value) {
		workingSelection.value = [...selection];
	}

	const selectedItems = selection
		.map((value) => allActivities.value.find((activity) => activity.value === value))
		.filter((activity): activity is ActivityItem => Boolean(activity));

	if (selectedItems.length !== selection.length) {
		mergeActivityItems(selectedItems);
	}
}

watch(
	() => props.modelValue,
	() => {
		syncSelectionFromModel();
	},
	{ deep: true, immediate: true }
);

watch(modalOpen, (open) => {
	if (open) {
		workingSelection.value = [...committedSelection.value];
		if (allActivities.value.length === 0) {
			void loadActivities('');
		}
	}
});

watch(
	() => props.includeActivityTypes,
	() => {
		mergeActivityItems([]);
	}
);

onMounted(() => {
	mergeActivityItems([]);
	if (committedSelection.value.length > 0) {
		void loadActivities('');
	}
});

function openModal() {
	if (props.disabled) return;

	searchTerm.value = '';
	modalOpen.value = true;
}

function closeModal() {
	modalOpen.value = false;
	searchTerm.value = '';
	workingSelection.value = [...committedSelection.value];
}

function cancelChanges() {
	closeModal();
}

async function confirmChanges() {
	if (workingSelection.value.length > maxActivities.value) {
		await Toast.show({
			text: `You can only select up to ${maxActivities.value} activities.`,
			duration: 'long'
		});
		return;
	}

	committedSelection.value = [...workingSelection.value];
	emit('update:modelValue', [...committedSelection.value]);
	closeModal();
}

function isChecked(value: string): boolean {
	return workingSelection.value.includes(value);
}

async function handleSearch(event: Event) {
	const customEvent = event as CustomEvent<{ value?: string | null }>;
	const target = event.target as HTMLInputElement | null;
	const value = (customEvent.detail?.value ?? target?.value ?? '').toString();

	await loadActivities(value);
}

async function handleCheckboxChange(event: CustomEvent<{ checked: boolean; value: string }>) {
	const { checked, value } = event.detail;
	if (!value) return;

	const nextSelection = new Set(workingSelection.value);

	if (checked) {
		if (!nextSelection.has(value) && nextSelection.size >= maxActivities.value) {
			await Toast.show({
				text: `You can only select up to ${maxActivities.value} activities.`,
				duration: 'long'
			});
			return;
		}

		nextSelection.add(value);
	} else {
		nextSelection.delete(value);
	}

	workingSelection.value = [...nextSelection];
	selection();
}
</script>
