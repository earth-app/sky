<template>
	<MSurface
		v-if="user"
		:elevation="1"
	>
		<div
			class="flex min-h-11 flex-wrap items-center hover:cursor-pointer"
			role="button"
			tabindex="0"
			:aria-label="`View ${handle}'s Profile`"
			@click="navigateToProfile"
			@keydown.enter.prevent="navigateToProfile"
			@keydown.space.prevent="navigateToProfile"
		>
			<UChip
				:color="chipColor"
				inset
				class="mr-2"
			>
				<UAvatar
					:src="avatar128 || '/earth-app.png'"
					alt="User Avatar"
					class="w-8 h-8 rounded-full object-cover"
				/>
			</UChip>

			<span
				v-if="hasFullName"
				class="text-sm font-medium mr-2"
				>{{ fullName }}</span
			>
			<span class="text-sm text-muted mr-2">@{{ user.username }}</span>

			<div class="flex flex-wrap gap-2 my-2">
				<IonChip
					v-if="user.is_in_my_circle"
					color="warning"
					class="px-2 py-1 font-semibold self-center"
				>
					<UIcon
						name="mdi:account-group"
						class="inline-block mr-1 size-6"
					/>
					In Your Circle
				</IonChip>
				<IonChip
					v-else-if="user.is_mutual"
					color="success"
					class="px-2 py-1 font-semibold self-center"
				>
					<UIcon
						name="mdi:account-multiple-check"
						class="inline-block mr-1 size-6"
					/>
					Mutual</IonChip
				>

				<IonChip
					v-if="props.user.id === currentUser?.id"
					color="primary"
					class="px-2 py-1 font-semibold self-center"
				>
					<UIcon
						name="mdi:account-check"
						class="inline-block mr-1 size-6"
					/>
					You
				</IonChip>

				<IonChip
					v-if="user.is_admin"
					color="danger"
					class="px-2 py-1 font-semibold self-center"
				>
					<UIcon
						name="mdi:shield-crown-outline"
						class="inline-block mr-1 size-6"
					/>
					Admin
				</IonChip>
			</div>
		</div>
		<div
			v-if="(activities ?? true) && user.activities && user.activities.length > 0"
			class="flex gap-2 mt-4 flex-wrap"
		>
			<IonChip
				v-for="(activity, i) in user.activities"
				:key="activity.id"
				:router-link="`/tabs/activities/${activity.id}`"
				:color="i < 2 ? 'warning' : 'primary'"
				role="link"
				tabindex="0"
				:aria-label="`Open the ${activity.name} Activity`"
				class="flex items-center justify-center px-2 min-h-11 hover:cursor-pointer transition-all duration-500"
				@keydown.enter.prevent="activateSelf"
				@keydown.space.prevent="activateSelf"
			>
				<UIcon
					:name="activity.fields['icon'] || 'mdi:earth'"
					class="min-w-6 min-h-6 mr-1"
				/>
				<span class="text-sm font-semibold">{{ activity.name }}</span>
			</IonChip>
		</div>
	</MSurface>
</template>

<script setup lang="ts">
import type { User } from 'types/user';

const router = useIonRouter();

const props = defineProps<{
	user: User;
	activities?: boolean;
}>();

const { user: currentUser } = useAuth();
const { avatar128, fetchAvatar, user: userState, chipColor, fetchUser } = useUser(props.user.id);

const user = computed(() => userState.value || props.user);

// read off the resolved user, not the prop snapshot, so the name always belongs to the username
// rendered beside it; `handle` falls back to @username, so it can only carry the aria label
const { handle, fullName, hasFullName } = useDisplayName(() => user.value);

onMounted(() => {
	fetchUser();
	fetchAvatar();
});

function navigateToProfile() {
	if (user.value) {
		router.push(`/tabs/profile/${user.value.id}`);
	}
}

// ion-chip has no keyboard activation of its own; a synthetic click drives its routerLink
function activateSelf(event: KeyboardEvent) {
	(event.currentTarget as HTMLElement | null)?.click();
}
</script>
