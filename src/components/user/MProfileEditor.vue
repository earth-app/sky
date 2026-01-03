<template>
	<div class="flex flex-col justify-center">
		<div class="flex items-center justify-center mb-4">
			<UAvatar
				:src="avatar"
				alt="Profile Avatar"
				class="size-20 mr-4 shadow-lg shadow-black/30 light:shadow-black/40 rounded-full"
			/>
			<IonButton
				class="font-semibold text-center"
				color="primary"
				:disabled="avatarLoading"
				@click="regenerateProfilePhoto"
			>
				<UIcon
					name="mdi:refresh"
					class="size-5 mr-2"
					:class="{ 'animate-spin': avatarLoading }"
				/>
				Regenerate Avatar
			</IonButton>
		</div>
		<IonList class="w-full mb-4">
			<IonItem>
				<IonSelect
					label="Visibility"
					label-placement="fixed"
					fill="solid"
					placeholder="Select Account Visibility"
					justify="start"
					v-model="state.visibility"
				>
					<IonSelectOption
						v-for="option in com.earthapp.Visibility.values()"
						:key="option.ordinal"
						:value="option.name"
					>
						{{ capitalizeFully(option.name) }}
					</IonSelectOption>
				</IonSelect>
			</IonItem>
			<IonItem>
				<IonInput
					type="text"
					label="First Name"
					label-placement="fixed"
					placeholder="Enter your first name"
					v-model="state.first_name"
					:minlength="3"
					:maxlength="50"
					autocapitalize="on"
				/>
			</IonItem>
			<IonItem>
				<IonInput
					type="text"
					label="Last Name"
					label-placement="fixed"
					placeholder="Enter your last name"
					v-model="state.last_name"
					:minlength="3"
					:maxlength="50"
					autocapitalize="on"
				/>
			</IonItem>
			<IonItem>
				<IonInput
					type="text"
					label="Username"
					label-placement="fixed"
					placeholder="Enter your username"
					v-model="state.username"
					:minlength="3"
					:maxlength="30"
					autocapitalize="off"
				/>
			</IonItem>
			<IonItem>
				<IonTextarea
					label="Bio"
					label-placement="fixed"
					placeholder="Enter your bio"
					v-model="state.bio"
					:maxlength="160"
					auto-grow
				/>
			</IonItem>
			<IonItem>
				<IonInput
					type="text"
					label="Address"
					label-placement="fixed"
					placeholder="Enter your address"
					v-model="state.address"
					:maxlength="100"
					autocapitalize="on"
				/>
			</IonItem>
			<IonItem>
				<IonSelect
					label="Country"
					label-placement="fixed"
					fill="solid"
					placeholder="Select your country"
					justify="start"
					v-model="state.country"
				>
					<IonSelectOption
						v-for="country in com.earthapp.account.Country.values()"
						:key="country.ordinal"
						:value="country.code"
					>
						{{ country.flagEmoji }} {{ country.countryName }}
					</IonSelectOption>
				</IonSelect>
			</IonItem>
		</IonList>
		<h2 class="text-lg! mb-4 text-center font-semibold!">Activities</h2>
		<IonList class="w-full">
			<IonItem
				button
				id="select-activities-trigger"
			>
				<IonLabel>Select Activities</IonLabel>
				<div
					slot="end"
					class="text-sm text-gray-500"
				>
					{{ selectedActivitiesText }}
				</div>
			</IonItem>
		</IonList>

		<IonModal
			trigger="select-activities-trigger"
			ref="activitiesModal"
		>
			<IonHeader>
				<IonToolbar>
					<IonButtons slot="start">
						<IonButton @click="cancelActivityChanges">Cancel</IonButton>
					</IonButtons>
					<IonTitle>Select Activities</IonTitle>
					<IonButtons slot="end">
						<IonButton @click="confirmActivityChanges">Done</IonButton>
					</IonButtons>
				</IonToolbar>
				<IonToolbar>
					<IonSearchbar @ionInput="handleActivitySearch" />
				</IonToolbar>
			</IonHeader>

			<IonContent
				color="dark"
				class="ion-padding"
			>
				<IonList
					id="activity-modal-list"
					inset
				>
					<IonItem
						v-for="activity in filteredActivities"
						:key="activity.value"
					>
						<IonCheckbox
							:value="activity.value"
							:checked="isActivityChecked(activity.value)"
							@ionChange="handleActivityCheckboxChange($event)"
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
				</IonList>
			</IonContent>
		</IonModal>
	</div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import type { Activity } from '@earth-app/crust/src/shared/types/activity';
import type { User } from '@earth-app/crust/src/shared/types/user';
import { capitalizeFully } from '@earth-app/crust/src/shared/util';
import { com } from '@earth-app/ocean';
import type { IonModal } from '@ionic/vue';

const props = defineProps<{
	user: User;
}>();

const { avatar: oldAvatar, fetchUser } = useUser(props.user.id);

// Profile Photo

const avatarLoading = ref(false);
const avatarOverride = ref<string | null>(null);

const avatar = computed(() => avatarOverride.value || oldAvatar.value || undefined);

onBeforeUnmount(() => {
	if (avatarOverride.value && avatarOverride.value.startsWith('blob:')) {
		URL.revokeObjectURL(avatarOverride.value);
	}
});

async function regenerateProfilePhoto() {
	const yes = await Dialog.confirm({ message: 'Are you sure? You cannot revert this action.' });
	if (!yes.value) return;

	avatarLoading.value = true;

	const res = await regenerateAvatar();
	if (res.success && res.data && res.data instanceof Blob) {
		if (avatarOverride.value && avatarOverride.value.startsWith('blob:')) {
			URL.revokeObjectURL(avatarOverride.value);
		}

		avatarOverride.value = URL.createObjectURL(res.data);
		fetchUser();

		avatarLoading.value = false;
		await Toast.show({
			text: 'Your profile photo has been successfully regenerated.',
			duration: 'long'
		});
	} else {
		avatarLoading.value = false;
		console.error(res.message || 'Failed to regenerate profile photo.');

		await Toast.show({
			text: res.message || 'Failed to regenerate profile photo.',
			duration: 'long'
		});
	}
}

// Fields

const state = reactive<Partial<User['account']>>({
	visibility: props.user.account.visibility || 'UNLISTED',
	first_name: props.user.account.first_name || '',
	last_name: props.user.account.last_name || '',
	username: props.user.account.username || '',
	bio: props.user.account.bio || '',
	address: props.user.account.address || '',
	country: props.user.account.country || '',
	phone_number: props.user.account.phone_number || 0
});

function sanitize(obj: Partial<User['account']>): Partial<User['account']> {
	return {
		first_name: obj.first_name ? obj.first_name?.trim() || '' : undefined,
		last_name: obj.last_name ? obj.last_name?.trim() || '' : undefined,
		username: obj.username ? obj.username?.trim() || '' : undefined,
		bio: obj.bio ? obj.bio?.trim() || '' : undefined,
		email: obj.email ? obj.email?.trim() || '' : undefined,
		address: obj.address ? obj.address?.trim() || '' : undefined,
		country: obj.country ? obj.country?.trim() || '' : undefined,
		phone_number: obj.phone_number ? obj.phone_number : undefined,
		visibility: obj.visibility
	};
}

watch(state, async (newState, oldState) => {
	const res = await updateAccount(sanitize(newState));
	if (!res.success) {
		console.error(res.data?.message || res.message || 'Failed to update profile.');
		Object.assign(state, oldState);

		await Toast.show({
			text: res.data?.message || res.message || 'Failed to update profile.',
			duration: 'long'
		});
	}

	await Toast.show({
		text: 'Profile updated successfully.',
		duration: 'short'
	});
});

// Activities

const allActivities = ref<{ label: string; value: string; icon: string; disabled?: boolean }[]>([]);
const currentActivities = ref<{ label: string; value: string; icon: string }[]>([]);
const filteredActivities = ref<{ label: string; value: string; icon: string }[]>([]);
const workingSelectedActivities = ref<string[]>([]);

const activitiesSearch = ref<string>('');
const activitiesLoading = ref(false);
const activitiesModal = ref<InstanceType<typeof IonModal>>();

const selectedActivitiesText = computed(() => {
	const count = currentActivities.value.length;
	if (count === 0) return '0 Items';
	if (count === 1) return currentActivities.value[0]?.label || '1 Item';
	return `${count} Items`;
});

onMounted(() => {
	// initialize current activities from user data
	if (props.user.activities) {
		const current = props.user.activities
			.map((userActivity) => {
				return {
					label: userActivity.name,
					value: userActivity.id,
					icon: userActivity.fields['icon'] || 'material-symbols:activity-zone'
				};
			})
			.filter(Boolean);

		allActivities.value = current;
		currentActivities.value = current;
		filteredActivities.value = current;
		workingSelectedActivities.value = current.map((a) => a.value);
	}

	// then fetch all activities
	updateActivitiesList(activitiesSearch.value);
});

watch(
	() => props.user?.activities,
	(newActivities) => {
		if (newActivities && allActivities.value.length > 0) {
			currentActivities.value = newActivities.map((activity) => {
				return {
					label: activity.name,
					value: activity.id,
					icon: activity.fields['icon'] || 'material-symbols:activity-zone'
				};
			});
			workingSelectedActivities.value = currentActivities.value.map((a) => a.value);
		}
	},
	{ deep: true }
);

function updateActivitiesList(search: string) {
	activitiesSearch.value = search;
	activitiesLoading.value = true;

	getAllActivities(-1, activitiesSearch.value).then((res) => {
		if (res.success) {
			const activities =
				res.data?.map((activity: Activity) => {
					return {
						label: activity.name,
						value: activity.id,
						icon: activity.fields['icon'] || 'material-symbols:activity-zone'
					};
				}) || [];

			allActivities.value = allActivities.value
				.concat(activities)
				.filter(
					(activity, index, self) => index === self.findIndex((a) => a.value === activity.value)
				); // Remove duplicates

			filterActivitiesList(activitiesSearch.value);
			activitiesLoading.value = false;
		} else {
			console.error(res.data?.message || res.message || 'Failed to fetch activities.');

			Toast.show({
				text: res.data?.message || res.message || 'Failed to fetch activities.',
				duration: 'long'
			});

			allActivities.value = [];
		}
	});
}

function filterActivitiesList(searchQuery: string | undefined) {
	if (searchQuery === undefined || searchQuery.trim() === '') {
		filteredActivities.value = [...allActivities.value];
	} else {
		const normalizedQuery = searchQuery.toLowerCase();
		filteredActivities.value = allActivities.value.filter((activity) =>
			activity.label.toLowerCase().includes(normalizedQuery)
		);
	}
}

function handleActivitySearch(event: Event) {
	const inputElement = event.target as HTMLInputElement;
	const searchValue = inputElement.value;

	// Filter local list first for immediate feedback
	filterActivitiesList(searchValue);

	// Then fetch from server for more results
	updateActivitiesList(searchValue);
}

function isActivityChecked(value: string): boolean {
	return workingSelectedActivities.value.includes(value);
}

function handleActivityCheckboxChange(event: CustomEvent<{ checked: boolean; value: string }>) {
	const { checked, value } = event.detail;

	if (checked) {
		workingSelectedActivities.value = [...workingSelectedActivities.value, value];
	} else {
		workingSelectedActivities.value = workingSelectedActivities.value.filter(
			(item) => item !== value
		);
	}
}

function cancelActivityChanges() {
	// Reset working selection to current selection
	workingSelectedActivities.value = currentActivities.value.map((a) => a.value);
	activitiesModal.value?.$el?.dismiss();
}

async function confirmActivityChanges() {
	if (workingSelectedActivities.value.length === 0) {
		activitiesModal.value?.$el?.dismiss();
		return;
	}

	if (workingSelectedActivities.value.length > 10) {
		await Toast.show({
			text: 'You can only select up to 10 activities.',
			duration: 'long'
		});
		return;
	}

	const res = await setUserActivities(workingSelectedActivities.value);

	if (res.success && res.data && 'activities' in res.data) {
		props.user.activities = res.data.activities;

		currentActivities.value = res.data.activities.map((activity: Activity) => ({
			label: activity.name,
			value: activity.id,
			icon: activity.fields['icon'] || 'material-symbols:activity-zone'
		}));

		await Toast.show({
			text: 'Your activities have been successfully updated.',
			duration: 'long'
		});

		activitiesModal.value?.$el?.dismiss();
	} else {
		console.error(res.data?.message || res.message || 'Failed to update activities.');

		await Toast.show({
			text: res.data?.message || res.message || 'Failed to update activities.',
			duration: 'long'
		});
	}
}
</script>
