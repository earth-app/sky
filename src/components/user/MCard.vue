<template>
	<div
		v-if="user"
		class="flex flex-col p-4 bg-gray-900 light:bg-gray-100 rounded-lg shadow-md border-2 border-gray-700 light:border-gray-300"
	>
		<div
			class="flex items-center hover:cursor-pointer"
			@click="navigateToProfile"
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

			<span class="text-sm font-medium mr-2">{{ handle }}</span>
			<span class="text-sm text-gray-500 light:text-gray-400 mr-2">@{{ user.username }}</span>

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
		</div>
		<div
			v-if="user.activities && user.activities.length > 0"
			class="flex gap-2 mt-4 flex-wrap"
		>
			<IonChip
				v-for="activity in user.activities"
				:key="activity.id"
				:router-link="`/tabs/activities/${activity.id}`"
				:label="activity.name"
				color="primary"
				class="flex items-center justify-center px-2 hover:cursor-pointer transition-all duration-500"
			>
				<UIcon
					:name="activity.fields['icon'] || 'mdi:earth'"
					class="min-w-6 min-h-6 mr-1"
				/>
				<span class="text-sm font-semibold">{{ activity.name }}</span>
			</IonChip>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { User } from 'types/user';

const router = useIonRouter();

const props = defineProps<{
	user: User;
}>();

const { avatar128, fetchAvatar, user: userState, chipColor, fetchUser } = useUser(props.user.id);
const { handle } = useDisplayName(props.user);

const user = computed(() => userState.value || props.user);

onMounted(() => {
	fetchUser();
	fetchAvatar();
});

function navigateToProfile() {
	if (user.value) {
		router.push(`/tabs/profile/${user.value.id}`);
	}
}
</script>
