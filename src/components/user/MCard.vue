<template>
	<div
		class="flex flex-col p-4 bg-gray-900 light:bg-gray-100 rounded-lg shadow-md border-2 border-gray-700 light:border-gray-300"
	>
		<div class="flex items-center">
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
				v-for="(activity, i) in user.activities"
				:key="activity.id"
				:router-link="`/tabs/activities/${activity.id}`"
				:label="activity.name"
				:icon="activity.fields['icon'] || 'mdi:earth'"
				:variant="badgeVariants[i] || 'subtle'"
				@mouseenter="badgeVariants[i] = 'solid'"
				@mouseleave="badgeVariants[i] = 'subtle'"
				class="hover:cursor-pointer transition-all duration-500"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { User } from '@earth-app/crust/src/shared/types/user';

const badgeVariants = ref<('subtle' | 'solid')[]>([]);

const props = defineProps<{
	user: User;
}>();

const { avatar128, user, chipColor } = useUser(props.user.id);
const { handle } = useDisplayName(props.user);
</script>
