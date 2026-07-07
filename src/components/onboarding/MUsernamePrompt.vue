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
					name="mdi:account-edit-outline"
					class="size-12 text-primary"
				/>
				<h2 class="text-xl font-semibold m-0! text-center">Pick a Username</h2>
				<p class="text-sm text-center text-gray-700 dark:text-gray-200">
					We set one up for you. Keep it or choose your own; you can change it anytime in Settings.
				</p>

				<div class="w-full mt-2">
					<IonInput
						v-model="newUsername"
						label="Username"
						label-placement="stacked"
						fill="outline"
						:placeholder="placeholder"
						:counter="true"
						:maxlength="30"
						autocapitalize="off"
						autocomplete="username"
						@ionInput="error = ''"
					/>
					<p
						v-if="error"
						class="text-sm text-red-500 mt-2"
					>
						{{ error }}
					</p>
				</div>

				<IonButton
					expand="block"
					color="success"
					class="w-full mt-2"
					:disabled="saving || newUsername.trim().length === 0"
					@click="submit"
				>
					<IonSpinner
						v-if="saving"
						name="crescent"
						class="mr-2"
					/>
					<UIcon
						v-else
						name="mdi:check"
						class="size-5 mr-2"
					/>
					Save Username
				</IonButton>
				<IonButton
					expand="block"
					fill="clear"
					color="medium"
					size="small"
					:disabled="saving"
					@click="skip"
				>
					Keep This Username
				</IonButton>
			</div>
		</IonContent>
	</IonModal>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { usernameSchema } from 'schemas';
import {
	OAUTH_USERNAME_PROMPT_KEY,
	USERNAME_NO_SPACES_MESSAGE,
	usernameFromEmail,
	usernameHasWhitespace
} from '~/utils/username';

const props = defineProps<{
	autoOpen?: boolean;
}>();

const emit = defineEmits<{
	closed: [];
}>();

const open = ref(false);
const canDismiss = ref(true);
const saving = ref(false);
const error = ref('');
const newUsername = ref('');

const { user, updateAccount } = useAuth();
const authStore = useAuthStore();
const { notifySuccess, notifyError } = useAppHaptics();

// currentUser.account can be sparse on a fresh native oauth launch; read defensively
const currentUsername = computed(() => {
	const cu = authStore.currentUser;
	return cu?.account?.username || cu?.username || '';
});

const placeholder = computed(() => {
	if (currentUsername.value) return currentUsername.value;
	const email = authStore.currentUser?.account?.email || '';
	return usernameFromEmail(email) || 'username';
});

async function clearPending() {
	await Preferences.remove({ key: OAUTH_USERNAME_PROMPT_KEY }).catch(() => {});
}

async function submit() {
	if (saving.value) return;

	const candidate = newUsername.value.trim().toLowerCase();
	if (candidate.length === 0) {
		// empty input == keep the auto-generated username
		await skip();
		return;
	}

	if (usernameHasWhitespace(newUsername.value)) {
		error.value = USERNAME_NO_SPACES_MESSAGE;
		notifyError();
		return;
	}

	if (!usernameSchema.safeParse(candidate).success) {
		error.value =
			'Username must be 3-30 characters and only contain letters, numbers, underscores, dashes, or periods.';
		notifyError();
		return;
	}

	if (candidate === currentUsername.value) {
		await skip();
		return;
	}

	saving.value = true;
	// reuse the profile editor's update-username PATCH; never invent a new endpoint
	const res = await updateAccount({ username: candidate });
	saving.value = false;

	if (res.success) {
		// reflect the new username into the store so the UI updates immediately
		const cu = authStore.currentUser;
		if (cu) {
			cu.username = candidate;
			if (cu.account) cu.account.username = candidate;
		}
		notifySuccess();
		await clearPending();
		open.value = false;
		await Toast.show({ text: 'Username updated.', duration: 'short' }).catch(() => {});
		return;
	}

	notifyError();
	const message = res.data?.message || res.message || '';
	error.value = /taken|exists/i.test(message)
		? 'That username is already taken. Please choose another.'
		: 'Could not update your username. Please try again.';
}

async function skip() {
	await clearPending();
	open.value = false;
}

let closedEmitted = false;
function handleDidDismiss() {
	open.value = false;
	// dismissing without an explicit save keeps the auto username; drop the flag so
	// the prompt is one-shot
	void clearPending();
	if (closedEmitted) return;
	closedEmitted = true;
	emit('closed');
}

async function maybeOpen() {
	// only for fresh oauth signups; app.vue sets this flag on oauth-complete (context=signup)
	let pending = false;
	try {
		const { value } = await Preferences.get({ key: OAUTH_USERNAME_PROMPT_KEY });
		pending = value === 'true';
	} catch {
		// preferences read failed; treat as not-pending so we never block returning users
	}

	if (!pending || !user.value) {
		emit('closed');
		return;
	}

	open.value = true;
}

defineExpose({ maybeOpen });

onMounted(() => {
	if (props.autoOpen) void maybeOpen();
});
</script>
