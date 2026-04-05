<template>
	<div class="flex flex-col justify-center w-full pb-8">
		<div class="flex items-center justify-center mb-4 mt-2 px-3">
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

		<div class="flex flex-col items-center w-full px-3">
			<h2 class="text-lg! mb-2 text-center font-semibold!">Profile</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
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
							v-for="option in visibilityOptions"
							:key="option.ordinal"
							:value="option.name"
						>
							{{ capitalizeFully(option.name) }}
						</IonSelectOption>
					</IonSelect>
				</IonItem>
				<IonItem>
					<IonInput
						type="email"
						label="Email"
						label-placement="fixed"
						placeholder="me@example.com"
						v-model="state.email"
						autocapitalize="off"
						autocomplete="email"
					/>
				</IonItem>
				<IonItem>
					<IonInput
						type="text"
						label="First Name"
						label-placement="fixed"
						placeholder="Enter your first name"
						v-model="state.first_name"
						:minlength="2"
						:maxlength="50"
						autocapitalize="words"
					/>
				</IonItem>
				<IonItem>
					<IonInput
						type="text"
						label="Last Name"
						label-placement="fixed"
						placeholder="Enter your last name"
						v-model="state.last_name"
						:minlength="2"
						:maxlength="50"
						autocapitalize="words"
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
						autocomplete="username"
					/>
				</IonItem>
				<IonItem>
					<IonTextarea
						label="Bio"
						label-placement="fixed"
						placeholder="Tell us about yourself"
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
						autocapitalize="words"
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
							v-for="country in countries"
							:key="country.ordinal"
							:value="country.code"
						>
							{{ country.flagEmoji }} {{ country.countryName }}
						</IonSelectOption>
					</IonSelect>
				</IonItem>
				<IonItem lines="none">
					<IonButton
						expand="block"
						class="w-full"
						color="success"
						:disabled="savingProfile || !hasProfileChanges"
						@click="saveProfile"
					>
						<UIcon
							name="mdi:content-save-outline"
							class="mr-2"
						/>
						{{ savingProfile ? 'Saving...' : 'Save Profile' }}
					</IonButton>
				</IonItem>
			</IonList>

			<h2 class="text-lg! mt-6 mb-2 text-center font-semibold!">Email Verification</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
				<IonItem>
					<IonLabel>
						<h3 class="font-semibold">Status</h3>
						<p>{{ emailVerificationStatus }}</p>
					</IonLabel>
					<IonButton
						slot="end"
						size="small"
						:disabled="requestingVerification || props.user.account.email_verified"
						@click="requestEmailVerification"
					>
						<span class="p-1">{{ requestingVerification ? 'Sending...' : 'Verify' }}</span>
					</IonButton>
				</IonItem>
			</IonList>

			<h2 class="text-lg! mt-6 mb-2 text-center font-semibold!">Field Privacy</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
				<IonItem
					v-for="item in fieldPrivacyItems"
					:key="item.key"
				>
					<IonSelect
						:label="item.label"
						label-placement="start"
						interface="popover"
						fill="solid"
						justify="space-between"
						:value="fieldPrivacyState[item.key]"
						:disabled="fieldPrivacyLoading[item.key]"
						@ionChange="handleFieldPrivacyChange(item.key, $event)"
					>
						<IonSelectOption
							v-for="option in privacyOptions"
							:key="`${item.key}-${option.ordinal}`"
							:value="option.name"
						>
							{{ capitalizeFully(option.name) }}
						</IonSelectOption>
					</IonSelect>
				</IonItem>
			</IonList>

			<h2 class="text-lg! mt-6 mb-2 text-center font-semibold!">Activities</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
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

			<h2 class="text-lg! mt-6 mb-2 text-center font-semibold!">Points Shop</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
				<IonItem lines="none">
					<div class="flex items-center justify-between w-full gap-2">
						<div class="flex items-center gap-2">
							<UIcon
								name="mdi:star-circle-outline"
								class="size-5 text-yellow-500"
							/>
							<span class="font-semibold">{{ formattedPoints }} points</span>
						</div>
						<div class="flex items-center gap-1">
							<IonButton
								fill="clear"
								size="small"
								color="medium"
								@click="toggleCosmeticsCollapsed"
							>
								<UIcon
									:name="isCosmeticsCollapsed ? 'mdi:plus' : 'mdi:minus'"
									class="size-4 mr-1"
								/>
								<span class="p-1">List</span>
							</IonButton>
							<IonButton
								fill="clear"
								size="small"
								color="medium"
								:disabled="resettingCosmetic"
								@click="resetCosmetic"
							>
								<UIcon
									name="mdi:rotate-left"
									class="size-4 mr-1"
									:class="{ 'animate-spin': resettingCosmetic }"
								/>
								<span class="p-1">Reset</span>
							</IonButton>
						</div>
					</div>
				</IonItem>
				<IonItem lines="none">
					<IonText color="medium">
						<p class="text-sm m-0">Earn points through journeys, badges, and quests.</p>
						<p class="text-xs m-0 mt-1 opacity-80">
							Impact Points increase as you engage with The Earth App and the world around you.
						</p>
					</IonText>
				</IonItem>
				<Transition name="cosmetics-collapse">
					<IonItem
						v-if="!isCosmeticsCollapsed"
						lines="none"
					>
						<div
							v-if="cosmetics.length === 0"
							class="w-full flex items-center justify-center py-4"
						>
							<IonSpinner name="crescent" />
						</div>
						<div
							v-else
							class="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full py-2"
						>
							<button
								v-for="cosmetic in cosmetics"
								:key="cosmetic.key"
								type="button"
								class="block w-full min-h-44 text-left transition-all duration-200 active:scale-95"
								:class="cosmetic.state === 'selected' ? 'ring-2 ring-green-500 rounded-xl' : ''"
								@click="handleCosmeticClick(cosmetic)"
							>
								<MCosmetic
									:cosmetic-key="cosmetic.key"
									:state="cosmetic.state"
									:rarity="cosmetic.rarity"
									:price="cosmetic.price"
								/>
							</button>
						</div>
					</IonItem>
				</Transition>
			</IonList>

			<h2 class="text-lg! mt-6 mb-2 text-center font-semibold!">OAuth Providers</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
				<IonItem
					v-for="provider in oauthProviders"
					:key="provider"
				>
					<IonLabel
						><span class="flex items-center">
							<UIcon
								:name="`logos:${provider.toLowerCase()}-icon`"
								class="size-5 mr-2"
							/>
							{{ capitalizeFully(provider) }}</span
						></IonLabel
					>
					<IonChip
						:color="isProviderLinked(provider) ? 'success' : 'medium'"
						class="mr-2 p-1.5"
					>
						<IonLabel>
							<span class="flex items-center">
								<UIcon
									:name="isProviderLinked(provider) ? 'mdi:check-circle' : 'mdi:close-circle'"
									class="size-4 mr-1"
								/>
								{{ isProviderLinked(provider) ? 'Connected' : 'Not connected' }}</span
							>
						</IonLabel>
					</IonChip>
					<IonButton
						slot="end"
						size="small"
						:color="isProviderLinked(provider) ? 'danger' : 'primary'"
						@click="handleOAuthProvider(provider)"
					>
						<span class="p-1">{{ isProviderLinked(provider) ? 'Disconnect' : 'Connect' }}</span>
					</IonButton>
				</IonItem>
			</IonList>

			<h2 class="text-lg! mt-6 mb-2 text-center font-semibold!">Notifications</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
				<IonItem>
					<IonToggle
						:checked="subscribed"
						justify="space-between"
						:disabled="subscribedLoading"
						color="secondary"
						@ionChange="handleSubscriptionToggle"
					>
						Email Notifications
					</IonToggle>
				</IonItem>
			</IonList>

			<h2 class="text-lg! mt-6 mb-2 text-center font-semibold!">Security</h2>
			<IonList
				class="w-full max-w-md p-2! rounded-xl border-2 border-black/40 light:border-gray-300"
			>
				<IonItem lines="none">
					<IonButton
						expand="block"
						color="warning"
						class="w-full"
						@click="passwordModalOpen = true"
					>
						<UIcon
							name="mdi:shield-lock"
							class="mr-2"
						/>
						Change Password
					</IonButton>
				</IonItem>
			</IonList>

			<IonList class="w-full mt-2! max-w-md p-2! rounded-xl border-2 border-red-500/50">
				<IonItem>
					<IonInput
						v-model="deletePassword"
						type="password"
						label="Current Password"
						label-placement="stacked"
						placeholder="Enter your current password"
						autocomplete="current-password"
						:disabled="deleteLoading"
					>
						<IonInputPasswordToggle slot="end" />
					</IonInput>
				</IonItem>
				<IonItem>
					<IonInput
						v-model="deleteConfirmationText"
						label="Type confirmation phrase"
						label-placement="stacked"
						:placeholder="deletePhrase"
						autocapitalize="off"
						:disabled="deleteLoading"
					/>
				</IonItem>
				<IonItem lines="none">
					<IonButton
						expand="block"
						color="danger"
						class="w-full"
						:disabled="deleteLoading || !canDeleteAccount"
						@click="handleDeleteAccount"
					>
						<UIcon
							name="mdi:account-cancel"
							class="mr-2"
						/>
						{{ deleteLoading ? 'Deleting...' : 'Delete Account' }}
					</IonButton>
				</IonItem>
			</IonList>
		</div>

		<IonModal
			:is-open="verificationModalOpen"
			@didDismiss="verificationModalOpen = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Verify Email</IonTitle>
					<IonButtons slot="end">
						<IonButton @click="verificationModalOpen = false">Close</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent class="ion-padding">
				<UserMEmailVerification @verified="handleEmailVerified" />
			</IonContent>
		</IonModal>

		<IonModal
			:is-open="passwordModalOpen"
			@didDismiss="passwordModalOpen = false"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Change Password</IonTitle>
					<IonButtons slot="end">
						<IonButton @click="passwordModalOpen = false">Close</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent class="ion-padding">
				<UserMPasswordChangeForm @changed="handlePasswordChanged" />
			</IonContent>
		</IonModal>

		<IonModal
			:is-open="showCosmeticModal"
			@didDismiss="closeCosmeticModal"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>
						{{
							selectedCosmeticForPurchase
								? capitalizeFully(selectedCosmeticForPurchase.key.replaceAll('_', ' '))
								: 'Cosmetic'
						}}
					</IonTitle>
					<IonButtons slot="end">
						<IonButton @click="closeCosmeticModal">Close</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent class="ion-padding">
				<div
					v-if="selectedCosmeticForPurchase"
					class="flex flex-col items-center gap-4"
				>
					<UserMCosmetic
						:cosmetic-key="selectedCosmeticForPurchase.key"
						state="available"
						:rarity="selectedCosmeticForPurchase.rarity"
						:price="selectedCosmeticForPurchase.price"
					/>
					<p class="text-sm text-gray-500">
						{{ formatPoints(selectedCosmeticForPurchase.price) }} points
					</p>
					<div class="flex gap-2">
						<IonButton
							v-if="selectedCosmeticForPurchase.state === 'locked'"
							color="primary"
							:disabled="selectedPurchaseLoading"
							@click="handlePurchaseClick(selectedCosmeticForPurchase.key)"
						>
							<UIcon
								name="mdi:cart"
								class="mr-2"
							/>
							{{ selectedPurchaseLoading ? 'Purchasing...' : 'Purchase' }}
						</IonButton>
						<IonButton
							v-else
							color="success"
							:disabled="selectedCosmeticForPurchase.state === 'selected' || selectedSelectLoading"
							@click="handleSelectClick(selectedCosmeticForPurchase.key)"
						>
							<UIcon
								name="mdi:check"
								class="mr-2"
							/>
							{{
								selectedSelectLoading
									? 'Applying...'
									: selectedCosmeticForPurchase.state === 'selected'
										? 'Selected'
										: 'Select'
							}}
						</IonButton>
					</div>
				</div>
			</IonContent>
		</IonModal>

		<IonModal
			trigger="select-activities-trigger"
			ref="activitiesModal"
		>
			<IonHeader>
				<IonToolbar>
					<IonButtons slot="start">
						<IonButton @click="cancelActivityChanges">Cancel</IonButton>
					</IonButtons>
					<IonTitle class="text-center">Select Activities</IonTitle>
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
					<IonItem v-if="!activitiesLoading && filteredActivities.length === 0">
						<IonLabel>No activities found.</IonLabel>
					</IonItem>
				</IonList>
			</IonContent>
		</IonModal>
	</div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import { Toast } from '@capacitor/toast';
import { com } from '@earth-app/ocean';
import type { IonModal } from '@ionic/vue';
import type { Activity } from 'types/activity';
import { OAUTH_PROVIDERS, type AvatarCosmetic, type OAuthProvider, type User } from 'types/user';
import { capitalizeFully } from 'utils';
import MCosmetic from './MCosmetic.vue';

const props = defineProps<{
	user: User;
}>();

const { avatar: oldAvatar, fetchAvatar, fetchUser, points, fetchPoints } = useUser(props.user.id);
const {
	user: authUser,
	setUserActivities,
	regenerateAvatar,
	sendVerificationEmail,
	updateAccount,
	updateFieldPrivacy,
	deleteAccount
} = useAuth();
const config = useRuntimeConfig();
const { beginFlow } = useMobileOAuth();
const {
	selection,
	impactLight,
	impactMedium,
	impactHeavy,
	notifySuccess,
	notifyWarning,
	notifyError
} = useAppHaptics();
const avatarStore = useAvatarStore();

// Profile Photo

const avatarLoading = ref(false);
const avatarOverride = ref<string | null>(null);

const avatar = computed(() => avatarOverride.value || oldAvatar.value || undefined);

const visibilityOptions = com.earthapp.Visibility.values();
const privacyOptions = com.earthapp.account.Privacy.values();
const countries = com.earthapp.account.Country.values();

type AccountState = Partial<User['account']>;
type FieldPrivacyKey =
	| 'email'
	| 'address'
	| 'phone_number'
	| 'country'
	| 'activities'
	| 'bio'
	| 'badges'
	| 'impact_points';
type FieldPrivacyValue = User['account']['field_privacy'][keyof User['account']['field_privacy']];
type ActivityOption = { label: string; value: string; icon: string; disabled?: boolean };

const fieldPrivacyItems: { key: FieldPrivacyKey; label: string }[] = [
	{ key: 'email', label: 'Email' },
	{ key: 'address', label: 'Address' },
	{ key: 'phone_number', label: 'Phone Number' },
	{ key: 'country', label: 'Country' },
	{ key: 'activities', label: 'Activities' },
	{ key: 'bio', label: 'Biography' },
	{ key: 'badges', label: 'Badges' },
	{ key: 'impact_points', label: 'Impact Points' }
];

const state = reactive<AccountState>({
	visibility: 'UNLISTED',
	email: '',
	first_name: '',
	last_name: '',
	username: '',
	bio: '',
	address: '',
	country: '',
	phone_number: 0
});

const initialProfileState = ref<AccountState>({});
const savingProfile = ref(false);

const fieldPrivacyState = reactive<Record<FieldPrivacyKey, FieldPrivacyValue>>({
	email: 'PRIVATE' as FieldPrivacyValue,
	address: 'PRIVATE' as FieldPrivacyValue,
	phone_number: 'PRIVATE' as FieldPrivacyValue,
	country: 'PRIVATE' as FieldPrivacyValue,
	activities: 'PRIVATE' as FieldPrivacyValue,
	bio: 'PRIVATE' as FieldPrivacyValue,
	badges: 'PRIVATE' as FieldPrivacyValue,
	impact_points: 'PRIVATE' as FieldPrivacyValue
});

const fieldPrivacyLoading = reactive<Record<FieldPrivacyKey, boolean>>({
	email: false,
	address: false,
	phone_number: false,
	country: false,
	activities: false,
	bio: false,
	badges: false,
	impact_points: false
});

const verificationModalOpen = ref(false);
const requestingVerification = ref(false);

const subscribed = ref(false);
const subscribedLoading = ref(false);

const passwordModalOpen = ref(false);

const deletePassword = ref('');
const deleteConfirmationText = ref('');
const deleteLoading = ref(false);

const oauthProviders = OAUTH_PROVIDERS;

const deletePhrase = computed(() => `DELETE @${props.user.username}`);
const canDeleteAccount = computed(
	() =>
		deletePassword.value.trim().length > 0 &&
		deleteConfirmationText.value.trim() === deletePhrase.value
);

const emailVerificationStatus = computed(() => {
	if (!props.user.account.email) return 'No email set';
	if (props.user.account.email_verified) return 'Verified';
	if (props.user.email_change_pending) return 'Pending email change';
	return 'Unverified';
});

const numberFormatter = new Intl.NumberFormat();
const formatPoints = (value?: number | null) => numberFormatter.format(Number(value || 0));
const formattedPoints = computed(() => formatPoints(points.value));

type CosmeticWithState = AvatarCosmetic & { state: 'selected' | 'available' | 'locked' };

const cosmetics = computed<CosmeticWithState[]>(() => {
	const state = avatarStore.userCosmetics.get(props.user.id);

	return avatarStore.allCosmetics.map((cosmetic) => {
		let cosmeticState: CosmeticWithState['state'] = 'locked';

		if (state?.current === cosmetic.key) {
			cosmeticState = 'selected';
		} else if (state?.unlocked.includes(cosmetic.key)) {
			cosmeticState = 'available';
		}

		return {
			...cosmetic,
			state: cosmeticState
		};
	});
});

const showCosmeticModal = ref(false);
const selectedCosmeticKey = ref<AvatarCosmetic['key'] | null>(null);
const purchaseLoadingStates = reactive(new Map<AvatarCosmetic['key'], boolean>());
const selectLoadingStates = reactive(new Map<AvatarCosmetic['key'], boolean>());
const resettingCosmetic = ref(false);
const isCosmeticsCollapsed = ref(false);

const selectedCosmeticForPurchase = computed(() => {
	if (!selectedCosmeticKey.value) return null;
	return cosmetics.value.find((cosmetic) => cosmetic.key === selectedCosmeticKey.value) || null;
});

const selectedPurchaseLoading = computed(() => {
	if (!selectedCosmeticForPurchase.value) return false;
	return Boolean(purchaseLoadingStates.get(selectedCosmeticForPurchase.value.key));
});

const selectedSelectLoading = computed(() => {
	if (!selectedCosmeticForPurchase.value) return false;
	return Boolean(selectLoadingStates.get(selectedCosmeticForPurchase.value.key));
});

let activitySearchTimeout: ReturnType<typeof setTimeout> | null = null;

function sanitize(obj: AccountState): AccountState {
	return {
		first_name: obj.first_name ? obj.first_name.trim() || '' : undefined,
		last_name: obj.last_name ? obj.last_name.trim() || '' : undefined,
		username: obj.username ? obj.username.trim() || '' : undefined,
		bio: obj.bio ? obj.bio.trim() || '' : undefined,
		email: obj.email ? obj.email.trim() || '' : undefined,
		address: obj.address ? obj.address.trim() || '' : undefined,
		country: obj.country ? obj.country.trim() || '' : undefined,
		phone_number: obj.phone_number ? obj.phone_number : undefined,
		visibility: obj.visibility
	};
}

function normalizeProfileState(obj: AccountState): AccountState {
	return {
		visibility: obj.visibility || 'UNLISTED',
		email: obj.email?.trim() || '',
		first_name: obj.first_name?.trim() || '',
		last_name: obj.last_name?.trim() || '',
		username: obj.username?.trim() || '',
		bio: obj.bio?.trim() || '',
		address: obj.address?.trim() || '',
		country: obj.country?.trim() || '',
		phone_number: obj.phone_number || 0
	};
}

function syncProfileStateFromUser() {
	state.visibility = props.user.account.visibility || 'UNLISTED';
	state.email = props.user.account.email || '';
	state.first_name = props.user.account.first_name || '';
	state.last_name = props.user.account.last_name || '';
	state.username = props.user.account.username || '';
	state.bio = props.user.account.bio || '';
	state.address = props.user.account.address || '';
	state.country = props.user.account.country || '';
	state.phone_number = props.user.account.phone_number || 0;

	initialProfileState.value = normalizeProfileState(state);
}

function syncFieldPrivacyStateFromUser() {
	const source = props.user.account.field_privacy;
	for (const item of fieldPrivacyItems) {
		fieldPrivacyState[item.key] = (source?.[item.key] || 'PRIVATE') as FieldPrivacyValue;
	}
}

function syncSubscribedFromUser() {
	subscribed.value = Boolean(props.user.account.subscribed);
}

function parseValueFromEvent(event: Event | CustomEvent<{ value?: string | null }>): string {
	const customEvent = event as CustomEvent<{ value?: string | null }>;
	const target = event.target as HTMLInputElement | null;
	const rawValue = customEvent.detail?.value ?? target?.value ?? '';
	return rawValue.toString();
}

const hasProfileChanges = computed(
	() =>
		JSON.stringify(normalizeProfileState(state)) !==
		JSON.stringify(normalizeProfileState(initialProfileState.value))
);

onMounted(() => {
	fetchAvatar();
	fetchUser();
	fetchPoints();
	avatarStore.fetchAllCosmetics();
	avatarStore.fetchCosmeticsForUser(props.user.id);
	syncProfileStateFromUser();
	syncFieldPrivacyStateFromUser();
	syncSubscribedFromUser();
	syncCurrentActivitiesFromUser();
	updateActivitiesList('');
});

watch(
	() => props.user.account,
	() => {
		syncProfileStateFromUser();
		syncFieldPrivacyStateFromUser();
		syncSubscribedFromUser();
	},
	{ deep: true }
);

onBeforeUnmount(() => {
	if (avatarOverride.value && avatarOverride.value.startsWith('blob:')) {
		URL.revokeObjectURL(avatarOverride.value);
	}

	if (activitySearchTimeout) {
		clearTimeout(activitySearchTimeout);
	}
});

async function regenerateProfilePhoto() {
	const yes = await Dialog.confirm({ message: 'Are you sure? You cannot revert this action.' });
	if (!yes.value) {
		await notifyWarning();
		return;
	}

	await impactMedium();

	avatarLoading.value = true;

	const res = await regenerateAvatar();
	if (res.success && res.data && res.data instanceof Blob) {
		if (avatarOverride.value && avatarOverride.value.startsWith('blob:')) {
			URL.revokeObjectURL(avatarOverride.value);
		}

		avatarOverride.value = URL.createObjectURL(res.data);
		fetchUser();

		avatarLoading.value = false;
		await notifySuccess();
		await Toast.show({
			text: 'Your profile photo has been successfully regenerated.',
			duration: 'long'
		});
	} else {
		avatarLoading.value = false;
		console.error(res.message || 'Failed to regenerate profile photo.');
		await notifyError();

		await Toast.show({
			text: res.message || 'Failed to regenerate profile photo.',
			duration: 'long'
		});
	}
}

async function saveProfile() {
	if (savingProfile.value || !hasProfileChanges.value) return;

	const normalizedCurrent = normalizeProfileState(state);
	const normalizedPrevious = normalizeProfileState(initialProfileState.value);

	if (normalizedCurrent.username !== normalizedPrevious.username) {
		const confirmed = await Dialog.confirm({
			title: 'Confirm Username Change',
			message:
				'Changing your username may affect links to your profile. Do you want to continue with this new username?'
		});

		if (!confirmed.value) {
			await notifyWarning();
			return;
		}

		await impactHeavy();
	}

	savingProfile.value = true;
	const payload = sanitize(state);

	const res = await updateAccount(payload);
	savingProfile.value = false;

	if (res.success) {
		Object.assign(props.user.account, {
			...props.user.account,
			...normalizedCurrent
		});
		initialProfileState.value = normalizedCurrent;
		await fetchUser(true);
		await notifySuccess();

		await Toast.show({
			text: 'Profile updated successfully.',
			duration: 'short'
		});
	} else {
		await notifyError();
		await Toast.show({
			text: res.data?.message || res.message || 'Failed to update profile.',
			duration: 'long'
		});
	}
}

async function requestEmailVerification() {
	if (requestingVerification.value) return;

	if (!props.user.account.email) {
		await notifyWarning();
		await Toast.show({
			text: 'Please add an email address before requesting verification.',
			duration: 'long'
		});
		return;
	}

	if (props.user.account.email_verified) {
		await selection();
		await Toast.show({
			text: 'Your email is already verified.',
			duration: 'short'
		});
		return;
	}

	if (props.user.email_change_pending) {
		await notifyWarning();
		await Toast.show({
			text: 'You have a pending email change. Please verify your new email address.',
			duration: 'long'
		});
		return;
	}

	requestingVerification.value = true;
	const res = await sendVerificationEmail();
	requestingVerification.value = false;

	if (res.success) {
		verificationModalOpen.value = true;
		await notifySuccess();
		await Toast.show({
			text: res.data?.message || 'A verification email has been sent.',
			duration: 'short'
		});
	} else {
		await notifyError();
		await Toast.show({
			text: res.message || 'Failed to send verification email.',
			duration: 'long'
		});
	}
}

function handleEmailVerified() {
	props.user.account.email_verified = true;
	if (authUser.value && authUser.value.id === props.user.id) {
		authUser.value.account.email_verified = true;
	}

	verificationModalOpen.value = false;
	void notifySuccess();
}

async function handleFieldPrivacyChange(key: FieldPrivacyKey, event: Event) {
	const nextValue = parseValueFromEvent(event) as FieldPrivacyValue;
	if (!nextValue || fieldPrivacyState[key] === nextValue || fieldPrivacyLoading[key]) return;

	const previousValue = fieldPrivacyState[key];
	fieldPrivacyState[key] = nextValue;
	fieldPrivacyLoading[key] = true;

	const res = await updateFieldPrivacy({ [key]: nextValue } as Partial<
		User['account']['field_privacy']
	>);
	fieldPrivacyLoading[key] = false;

	if (res.success) {
		props.user.account.field_privacy[key] = nextValue;
		await selection();
	} else {
		fieldPrivacyState[key] = previousValue;
		await notifyError();
		await Toast.show({
			text: res.message || 'Failed to update field privacy.',
			duration: 'long'
		});
	}
}

async function handleSubscriptionToggle(event: Event) {
	if (subscribedLoading.value) return;

	const customEvent = event as CustomEvent<{ checked?: boolean }>;
	const nextValue = Boolean(customEvent.detail?.checked);
	if (nextValue === subscribed.value) return;

	const previous = subscribed.value;
	subscribed.value = nextValue;
	subscribedLoading.value = true;

	const res = await updateAccount({ subscribed: nextValue });
	subscribedLoading.value = false;

	if (res.success) {
		props.user.account.subscribed = nextValue;
		await selection();
		await Toast.show({
			text: `Email notifications ${nextValue ? 'enabled' : 'disabled'}.`,
			duration: 'short'
		});
	} else {
		subscribed.value = previous;
		await notifyError();
		await Toast.show({
			text: res.message || 'Failed to update email notifications.',
			duration: 'long'
		});
	}
}

function isProviderLinked(provider: OAuthProvider): boolean {
	return Boolean(props.user.account.linked_providers?.includes(provider));
}

async function handleOAuthProvider(provider: OAuthProvider) {
	try {
		if (isProviderLinked(provider)) {
			const linkedProvidersCount = props.user.account.linked_providers?.length || 0;
			if (!props.user.account.has_password && linkedProvidersCount <= 1) {
				await notifyWarning();
				await Toast.show({
					text: 'You cannot unlink your only authentication method.',
					duration: 'long'
				});
				return;
			}

			const confirmed = await Dialog.confirm({
				title: `Disconnect ${capitalizeFully(provider)}`,
				message: 'Are you sure you want to disconnect this provider?'
			});
			if (!confirmed.value) {
				await notifyWarning();
				return;
			}

			await impactMedium();
			const unlinkUrl = new URL(
				`/api/auth/unlink-callback?provider=${provider}`,
				config.public.baseUrl
			).toString();
			await beginFlow(unlinkUrl, 'unlink');
			return;
		}

		await impactLight();
		const authUrl = authLink(provider);
		await beginFlow(authUrl, 'link');
	} catch (error: any) {
		await notifyError();
		await Toast.show({
			text: error?.message || 'Failed to start OAuth flow.',
			duration: 'long'
		});
	}
}

function handlePasswordChanged() {
	passwordModalOpen.value = false;
	void notifySuccess();
}

async function handleDeleteAccount() {
	if (!canDeleteAccount.value || deleteLoading.value) return;

	const firstConfirm = await Dialog.confirm({
		title: 'Delete Account',
		message: 'This action is irreversible. Do you want to continue?'
	});
	if (!firstConfirm.value) {
		await notifyWarning();
		return;
	}

	const secondConfirm = await Dialog.confirm({
		title: 'Final Confirmation',
		message: `Permanently delete @${props.user.username}?`
	});
	if (!secondConfirm.value) {
		await notifyWarning();
		return;
	}

	await impactHeavy();

	deleteLoading.value = true;
	const res = await deleteAccount(deletePassword.value);
	deleteLoading.value = false;

	if (res.success) {
		useCurrentSessionToken(null);
		const sessionCookie = useCookie('session_token');
		sessionCookie.value = null;

		await notifySuccess();
		await Toast.show({
			text: 'Your account has been deleted.',
			duration: 'long'
		});

		await refreshNuxtData();
		await navigateTo('/');
		return;
	}

	let message = res.message || 'Failed to delete account.';
	if (res.data && typeof res.data === 'object' && 'message' in res.data) {
		const apiMessage = res.data.message;
		if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
			message = apiMessage;
		}
	}

	await notifyError();
	await Toast.show({
		text: message,
		duration: 'long'
	});
}

function closeCosmeticModal() {
	showCosmeticModal.value = false;
	selectedCosmeticKey.value = null;
}

async function toggleCosmeticsCollapsed() {
	isCosmeticsCollapsed.value = !isCosmeticsCollapsed.value;
	await selection();
}

function handleCosmeticClick(cosmetic: CosmeticWithState) {
	if (cosmetic.state === 'selected') return;

	if (cosmetic.state === 'available') {
		void handleSelectClick(cosmetic.key);
		return;
	}

	selectedCosmeticKey.value = cosmetic.key;
	showCosmeticModal.value = true;
}

async function resetCosmetic() {
	if (resettingCosmetic.value) return;

	const current = avatarStore.userCosmetics.get(props.user.id)?.current;
	if (!current) {
		await selection();
		await Toast.show({
			text: 'No cosmetic is currently selected.',
			duration: 'short'
		});
		return;
	}

	resettingCosmetic.value = true;

	try {
		await impactLight();
		const res = await avatarStore.setCosmeticForUser(props.user.id, null);

		if (res.success) {
			avatarOverride.value = null;

			const avatarUrl = props.user.account.avatar_url;
			if (avatarUrl && avatarUrl.startsWith('http')) {
				avatarStore.clear(avatarUrl);
			}

			await Promise.all([fetchUser(true), fetchAvatar(), fetchPoints()]);
			await notifySuccess();
			await Toast.show({
				text: 'Cosmetic reset successfully.',
				duration: 'short'
			});
			return;
		}

		await notifyError();
		await Toast.show({
			text: res.message || 'Failed to reset cosmetic.',
			duration: 'long'
		});
	} catch (error: any) {
		await notifyError();
		await Toast.show({
			text: error?.message || 'Failed to reset cosmetic.',
			duration: 'long'
		});
	} finally {
		resettingCosmetic.value = false;
	}
}

async function handlePurchaseClick(cosmeticKey: AvatarCosmetic['key']) {
	if (purchaseLoadingStates.get(cosmeticKey)) return;

	purchaseLoadingStates.set(cosmeticKey, true);

	try {
		const res = await avatarStore.purchaseCosmetic(props.user.id, cosmeticKey);

		if (res.success) {
			await Promise.all([fetchPoints(), avatarStore.fetchCosmeticsForUser(props.user.id)]);
			await notifySuccess();
			await Toast.show({
				text: `${capitalizeFully(cosmeticKey.replaceAll('_', ' '))} purchased successfully.`,
				duration: 'short'
			});
			closeCosmeticModal();
			return;
		}

		await notifyError();
		await Toast.show({
			text: res.message || 'Failed to purchase cosmetic.',
			duration: 'long'
		});
	} catch (error: any) {
		await notifyError();
		await Toast.show({
			text: error?.message || 'Failed to purchase cosmetic.',
			duration: 'long'
		});
	} finally {
		purchaseLoadingStates.set(cosmeticKey, false);
	}
}

async function handleSelectClick(cosmeticKey: AvatarCosmetic['key']) {
	if (selectLoadingStates.get(cosmeticKey)) return;

	selectLoadingStates.set(cosmeticKey, true);

	try {
		const res = await avatarStore.setCosmeticForUser(props.user.id, cosmeticKey);

		if (res.success) {
			avatarOverride.value = null;

			const avatarUrl = props.user.account.avatar_url;
			if (avatarUrl && avatarUrl.startsWith('http')) {
				avatarStore.clear(avatarUrl);
			}

			await Promise.all([fetchUser(true), fetchAvatar(), fetchPoints()]);
			await notifySuccess();
			await Toast.show({
				text: 'Profile cosmetic updated.',
				duration: 'short'
			});
			closeCosmeticModal();
			return;
		}

		await notifyError();
		await Toast.show({
			text: res.message || 'Failed to select cosmetic.',
			duration: 'long'
		});
	} catch (error: any) {
		await notifyError();
		await Toast.show({
			text: error?.message || 'Failed to select cosmetic.',
			duration: 'long'
		});
	} finally {
		selectLoadingStates.set(cosmeticKey, false);
	}
}

// Activities

const allActivities = ref<ActivityOption[]>([]);
const currentActivities = ref<ActivityOption[]>([]);
const filteredActivities = ref<ActivityOption[]>([]);
const workingSelectedActivities = ref<string[]>([]);

const activitiesSearch = ref<string>('');
const activitiesLoading = ref(false);
const activitiesModal = ref<InstanceType<typeof IonModal> | null>(null);

const selectedActivitiesText = computed(() => {
	const count = currentActivities.value.length;
	if (count === 0) return '0 Items';
	if (count === 1) return currentActivities.value[0]?.label || '1 Item';
	return `${count} Items`;
});

function toActivityOption(activity: Activity): ActivityOption {
	return {
		label: activity.name,
		value: activity.id,
		icon: activity.fields['icon'] || 'material-symbols:activity-zone'
	};
}

function syncCurrentActivitiesFromUser() {
	const current = (props.user.activities || []).map(toActivityOption).filter(Boolean);
	currentActivities.value = current;
	filteredActivities.value = current.length > 0 ? current : filteredActivities.value;
	workingSelectedActivities.value = current.map((activity) => activity.value);

	if (allActivities.value.length === 0) {
		allActivities.value = current;
	}
}

watch(
	() => props.user?.activities,
	(newActivities) => {
		if (!newActivities) return;
		syncCurrentActivitiesFromUser();
	},
	{ deep: true }
);

async function updateActivitiesList(search: string) {
	activitiesSearch.value = search;
	activitiesLoading.value = true;

	const { fetchAll } = useActivities();
	try {
		const res = await fetchAll(-1, activitiesSearch.value);
		if (res.success) {
			const fetched = (res.data || []).map((activity: Activity) => toActivityOption(activity));
			const merged = [...allActivities.value, ...fetched];
			const uniqueById = new Map(merged.map((activity) => [activity.value, activity]));
			allActivities.value = [...uniqueById.values()];
			filterActivitiesList(activitiesSearch.value);
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
	const searchValue = parseValueFromEvent(event);

	filterActivitiesList(searchValue);

	if (activitySearchTimeout) {
		clearTimeout(activitySearchTimeout);
	}

	activitySearchTimeout = setTimeout(() => {
		updateActivitiesList(searchValue);
	}, 250);
}

function isActivityChecked(value: string): boolean {
	return workingSelectedActivities.value.includes(value);
}

function handleActivityCheckboxChange(event: CustomEvent<{ checked: boolean; value: string }>) {
	const { checked, value } = event.detail;
	if (!value) return;

	const selected = new Set(workingSelectedActivities.value);

	if (checked) {
		selected.add(value);
	} else {
		selected.delete(value);
	}

	workingSelectedActivities.value = [...selected];
}

function cancelActivityChanges() {
	// Reset working selection to current selection
	workingSelectedActivities.value = currentActivities.value.map((a) => a.value);
	activitiesModal.value?.$el?.dismiss();
}

async function confirmActivityChanges() {
	if (activitiesLoading.value) return;

	if (workingSelectedActivities.value.length === 0) {
		await Toast.show({
			text: 'Please select at least one activity.',
			duration: 'long'
		});
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
		const activities = (res.data.activities || []) as Activity[];
		props.user.activities = activities;

		const mapped = activities.map((activity: Activity) => toActivityOption(activity));
		currentActivities.value = mapped;
		allActivities.value = [
			...new Map([...allActivities.value, ...mapped].map((a) => [a.value, a])).values()
		];
		filteredActivities.value = [...allActivities.value];
		workingSelectedActivities.value = mapped.map((activity) => activity.value);

		await selection();
		await Toast.show({
			text: 'Your activities have been successfully updated.',
			duration: 'long'
		});

		activitiesModal.value?.$el?.dismiss();
	} else {
		console.error(res.data?.message || res.message || 'Failed to update activities.');
		await notifyError();

		await Toast.show({
			text: res.data?.message || res.message || 'Failed to update activities.',
			duration: 'long'
		});
	}
}
</script>

<style scoped>
* {
	--padding-start: 0;
	--padding-end: 0;
}

.select-fill-solid {
	--border-color: transparent;
	--background: var(--ion-color-background);
}

.cosmetics-collapse-enter-active,
.cosmetics-collapse-leave-active {
	transition:
		opacity 220ms ease,
		transform 220ms ease;
	transform-origin: top center;
}

.cosmetics-collapse-enter-from,
.cosmetics-collapse-leave-to {
	opacity: 0;
	transform: translateY(-6px) scaleY(0.98);
}

.cosmetics-collapse-enter-to,
.cosmetics-collapse-leave-from {
	opacity: 1;
	transform: translateY(0) scaleY(1);
}

@media (prefers-reduced-motion: reduce) {
	.cosmetics-collapse-enter-active,
	.cosmetics-collapse-leave-active {
		transition: none;
	}
}
</style>
