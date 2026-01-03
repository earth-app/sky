<template>
	<div class="flex flex-col size-full">
		<div class="grid grid-cols-2 justify-items-center items-center px-4 mt-6">
			<div class="flex flex-col items-center justify-evenly self-start py-4">
				<UAvatar
					:src="avatar"
					class="size-24 shadow-lg rounded-full shadow-black/70"
				/>
				<UserMFriendsButtons :user="user" />
				<UserMFriendsCount :user="user" />
			</div>
			<div class="flex items-center">
				<div class="flex flex-col">
					<h2 class="text-lg! my-0!">{{ name }}</h2>
					<h3 class="text-sm! my-0! text-gray-600 light:text-gray-400">{{ user.username }}</h3>
					<UserMTypeBadge
						:user="user"
						class="mt-4"
					/>
					<UserMJourneys
						:user="user"
						class="m-2"
					/>
				</div>
			</div>
		</div>
		<div class="flex flex-col items-center justify-center mt-6 px-4">
			<div class="flex mb-4">
				<UBadge
					v-if="props.user.account.email && props.user.account.email_verified"
					:label="props.user.account.email"
					variant="subtle"
					icon="mdi:mail-ru"
					class="mr-2 hover:cursor-pointer"
					@click="openEmail"
				/>
				<UBadge
					v-if="props.user.account.address"
					:label="props.user.account.address"
					variant="subtle"
					icon="mdi:map-marker"
					color="warning"
					class="mr-2"
				/>
				<UBadge
					v-if="props.user.account.country"
					:label="props.user.account.country"
					variant="subtle"
					icon="mdi:flag"
					color="info"
					class="mr-2"
				/>
			</div>
			<div class="flex items-center justify-center flex-wrap max-w-80">
				<UBadge
					v-for="(activity, i) in props.user.activities"
					:label="activity.name"
					:color="i <= 2 ? 'primary' : 'secondary'"
					:icon="activity.fields['icon']"
					variant="solid"
					@click="$router.push(`/tabs/activities/${activity.id}`)"
					:ui="{
						base: 'text-sm md:text-base lg:text-lg px-1 sm:px-1.5 md:px-2.5 py-1 gap-1 md:gap-1.5 rounded-sm sm:rounded-md',
						leadingIcon: 'size-4 sm:size-5 md:size-6'
					}"
					class="hover:cursor-pointer transition-all duration-500 ml-2 mb-2 sm:mb-3"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { User } from '@earth-app/crust/src/shared/types/user';

const props = defineProps<{
	user: User;
}>();

const { avatar, fetchUser } = useUser(props.user.id);
const { name } = useDisplayName(props.user);

async function openEmail() {
	const email = props.user.account.email;
	if (email) {
		window.open(`mailto:${email}`, '_blank');
	}
}
</script>
